// The /plans page as one state machine. Pure: no React, no network, so it can be unit tested
// (tests/plans-state.test.ts) and read in one place.
//
//   loading ──loaded──▶ ready ──load (shuffle / new search)──▶ loading
//      │                  │
//      └──failed──▶ failed ──load (try again)──▶ loading
//
// Every request carries a run number. An answer from an older run (the user shuffled or changed
// the search while it was in flight) is ignored, so it can never overwrite newer plans.
//
// Inside ready, `editing` says what the user is doing to the plans, one thing at a time:
//   none ─▶ swap (sheet open on one stop) | add (category chips open on one plan)
//   add ─▶ addFailed (no spot of that type nearby; the note shows on that plan only)
// and `undo` holds the plans from before the last change (a removed, swapped or added stop) while
// the "Undo" toast shows (docs/ai/compose-plans.md, Step 7: undo for every change). Each change
// replaces the undo with its own, so Undo always reverts the latest change only, and a new request
// drops it, so it can never bring back plans from before a shuffle.
import type { Category } from "./places";
import type { Plan } from "./plans.functions";

export type Editing =
  | { kind: "none" }
  | { kind: "swap"; plan: number; stop: number }
  | { kind: "add"; plan: number }
  | { kind: "addFailed"; plan: number; cat: Category };

export type PlansState =
  | { status: "loading"; run: number }
  | { status: "failed"; run: number; error: string }
  | {
      status: "ready";
      run: number;
      plans: Plan[];
      editing: Editing;
      undo: Plan[] | null;
      /** What the toast says the last change was, e.g. "Stop swapped". */
      undoLabel: string;
    };

export type PlansEvent =
  | { type: "load"; run: number }
  | { type: "loaded"; run: number; plans: Plan[] }
  | { type: "failed"; run: number; error: string }
  | { type: "edit"; editing: Editing }
  // New plans after a swap or an added stop. Closes whatever was open. Can be undone.
  | { type: "change"; plans: Plan[]; label?: string }
  // New plans after a removed stop. Can be undone until the toast expires. Leaves open chips open.
  | { type: "remove"; plans: Plan[] }
  | { type: "undo" }
  | { type: "undoExpired" };

export const NOT_EDITING: Editing = { kind: "none" };
export const initialPlansState: PlansState = { status: "loading", run: 0 };

export function plansReducer(state: PlansState, event: PlansEvent): PlansState {
  switch (event.type) {
    case "load":
      return { status: "loading", run: event.run };
    case "loaded":
      if (event.run !== state.run) return state;
      return {
        status: "ready",
        run: event.run,
        plans: event.plans,
        editing: NOT_EDITING,
        undo: null,
        undoLabel: "",
      };
    case "failed":
      if (event.run !== state.run) return state;
      return { status: "failed", run: event.run, error: event.error };
  }
  // Everything below only makes sense while plans are on screen.
  if (state.status !== "ready") return state;
  switch (event.type) {
    case "edit":
      return { ...state, editing: event.editing };
    case "change":
      return {
        ...state,
        plans: event.plans,
        editing: NOT_EDITING,
        undo: state.plans,
        undoLabel: event.label ?? "Plan changed",
      };
    case "remove":
      return { ...state, plans: event.plans, undo: state.plans, undoLabel: "Stop removed" };
    case "undo":
      return state.undo ? { ...state, plans: state.undo, undo: null } : state;
    case "undoExpired":
      return { ...state, undo: null };
  }
}
