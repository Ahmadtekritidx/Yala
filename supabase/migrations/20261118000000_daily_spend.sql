-- Yalla: today's AI spend, for the daily spending cap and alerts (docs/ai/compose-plans.md, Step 8).
-- Run after 20261113000000_logging_and_shared_state.sql. Called by the server with the service role key.

create or replace function public.spend_today()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from ai_calls
  where created_at >= date_trunc('day', now());
$$;

revoke all on function public.spend_today() from public, anon, authenticated;
grant execute on function public.spend_today() to service_role;
