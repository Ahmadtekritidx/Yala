// D2: build routes that follow every planning rule (docs/ai/compose-plans.md, Step 2).
// A beam search over the scored places: each step adds one stop that is open on arrival, inside
// the time window, within the drive limit, at a sensible meal time, never two meals in a row,
// never a category twice, never a place twice. The result is about 10 valid routes that differ,
// for the AI to choose from (D3), and the code-only fallback when the AI is unavailable (D5).
// Pure, so it is unit tested in tests/compose-routes.test.ts.
import { driveMins, type Category, type Place } from "../places.ts";
import { arrivalAfter, fits, type Rules } from "../alternatives.ts";
import {
  MEAL_GAP_MINUTES,
  PACE_STOPS,
  ROAD_TRIP_MAX_DRIVE_SHARE,
  SUNSET_ARRIVE_BY,
  SUNSET_ARRIVE_FROM,
  isMeal,
  mealTimeOk,
} from "../rules.ts";

export type RouteContext = {
  rules: Rules;
  /** Window in minutes from midnight. */
  start: number;
  end: number;
  pace: "Chill" | "Packed";
  maxDrive: number;
  roadTrip: boolean;
  /** Local sunset, minutes from midnight. */
  sunset: number;
  /** The user asked for a sunset: then a sea view stop must be just before it. */
  wantsSunset: boolean;
  /** Categories the user asked for; routes that cover them rank higher. */
  want: Category[];
  savedIds: Set<string>;
  scores: Map<string, number>;
};

export type RouteStop = { place: Place; time: number };
export type Route = { stops: RouteStop[]; score: number; drive: number; wait: number };

const BEAM = 160;
const CANDIDATES = 70;
const MAX_WAIT = 90; // minutes a stop may wait for opening or a meal window
const STEP = 15;

/** The earliest arrival at `p`, from `ready` on, that keeps every rule; null when none within MAX_WAIT. */
export function arrivalFor(p: Place, ready: number, ctx: RouteContext): number | null {
  for (let at = ready; at <= ready + MAX_WAIT; at += STEP) {
    if (at > ctx.end) return null;
    if (!fits(p, at, ctx.rules)) continue;
    if (isMeal(p.cat) && !mealTimeOk(at)) continue;
    if (
      ctx.wantsSunset &&
      p.cat === "Sea view" &&
      (at < ctx.sunset - SUNSET_ARRIVE_FROM || at > ctx.sunset - SUNSET_ARRIVE_BY)
    )
      continue;
    return at;
  }
  return null;
}

/** How many of the asked-for categories a route covers. A mountain view counts for a hike. */
export function coverage(stops: RouteStop[], want: Category[]) {
  const cats = new Set(stops.map((st) => st.place.cat));
  return want.filter((c) => cats.has(c) || (c === "Hike" && cats.has("Scenic stop"))).length;
}

function routeScore(stops: RouteStop[], drive: number, wait: number, ctx: RouteContext) {
  let s = stops.reduce((a, st) => a + (ctx.scores.get(st.place.id) ?? 0), 0);
  const cats = new Set(stops.map((st) => st.place.cat));
  // What the user asked for weighs more than a slightly better rating (A11: everything asked appears).
  s += coverage(stops, ctx.want) * 2;
  s += stops.filter((st) => ctx.savedIds.has(st.place.id)).length * 1.5;
  if (ctx.wantsSunset && cats.has("Sea view")) s += 1;
  return s - drive * 0.015 - wait * 0.005;
}

