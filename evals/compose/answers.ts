// Where Compose plans come from for grading: the live app (costs money) or saved runs (free).
// Shared by run-live.ts, regrade.ts and experiment.ts.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PLACES, type Place } from "../../src/lib/places.ts";
import { withDefaults, type Card, type Plan } from "./grade.ts";

export const APP = process.env["YALLA_URL"] ?? "https://yala-rose.vercel.app";
// Server function id of generatePlans in the deployed build (src/lib/plans.functions.ts).
// It changes when the app is redeployed: find it in /assets/plans.functions-*.js.
export const PLANS_FN =
  process.env["YALLA_PLANS_FN"] ??
  "2b39312398d56d4a4b951c1fc3288d942418f3de0a3dfc291db8ca0cdc09fd31";

export const here = new URL("./", import.meta.url);
export const runsDir = new URL("runs/", here);

export type Answer = { plans: Plan[]; places: Place[] } | { error: string };
export type Saved = { card?: Card; ms: number; answer: Answer };

// The test cards, merged with the file's defaults.
export function loadCards() {
  const file = JSON.parse(readFileSync(new URL("tests.json", here), "utf8")) as {
    version: number;
    defaults: Partial<Card>;
    tests: Partial<Card>[];
  };
  return { version: file.version, cards: file.tests.map((t) => withDefaults(file.defaults, t)) };
}

// What the app's form would send for this test.
export const input = (c: Card) => ({
  q: c.q,
  what: c.what,
  where: c.where,
  day: c.day,
  time: c.time,
  end: c.end,
  people: c.people,
  avoid: c.avoid,
  prefs: c.prefs,
  stay: c.stay,
  pace: c.pace,
  budget: c.budget,
  maxDrive: Math.min(90, c.maxDrive),
  saved: c.savedIds.map((id) => {
    const p = PLACES.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown saved place ${id}`);
    return p;
  }),
});

// Resolves a place id to the place the planner had for this answer.
export function placeFinder(c: Card, answer: { places: Place[] }) {
  const byId = new Map<string, Place>([...PLACES, ...answer.places].map((p) => [p.id, p]));
  for (const p of input(c).saved) byId.set(p.id, p);
  return (id: string) => byId.get(id);
}

type Seroval = {
  toJSONAsync: (v: unknown) => Promise<unknown>;
  fromCrossJSON: (v: unknown, o: { refs: Map<number, unknown> }) => unknown;
};
let seroval: Seroval | undefined;
async function loadSeroval() {
  const req = createRequire(new URL("../../package.json", import.meta.url));
  return (seroval ??= (await import(req.resolve("seroval"))) as Seroval);
}

// Decode the app's answer. Errors use a TanStack plugin node we don't load, so read their message directly.
function decode(s: Seroval, text: string): Answer {
  try {
    const out = s.fromCrossJSON(JSON.parse(text), { refs: new Map() }) as { result?: Answer };
    return out.result ?? { error: "empty answer" };
  } catch {
    const m = /"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/.exec(text);
    return { error: m ? JSON.parse(`"${m[1]}"`) : `unreadable answer: ${text.slice(0, 200)}` };
  }
}

// One paid call to the live planner. The raw answer is saved first, so a decoding problem never loses a paid result.
export async function callPlanner(c: Card, raw: URL): Promise<{ answer: Answer; ms: number }> {
  const s = await loadSeroval();
  const t0 = Date.now();
  const res = await fetch(`${APP}/_serverFn/${PLANS_FN}`, {
    method: "POST",
    headers: {
      "x-tsr-serverFn": "true",
      "content-type": "application/json",
      accept: "application/json",
      origin: APP,
      referer: `${APP}/plans`,
    },
    body: JSON.stringify(await s.toJSONAsync({ data: input(c) })),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  writeFileSync(raw, text);
  if (!res.ok) return { answer: { error: `HTTP ${res.status}: ${text.slice(0, 200)}` }, ms };
  return { answer: decode(s, text), ms };
}

// The latest good answer per test across all saved live runs (a later run wins).
export function loadLatestAnswers(): Map<
  number,
  Saved & { answer: { plans: Plan[]; places: Place[] }; dir: string }
> {
  const latest = new Map<
    number,
    Saved & { answer: { plans: Plan[]; places: Place[] }; dir: string }
  >();
  const dirs = existsSync(runsDir)
    ? readdirSync(runsDir)
        .filter((d) => d.endsWith("-live"))
        .sort()
    : [];
  for (const d of dirs)
    for (const f of readdirSync(new URL(`${d}/`, runsDir)).filter((f) => /^\d+\.json$/.test(f))) {
      const saved = JSON.parse(readFileSync(new URL(`${d}/${f}`, runsDir), "utf8")) as Saved;
      if (!("error" in saved.answer))
        latest.set(Number(f.split(".")[0]), { ...saved, answer: saved.answer, dir: d });
    }
  return latest;
}
