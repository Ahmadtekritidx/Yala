// Which places may replace a stop (Swap) or extend a plan (Add), under the same rules the
// planner follows: open at that time, not a category the user avoids, within budget, and
// matching their diet. Pure, so it is unit tested in tests/alternatives.test.ts.
// Imports carry the .ts extension so that test runs in plain Node.
import { driveMins, type Category, type Place } from "./places.ts";
import { hoursOn, openAt } from "./hours.ts";

export type Rules = {
  /** Weekday the plan runs on, e.g. "Saturday". */
  day: string;
  /** Highest price level allowed (1-3), or 0 for any. */
  budget: number;
  /** Categories the user is not into, e.g. ["Hike"]. */
  avoid: string[];
  /** "vegan" | "vegetarian" | "halal" | "gluten free", or "" for none. */
  diet: string;
};

const MEALS = new Set<Category>(["Breakfast", "Brunch", "Lunch", "Dinner"]);
const DIETS = /^(vegan|vegetarian|halal|gluten free)$/i;

/** The diet among the user's preferences, in the form the Google search uses (lowercase). */
export const dietOf = (prefs: string[]) => prefs.find((p) => DIETS.test(p))?.toLowerCase() ?? "";

/** True when `p` may be in a plan, arriving at `at` (minutes from midnight). */
export function fits(p: Place, at: number, r: Rules) {
  if (r.avoid.some((a) => a.toLowerCase() === p.cat.toLowerCase())) return false;
  if (r.budget && p.cat !== "Stay" && p.price > r.budget) return false;
  // Only places that came back from a diet search on Google are known to fit a diet.
  if (r.diet && MEALS.has(p.cat) && p.diet !== r.diet) return false;
  if (p.cat !== "Stay" && !openAt(hoursOn(p, r.day), at, p.mins)) return false;
  return true;
}

/** Arrival at `next` after a stop at `prev` that started at `prevTime`, rounded up to 15 min. */
export const arrivalAfter = (prevTime: number, prev: Place, next: Place) =>
  Math.ceil((prevTime + prev.mins + driveMins(prev, next)) / 15) * 15;

/** Places of `cat` within `maxDrive` min of `near` that fit the rules, closest first, then best rated. */
export function alternatives(
  pool: Place[],
  o: {
    cat: Category;
    near: Place;
    exclude: Set<string>;
    maxDrive: number;
    arriveAt: (p: Place) => number;
    rules: Rules;
  },
) {
  return pool
    .filter(
      (x) =>
        x.cat === o.cat &&
        !o.exclude.has(x.id) &&
        driveMins(o.near, x) <= o.maxDrive &&
        fits(x, o.arriveAt(x), o.rules),
    )
    .sort((a, b) => driveMins(o.near, a) - driveMins(o.near, b) || b.rating - a.rating);
}
