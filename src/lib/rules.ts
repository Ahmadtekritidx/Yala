// The planning rules, in one place (docs/ai/compose-plans.md, Step 2 D2 and Step 5 "source of truth").
// The exam grader (evals/compose/grade.ts) reads these, and the route builder will too,
// so the planner and the grader can never disagree on a number.
import type { Category } from "./places.ts";

// Arrival windows for meals, in minutes from midnight. The time slot decides which meal a stop is:
// a restaurant found in a "dinner" search can be lunch at 13:00 (decided 2026-11-17).
export const MEAL_WINDOWS: Partial<Record<Category, [number, number]>> = {
  Breakfast: [8 * 60, 10 * 60 + 30],
  Brunch: [10 * 60, 13 * 60],
  Lunch: [12 * 60 + 30, 15 * 60 + 30],
  Dinner: [19 * 60 + 30, 22 * 60 + 30],
};
export const isMeal = (c: Category) => c in MEAL_WINDOWS;
// Two meals in one plan must start at least this far apart (no brunch at 12 then lunch at 15:15).
export const MEAL_GAP_MINUTES = 240;
// True when a meal stop's arrival time falls in some meal's window.
export const mealTimeOk = (t: number) =>
  Object.values(MEAL_WINDOWS).some(([a, b]) => t >= a && t <= b);

// What to call a meal stop on screen: its time slot, not the search it came from
// (a "Dinner" restaurant at 13:00 is lunch).
export function mealName(cat: Category, t: number): string {
  if (!isMeal(cat)) return cat;
  if (t < 10 * 60 + 30) return "Breakfast";
  if (t < 12 * 60 + 30) return "Brunch";
  if (t < 17 * 60) return "Lunch";
  return "Dinner";
}

// Stops per plan, not counting an overnight Stay.
export const PACE_STOPS: Record<"Chill" | "Packed", [number, number]> = {
  Chill: [2, 3],
  Packed: [3, 4],
};

// Minutes of driving allowed between two stops.
export const LOCAL_MAX_DRIVE = 30;
export const ROAD_TRIP_MAX_DRIVE = 120;
// On a long-drive day, total driving must stay under this share of the time window.
export const ROAD_TRIP_MAX_DRIVE_SHARE = 0.5;

// Sea view stops can be at any time of day. Only when the user asks for a sunset must a sea view
// stop be just before it (decided 2026-11-17): arrive between this many minutes before sunset and a few minutes before it.
export const SUNSET_ARRIVE_FROM = 120;
export const SUNSET_ARRIVE_BY = 10;

// Plans per request in day-out mode. A very short window may get fewer, with an honest message
// (decided 2026-11-17).
export const PLANS_PER_REQUEST = 3;
export const SHORT_WINDOW_MINUTES = 180;
export const MIN_PLANS_SHORT_WINDOW = 2;
