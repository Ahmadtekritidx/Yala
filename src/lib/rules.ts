// The planning rules, in one place (docs/ai/compose-plans.md, Step 2 D2 and Step 5 "source of truth").
// The exam grader (evals/compose/grade.ts) reads these, and the route builder will too,
// so the planner and the grader can never disagree on a number.
import type { Category } from "./places.ts";

// Arrival windows for meals, in minutes from midnight.
export const MEAL_WINDOWS: Partial<Record<Category, [number, number]>> = {
  Breakfast: [8 * 60, 10 * 60 + 30],
  Brunch: [10 * 60, 13 * 60],
  Lunch: [12 * 60 + 30, 15 * 60 + 30],
  Dinner: [19 * 60 + 30, 22 * 60 + 30],
};
export const isMeal = (c: Category) => c in MEAL_WINDOWS;

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

// Sea view stops: arrive between this many minutes before sunset and a few minutes before it.
export const SUNSET_ARRIVE_FROM = 120;
export const SUNSET_ARRIVE_BY = 10;

// Plans per request in day-out mode.
export const PLANS_PER_REQUEST = 3;