/** Every valid route, best first. */
export function buildRoutes(pool: Place[], ctx: RouteContext): Route[] {
  const [lo, hi] = PACE_STOPS[ctx.pace];
  const start = Math.ceil(ctx.start / STEP) * STEP;
  const byScore = (a: Place, b: Place) => (ctx.scores.get(b.id) ?? 0) - (ctx.scores.get(a.id) ?? 0);
  const visits = pool.filter((p) => p.cat !== "Stay").sort(byScore);
  const saved = visits.filter((p) => ctx.savedIds.has(p.id));
  const cands = [...new Set([...saved, ...visits.slice(0, CANDIDATES)])];

  let beam: Route[] = [{ stops: [], score: 0, drive: 0, wait: 0 }];
  const done: Route[] = [];
  for (let depth = 0; depth < hi; depth++) {
    const next: Route[] = [];
    for (const r of beam) {
      const last = r.stops.at(-1);
      for (const p of cands) {
        if (r.stops.some((st) => st.place.id === p.id || st.place.cat === p.cat)) continue;
        if (last && isMeal(last.place.cat) && isMeal(p.cat)) continue;
        const leg = last ? driveMins(last.place, p) : 0;
        if (leg > ctx.maxDrive) continue;
        const ready = last ? arrivalAfter(last.time, last.place, p) : start;
        const at = arrivalFor(p, ready, ctx);
        if (at === null) continue;
        if (
          isMeal(p.cat) &&
          r.stops.some((st) => isMeal(st.place.cat) && at - st.time < MEAL_GAP_MINUTES)
        )
          continue;
        const stops = [...r.stops, { place: p, time: at }];
        const drive = r.drive + leg;
        const wait = r.wait + (at - ready);
        if (ctx.roadTrip && drive > (ctx.end - ctx.start) * ROAD_TRIP_MAX_DRIVE_SHARE) continue;
        next.push({ stops, drive, wait, score: routeScore(stops, drive, wait, ctx) });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, BEAM);
    if (depth + 1 >= lo) done.push(...beam);
    if (!beam.length) break;
  }
  // Routes with everything asked for come first, then the best scored.
  return done.sort(
    (a, b) => coverage(b.stops, ctx.want) - coverage(a.stops, ctx.want) || b.score - a.score,
  );
}

/** Up to `n` routes that share as few places as possible (saved places don't count as shared). */
function diverse(from: Route[], n: number, savedIds: Set<string>): Route[] {
  const shape = (r: Route) => r.stops.map((st) => st.place.cat).join();
  let best: Route[] = [];
  for (const maxShared of [0, 1, 2]) {
    const kept: Route[] = [];
    for (const r of from) {
      const ids = new Set(r.stops.map((st) => st.place.id).filter((id) => !savedIds.has(id)));
      const ok = kept.every(
        (k) =>
          k.stops.filter((st) => ids.has(st.place.id)).length <= maxShared &&
          // The first 3 kept should not repeat the same order of categories when we can avoid it.
          !(maxShared === 0 && kept.length < 3 && shape(k) === shape(r)),
      );
      if (ok) kept.push(r);
      if (kept.length >= n) return kept;
    }
    if (kept.length > best.length) best = kept;
    if (kept.length >= Math.min(n, 3)) return kept;
  }
  return best;
}

/**
 * Up to `n` routes for the AI to choose from, best first. Routes with a saved place come first when
 * there are any, then those covering everything the user asked for, and only then variety: a
 * requested sea view beats three plans that share nothing.
 */
export function pickDiverse(
  routes: Route[],
  n = 10,
  savedIds: Set<string> = new Set(),
  want: Category[] = [],
): Route[] {
  const withSaved = routes.filter((r) => r.stops.some((st) => savedIds.has(st.place.id)));
  const from = withSaved.length ? withSaved : routes;
  const top = Math.max(0, ...from.map((r) => coverage(r.stops, want)));
  const full = from.filter((r) => coverage(r.stops, want) === top);
  const kept = diverse(full, n, savedIds);
  if (kept.length >= n) return kept;
  const rest = diverse(
    from.filter((r) => !full.includes(r)),
    n - kept.length,
    savedIds,
  );
  return [...kept, ...rest];
}

/** For an overnight plan: the best Stay reachable after the last stop, or null. */
export function addStay(route: Route, pool: Place[], ctx: RouteContext): Route {
  const last = route.stops.at(-1);
  if (!last) return route;
  const stay = pool
    .filter((p) => p.cat === "Stay" && driveMins(last.place, p) <= Math.max(ctx.maxDrive, 45))
    .sort((a, b) => (ctx.scores.get(b.id) ?? 0) - (ctx.scores.get(a.id) ?? 0))[0];
  if (!stay) return route;
  const time = arrivalAfter(last.time, last.place, stay);
  return { ...route, stops: [...route.stops, { place: stay, time }] };
}
