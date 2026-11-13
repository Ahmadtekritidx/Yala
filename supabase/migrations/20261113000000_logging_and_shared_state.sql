-- Yalla: AI-call log, product-event log, shared rate limits and shared cache.
-- Run once on the project's Postgres (Lovable Cloud / Supabase: SQL editor, or `supabase db push`).
-- The app reaches these with the service role key from the server only. Row level security is on
-- with no policies, so the public (anon) key and signed-in users can read or write nothing here.

-- 1. One row per Claude call ------------------------------------------------------------------
create table if not exists public.ai_calls (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  run_id             uuid,              -- joins the call to the events of the same plan request
  feature            text not null,     -- plans, reel, status...
  model              text,              -- the model that answered (can differ after a fallback)
  effort             text,
  prompt_version     text,              -- bump in code when a prompt changes
  prompt_hash        text,              -- sha256 of the full prompt (the prompt itself is not stored)
  prompt_chars       integer,
  input_text         text,              -- the user's own words, for building eval items
  ok                 boolean not null,
  error_kind         text,
  error              text,
  stop_reason        text,
  latency_ms         integer,
  input_tokens       integer,
  output_tokens      integer,
  cache_read_tokens  integer,
  cache_write_tokens integer,
  cost_usd           numeric(12, 6),    -- estimate from src/lib/pricing.ts
  output             jsonb              -- the model's structured answer
);
create index if not exists ai_calls_created_at on public.ai_calls (created_at);
create index if not exists ai_calls_run_id on public.ai_calls (run_id);
create index if not exists ai_calls_feature on public.ai_calls (feature, created_at);

-- 2. One row per product event -------------------------------------------------------------------
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,            -- see EVENT_NAMES in src/lib/track.ts
  run_id      uuid,
  device_id   uuid,                     -- random id made in the browser, not linked to a person
  props       jsonb not null default '{}'::jsonb
);
create index if not exists events_created_at on public.events (created_at);
create index if not exists events_name on public.events (name, created_at);
create index if not exists events_run_id on public.events (run_id);

-- 3. Shared rate limits (fixed window per visitor and bucket; the key is a hash, never a raw IP) ----
create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  hits          integer not null
);

-- Counts one hit. Returns 0 when allowed, otherwise the minutes until the window resets.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_hits integer;
  v_start timestamptz;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start <= now() - v_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start <= now() - v_window then now() else r.window_start end
  returning hits, window_start into v_hits, v_start;
  if v_hits > p_limit then
    return greatest(1, ceil(extract(epoch from (v_start + v_window - now())) / 60))::integer;
  end if;
  return 0;
end;
$$;

-- 4. Shared cache (Google search results, Instagram handles) --------------------------------------
create table if not exists public.kv_cache (
  key         text primary key,
  value       jsonb,
  expires_at  timestamptz not null
);
create index if not exists kv_cache_expires_at on public.kv_cache (expires_at);

-- Housekeeping: drop expired cache rows and old rate-limit windows. Safe to run any time;
-- schedule it daily with pg_cron if available: select cron.schedule('yalla-purge', '17 3 * * *', 'select public.purge_expired()');
create or replace function public.purge_expired()
returns void
language sql
set search_path = public
as $$
  delete from kv_cache where expires_at < now();
  delete from rate_limits where window_start < now() - interval '2 days';
$$;

-- 5. Lock everything to the server --------------------------------------------------------------
alter table public.ai_calls    enable row level security;
alter table public.events      enable row level security;
alter table public.rate_limits enable row level security;
alter table public.kv_cache    enable row level security;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
grant execute on function public.purge_expired() to service_role;

-- 6. Ready-made views for the questions we ask most -----------------------------------------------
-- One row per plan request: what it cost, how long it took, and what the user did with it.
create or replace view public.plan_runs with (security_invoker = true) as
select
  g.run_id,
  g.created_at,
  g.name = 'plans_generated'                                         as ok,
  g.props ->> 'q'                                                    as request,
  (g.props ->> 'latency_ms')::integer                                as latency_ms,
  coalesce(c.calls, 0)                                               as ai_calls,
  c.cost_usd,
  coalesce(e.shown, false)                                           as shown,
  coalesce(e.picked, false)                                          as picked,
  coalesce(e.swaps, 0)                                               as swaps,
  coalesce(e.removals, 0)                                            as removals,
  coalesce(e.adds, 0)                                                as adds
from public.events g
left join (
  select run_id, count(*) as calls, sum(cost_usd) as cost_usd
  from public.ai_calls group by run_id
) c using (run_id)
left join (
  select run_id,
         bool_or(name = 'plans_shown')     as shown,
         bool_or(name = 'plan_picked')     as picked,
         count(*) filter (where name = 'stop_swapped') as swaps,
         count(*) filter (where name = 'stop_removed') as removals,
         count(*) filter (where name = 'stop_added')   as adds
  from public.events group by run_id
) e using (run_id)
where g.name in ('plans_generated', 'plans_failed');

-- The product numbers from the PRD, per day.
create or replace view public.daily_metrics with (security_invoker = true) as
select
  date_trunc('day', created_at)::date                                   as day,
  count(*) filter (where ok)                                            as plan_requests_ok,
  count(*) filter (where not ok)                                        as plan_requests_failed,
  round(avg(picked::int) filter (where shown) * 100, 1)                 as picked_plan_rate_pct,
  round(avg(cost_usd) filter (where ok), 4)                             as avg_cost_per_request_usd,
  percentile_cont(0.95) within group (order by latency_ms)              as p95_latency_ms,
  round(avg((swaps + removals > 0)::int) filter (where shown) * 100, 1) as edited_rate_pct
from public.plan_runs
group by 1
order by 1 desc;

revoke all on public.plan_runs, public.daily_metrics from anon, authenticated;
