// The /plans page state machine (src/lib/plans-state.ts). Run: node --experimental-strip-types tests/plans-state.test.ts
import { initialPlansState, NOT_EDITING, plansReducer, type PlansEvent, type PlansState } from "../src/lib/plans-state.ts";
import type { Plan } from "../src/lib/plans.functions.ts";

const plan = (title: string): Plan => ({ title, vibe: "", stops: [{ placeId: "a", time: 600, reason: "" }, { placeId: "b", time: 700, reason: "" }] });
const A = [plan("A")], B = [plan("B")], A2 = [plan("A without a stop")], A3 = [plan("A swapped")];
const run = (events: PlansEvent[], from: PlansState = initialPlansState) => events.reduce(plansReducer, from);

let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "ok" : "FAIL"} ${name}`); if (!cond) failed++; };
const plansOf = (s: PlansState) => (s.status === "ready" ? s.plans : null);

ok("loads", plansOf(run([{ type: "load", run: 1 }, { type: "loaded", run: 1, plans: A }])) === A);
ok("old answer ignored after shuffle", plansOf(run([
  { type: "load", run: 1 }, { type: "load", run: 2 },
  { type: "loaded", run: 2, plans: B }, { type: "loaded", run: 1, plans: A },
])) === B);
ok("old error ignored after shuffle", run([
  { type: "load", run: 1 }, { type: "load", run: 2 }, { type: "failed", run: 1, error: "x" },
]).status === "loading");
ok("failure shows", run([{ type: "load", run: 1 }, { type: "failed", run: 1, error: "busy" }]).status === "failed");

const ready = run([{ type: "load", run: 1 }, { type: "loaded", run: 1, plans: A }]);
const removed = run([{ type: "remove", plans: A2 }], ready);
ok("remove offers undo", removed.status === "ready" && removed.undo === A);
ok("undo restores", plansOf(run([{ type: "undo" }], removed)) === A);
ok("undo expires", run([{ type: "undoExpired" }], removed).status === "ready" && (run([{ type: "undoExpired" }], removed) as { undo: unknown }).undo === null);
const swappedAfterRemove = run([{ type: "change", plans: A3 }], removed);
ok("a swap after a remove drops the undo", swappedAfterRemove.status === "ready" && swappedAfterRemove.undo === null);
ok("undo cannot cross a shuffle", run([{ type: "load", run: 2 }, { type: "undo" }], removed).status === "loading");

const adding = run([{ type: "edit", editing: { kind: "add", plan: 0 } }], ready);
ok("one edit at a time: opening swap closes add", (run([{ type: "edit", editing: { kind: "swap", plan: 0, stop: 1 } }], adding) as { editing: { kind: string } }).editing.kind === "swap");
ok("a change closes the editor", (run([{ type: "change", plans: A3 }], adding) as { editing: unknown }).editing === NOT_EDITING);
ok("edits ignored while loading", run([{ type: "edit", editing: { kind: "add", plan: 0 } }]).status === "loading");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all plans-state cases pass");
