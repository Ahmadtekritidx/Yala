// Marks one parser answer against one golden item, using the rubric in evals/parser.golden.json.
// Pure, so it is unit tested (tests/eval-score.test.ts) and shared by every parser we try.
import type { Intent } from "../src/lib/intent.ts";

export type GoldenItem = { id: number; tags: string[]; input: string; ideal: Intent };

// The six rubric checks. "n/a" when the item gives the check nothing to test.
export const CHECKS = ["areas", "slots", "cuisine", "times", "constraints", "clarify"] as const;
export type Check = (typeof CHECKS)[number];
export type Verdict = "pass" | "fail" | "n/a";

// The four hard fails that can be checked from the answer alone. The fifth on the list,
// "follows instructions inside the user text", shows up here as a wrong answer on the injection item.
export const HARD_FAILS = [
  "invented_area",
  "invented_activity",
  "bad_shape",
  "dropped_avoid",
] as const;
export type HardFail = (typeof HARD_FAILS)[number];

export type ItemScore = {
  id: number;
  tags: string[];
  input: string;
  pass: boolean;
  checks: Record<Check, Verdict>;
  hardFails: HardFail[];
  got: unknown;
};

const norm = (s: string) => s.trim().toLowerCase();
const sameSet = (a: string[], b: string[]) => {
  const x = new Set(a.map(norm)),
    y = new Set(b.map(norm));
  return x.size === y.size && [...x].every((v) => y.has(v));
};

// Is the answer in the agreed shape at all? Anything else is the "bad shape" hard fail.
export function validShape(x: unknown): x is Intent {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const strs = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
  const hhmm = (v: unknown) =>
    v === undefined || (typeof v === "string" && /^\d{2}:\d{2}$/.test(v));
  return (
    strs(o["areas"]) &&
    strs(o["avoid"]) &&
    Array.isArray(o["slots"]) &&
    (o["slots"] as unknown[]).every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>)["cat"] === "string" &&
        hhmm((s as Record<string, unknown>)["time"]),
    ) &&
    hhmm(o["start"]) &&
    hhmm(o["end"]) &&
    (o["people"] === undefined || typeof o["people"] === "number") &&
    (o["budget"] === undefined || [1, 2, 3].includes(o["budget"] as number)) &&
    (o["clarify"] === undefined || typeof o["clarify"] === "string")
  );
}

export function scoreItem(item: GoldenItem, got: unknown): ItemScore {
  const base = { id: item.id, tags: item.tags, input: item.input, got };
  if (!validShape(got)) {
    const checks = Object.fromEntries(CHECKS.map((c) => [c, "fail"])) as Record<Check, Verdict>;
    return { ...base, pass: false, checks, hardFails: ["bad_shape"] };
  }
  const want = item.ideal;
  const v = (ok: boolean): Verdict => (ok ? "pass" : "fail");

  // Areas: every area named is there, none invented.
  const areas = v(sameSet(got.areas, want.areas));
  // Slots: the same activities, in the user's order.
  const slots = v(
    got.slots.length === want.slots.length &&
      got.slots.every((s, i) => norm(s.cat) === norm(want.slots[i]!.cat)),
  );
  // Cuisine: specific food words kept (only tested when the item has one).
  const wantedCuisine = want.slots.filter((s) => s.cuisine);
  const cuisine: Verdict = wantedCuisine.length
    ? v(
        wantedCuisine.every((w) =>
          got.slots.some(
            (s) =>
              norm(s.cat) === norm(w.cat) &&
              !!s.cuisine &&
              (norm(s.cuisine).includes(norm(w.cuisine!)) ||
                norm(w.cuisine!).includes(norm(s.cuisine))),
          ),
        ),
      )
    : "n/a";
  // Times: said times converted, and nothing invented when none was said.
  const wantTimes = [want.start, want.end, ...want.slots.map((s) => s.time)].some(Boolean);
  const gotTimes = [got.start, got.end, ...got.slots.map((s) => s.time)].some(Boolean);
  const times: Verdict =
    wantTimes || gotTimes
      ? v(
          (got.start ?? "") === (want.start ?? "") &&
            (got.end ?? "") === (want.end ?? "") &&
            want.slots.every(
              (w) =>
                !w.time || got.slots.some((s) => norm(s.cat) === norm(w.cat) && s.time === w.time),
            ),
        )
      : "n/a";
  // Constraints: people, budget, day and avoid, when stated.
  const stated =
    want.people !== undefined ||
    want.budget !== undefined ||
    want.day !== undefined ||
    want.avoid.length > 0;
  const constraints: Verdict = stated
    ? v(
        got.people === want.people &&
          got.budget === want.budget &&
          got.day === want.day &&
          sameSet(got.avoid, want.avoid),
      )
    : "n/a";
  // Clarify: asks one question exactly when it should (the wording is for humans to judge).
  const clarify: Verdict =
    want.clarify || got.clarify ? v(!!want.clarify === !!got.clarify) : "n/a";

  const checks = { areas, slots, cuisine, times, constraints, clarify };
  const hardFails: HardFail[] = [];
  const wantAreas = new Set(want.areas.map(norm));
  if (got.areas.some((a) => !wantAreas.has(norm(a)))) hardFails.push("invented_area");
  const wantCats = new Set(want.slots.map((s) => norm(s.cat)));
  if (got.slots.some((s) => !wantCats.has(norm(s.cat)))) hardFails.push("invented_activity");
  const gotAvoid = new Set(got.avoid.map(norm));
  if (want.avoid.some((a) => !gotAvoid.has(norm(a)))) hardFails.push("dropped_avoid");

  const pass = Object.values(checks).every((c) => c !== "fail") && hardFails.length === 0;
  return { ...base, pass, checks, hardFails };
}

export type Summary = {
  parser: string;
  items: number;
  passed: number;
  passRate: number;
  hardFails: number;
  byTag: Record<string, { items: number; passed: number }>;
  byCheck: Record<Check, { tested: number; passed: number }>;
};

export function summarize(parser: string, scores: ItemScore[]): Summary {
  const byTag: Summary["byTag"] = {};
  for (const s of scores)
    for (const t of s.tags) {
      byTag[t] ??= { items: 0, passed: 0 };
      byTag[t].items++;
      if (s.pass) byTag[t].passed++;
    }
  const byCheck = Object.fromEntries(
    CHECKS.map((c) => {
      const tested = scores.filter((s) => s.checks[c] !== "n/a");
      return [
        c,
        { tested: tested.length, passed: tested.filter((s) => s.checks[c] === "pass").length },
      ];
    }),
  ) as Summary["byCheck"];
  const passed = scores.filter((s) => s.pass).length;
  return {
    parser,
    items: scores.length,
    passed,
    passRate: scores.length ? Math.round((passed / scores.length) * 1000) / 10 : 0,
    hardFails: scores.reduce((n, s) => n + s.hardFails.length, 0),
    byTag,
    byCheck,
  };
}
