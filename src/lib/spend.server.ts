// Daily spending cap and alerts (docs/ai/compose-plans.md, Step 8).
// Today's AI spend comes from the ai_calls log (supabase/migrations/20261118000000_daily_spend.sql).
// At 50% and 80% of the cap an alert is recorded (a "spend_alert" event and a server log line);
// at 100% the planner stops calling AI for the rest of the day and serves its plain "quick version".
// Without the database configured there is no shared spend figure, so no cap applies.
import { kvGet, kvSet, rpc, storeConfigured } from "./store.server";
import { logEvents } from "./log.server";

export const DAILY_CAP_USD = Number(process.env["YALLA_DAILY_CAP_USD"] ?? 20);
const ALERTS = [0.5, 0.8, 1];
const CHECK_EVERY_MS = 60e3;

let last: { at: number; usd: number } | null = null;
const alerted = new Set<string>();

/** Today's AI spend in US dollars, checked at most once a minute; null when unknown. */
export async function spentToday(): Promise<number | null> {
  if (!storeConfigured()) return null;
  if (last && Date.now() - last.at < CHECK_EVERY_MS) return last.usd;
  const usd = await rpc<number | string>("spend_today", {});
  const n = typeof usd === "string" ? Number(usd) : usd;
  if (typeof n !== "number" || Number.isNaN(n)) return last?.usd ?? null;
  last = { at: Date.now(), usd: n };
  return n;
}

async function alertOnce(usd: number) {
  const day = new Date().toISOString().slice(0, 10);
  for (const share of ALERTS) {
    if (usd < DAILY_CAP_USD * share) continue;
    const key = `spend-alert:${day}:${share}`;
    if (alerted.has(key) || (await kvGet<boolean>(key))) continue;
    alerted.add(key);
    await kvSet(key, true, 2 * 24 * 3600e3);
    console.warn(
      `[yalla] AI spend today $${usd.toFixed(2)} reached ${share * 100}% of the $${DAILY_CAP_USD} cap`,
    );
    await logEvents([
      {
        name: "spend_alert",
        run_id: null,
        device_id: null,
        props: { share, usd: Math.round(usd * 100) / 100, cap: DAILY_CAP_USD },
      },
    ]).catch(() => {});
  }
}

/** True once today's AI spend has reached the cap. Records the 50%, 80% and 100% alerts once each. */
export async function overDailyCap(): Promise<boolean> {
  const usd = await spentToday();
  if (usd === null) return false;
  await alertOnce(usd);
  return usd >= DAILY_CAP_USD;
}
