// "Did you go?" (docs/ai/compose-plans.md, Step 7 feedback): when someone picks a plan, remember it;
// on a later visit, once the plan's day has passed, ask once whether they went. A plan can look good
// on screen and still disappoint in real life, and this is the only way to find out.
// Stored in this browser only; the answer goes to the event log.

const KEY = "yalla:didyougo";

export type PendingAsk = { code: string; title: string; day: string; date: string; runId?: string };

/** Remember a picked plan to ask about later. `date` is the plan's day, YYYY-MM-DD. */
export function rememberPick(a: PendingAsk) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* blocked storage: no question later, nothing breaks */
  }
}

/** The plan to ask about now: picked earlier, and its day is over. */
export function dueAsk(now = new Date()): PendingAsk | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "null") as PendingAsk | null;
    if (!a?.date) return null;
    const after = new Date(a.date + "T23:59:59");
    return now > after ? a : null;
  } catch {
    return null;
  }
}

/** Never ask about this plan again. */
export function clearAsk() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** YYYY-MM-DD in local time. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
