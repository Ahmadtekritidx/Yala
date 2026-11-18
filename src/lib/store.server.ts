// Shared storage for logs, rate limits and caches: a Postgres database reached through
// Supabase's REST API (PostgREST). Works with Lovable Cloud or any Supabase project.
//
// Switched on by two server secrets:
//   SUPABASE_URL               e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  the service role key (server only, never sent to the browser)
// Without them every call here is a no-op and callers fall back to memory, so the app keeps working.
// Tables and functions: supabase/migrations/20261113000000_logging_and_shared_state.sql

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
const base = () => env("SUPABASE_URL")?.replace(/\/+$/, "");
const key = () => env("SUPABASE_SERVICE_ROLE_KEY");

export const storeConfigured = () => !!(base() && key());

// Short timeout: logging and limits must never make a plan slow.
const TIMEOUT_MS = 2500;

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const k = key()!;
  const { prefer, ...rest } = init;
  return fetch(`${base()}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: k,
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

let lastStoreError = "";
export const storeStatus = () => ({ configured: storeConfigured(), lastError: lastStoreError });
function fail(where: string, e: unknown) {
  lastStoreError = `${where}: ${String(e).slice(0, 200)}`;
  console.error("store", lastStoreError);
}

// For /status: can we reach the database and read the cache table (i.e. the migration ran)?
export async function storePing(): Promise<{ configured: boolean; ok: boolean; error: string }> {
  if (!storeConfigured())
    return {
      configured: false,
      ok: false,
      error:
        "Not connected. Logs go to the server log only and limits reset on restart. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  try {
    const res = await rest("kv_cache?select=key&limit=1");
    if (res.ok) return { configured: true, ok: true, error: lastStoreError };
    return {
      configured: true,
      ok: false,
      error: `${res.status} ${(await res.text()).slice(0, 160)} (did the migration in supabase/migrations run?)`,
    };
  } catch (e) {
    return { configured: true, ok: false, error: String(e).slice(0, 200) };
  }
}

// Appends rows to a table. Never throws: a failed write only loses that log line.
export async function insertRows(table: string, rows: object[]): Promise<boolean> {
  if (!storeConfigured() || !rows.length) return false;
  try {
    const res = await rest(table, {
      method: "POST",
      body: JSON.stringify(rows),
      prefer: "return=minimal",
    });
    if (!res.ok) {
      fail(table, `${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    fail(table, e);
    return false;
  }
}

// Calls a Postgres function. Returns undefined when the store is off or the call failed.
export async function rpc<T>(fn: string, args: object): Promise<T | undefined> {
  if (!storeConfigured()) return undefined;
  try {
    const res = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
    if (!res.ok) {
      fail(fn, `${res.status} ${(await res.text()).slice(0, 200)}`);
      return undefined;
    }
    return (await res.json()) as T;
  } catch (e) {
    fail(fn, e);
    return undefined;
  }
}

// Shared cache. undefined = not cached (or store off); null is a real cached value.
export async function kvGet<T>(k: string): Promise<T | undefined> {
  if (!storeConfigured()) return undefined;
  try {
    const res = await rest(
      `kv_cache?select=value&key=eq.${encodeURIComponent(k)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    );
    if (!res.ok) {
      fail("kv_cache read", res.status);
      return undefined;
    }
    const rows = (await res.json()) as { value: T }[];
    return rows.length ? rows[0]!.value : undefined;
  } catch (e) {
    fail("kv_cache read", e);
    return undefined;
  }
}

export async function kvSet(k: string, value: unknown, ttlMs: number): Promise<void> {
  if (!storeConfigured()) return;
  try {
    const res = await rest("kv_cache?on_conflict=key", {
      method: "POST",
      body: JSON.stringify([
        { key: k, value, expires_at: new Date(Date.now() + ttlMs).toISOString() },
      ]),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    if (!res.ok) fail("kv_cache write", res.status);
  } catch (e) {
    fail("kv_cache write", e);
  }
}

// One-way hash, so the database never holds raw IP addresses or full prompts.
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
