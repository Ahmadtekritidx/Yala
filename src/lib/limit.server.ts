import { getRequestHeader } from "@tanstack/react-start/server";
import { rpc, sha256, storeConfigured } from "./store.server";

// Set at build time in vite.config.ts: true for the Vercel build, false for Lovable/Cloudflare and local dev.
declare const __VERCEL__: boolean;

// The visitor's IP, read only from the header our host sets itself.
// On Vercel any client can send its own cf-connecting-ip, so trust x-real-ip there;
// on Cloudflare the client can prepend to x-forwarded-for, so trust cf-connecting-ip there.
export function clientIp() {
  const ip = __VERCEL__
    ? getRequestHeader("x-real-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]
    : getRequestHeader("cf-connecting-ip");
  return (ip || "anon").trim();
}

const MAX_IPS = 5000;
const buckets = new Map<string, Map<string, number[]>>();

// Counts one request for this visitor. Resolves to 0 when allowed, otherwise the minutes until they can try again.
// With the shared store configured the count lives in the database, so it holds across server instances
// and restarts (a fixed window per visitor, keyed by a hash of the IP, never the raw IP).
// Without it, or if the database does not answer in time, the per-instance memory limit below is used.
export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<number> {
  if (storeConfigured()) {
    const shared = await rpc<number>("hit_rate_limit", {
      p_key: await sha256(`${bucket}:${clientIp()}`),
      p_limit: limit,
      p_window_seconds: Math.round(windowMs / 1000),
    });
    if (typeof shared === "number") return shared;
  }
  return memoryRateLimit(bucket, limit, windowMs);
}

function memoryRateLimit(bucket: string, limit: number, windowMs: number): number {
  let hits = buckets.get(bucket);
  if (!hits) buckets.set(bucket, (hits = new Map()));
  const ip = clientIp(),
    now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit)
    return Math.max(1, Math.ceil((windowMs - (now - recent[0]!)) / 60000));
  recent.push(now);
  // Re-insert so the map stays ordered from least to most recently seen.
  hits.delete(ip);
  hits.set(ip, recent);
  if (hits.size > MAX_IPS) {
    for (const [k, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(k);
    // Still full: forget the visitors seen longest ago, never everyone at once.
    for (const k of hits.keys()) {
      if (hits.size <= MAX_IPS * 0.8) break;
      hits.delete(k);
    }
  }
  return 0;
}
