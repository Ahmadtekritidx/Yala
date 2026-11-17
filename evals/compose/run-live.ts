// Runs Compose plans tests through the LIVE app (today's planner, with the app's own keys),
// grades the plans, and saves everything under evals/compose/runs/ (not committed).
//
//   node --experimental-strip-types evals/compose/run-live.ts --ids 1,9,15 --confirm
//
// COSTS MONEY on the live app's Google and Anthropic bills (up to ~80 cents per test today),
// and counts toward the live app's limit of 20 plans per hour. Without --confirm it only prints the plan.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { PLACES, type Place } from "../../src/lib/places.ts";
import { grade, summarize, withDefaults, type Card, type Grade, type Plan } from "./grade.ts";

const APP = process.env["YALLA_URL"] ?? "https://yala-rose.vercel.app";
// Server function id of generatePlans in the deployed build (src/lib/plans.functions.ts).
// It changes when the app is redeployed: find it in /assets/plans.functions-*.js.
const PLANS_FN =
  process.env["YALLA_PLANS_FN"] ??
  "2b39312398d56d4a4b951c1fc3288d942418f3de0a3dfc291db8ca0cdc09fd31";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const file = JSON.parse(readFileSync(new URL("tests.json", import.meta.url), "utf8")) as {
  defaults: Partial<Card>;
  tests: Partial<Card>[];
};
const cards = file.tests.map((t) => withDefaults(file.defaults, t));
const ids = arg("ids")?.split(",").map(Number);
const chosen = cards.filter((c) => c.status === "ready" && (!ids || ids.includes(c.id)));
if (!chosen.length) {
  console.error("No ready tests match --ids.");
  process.exit(2);
}
if (!process.argv.includes("--confirm")) {
  console.log(`Would run ${chosen.length} tests on ${APP}: ${chosen.map((c) => c.id).join(", ")}`);
  console.log("This costs money on the live app. Add --confirm to run.");
  process.exit(0);
}

const req = createRequire(new URL("../../package.json", import.meta.url));
const { toJSONAsync, fromCrossJSON } = (await import(req.resolve("seroval"))) as {
  toJSONAsync: (v: unknown) => Promise<unknown>;
  fromCrossJSON: (v: unknown, o: { refs: Map<number, unknown> }) => unknown;
};

// What the app's form would send for this test.
const input = (c: Card) => ({
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

type Answer = { plans: Plan[]; places: Place[] } | { error: string };

// Decode the app's answer. Errors use a TanStack plugin node we don't load, so read their message directly.
function decode(text: string): Answer {
  try {
    const out = fromCrossJSON(JSON.parse(text), { refs: new Map() }) as { result?: Answer };
    return out.result ?? { error: "empty answer" };
  } catch {
    const m = /"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/.exec(text);
    return { error: m ? JSON.parse(`"${m[1]}"`) : `unreadable answer: ${text.slice(0, 200)}` };
  }
}

async function callPlanner(c: Card, raw: URL): Promise<{ answer: Answer; ms: number }> {
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
    body: JSON.stringify(await toJSONAsync({ data: input(c) })),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  // Save the raw answer first, so a decoding problem never loses a paid result.
  writeFileSync(raw, text);
  if (!res.ok) return { answer: { error: `HTTP ${res.status}: ${text.slice(0, 200)}` }, ms };
  return { answer: decode(text), ms };
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = new URL(`runs/${stamp}-live/`, import.meta.url);
mkdirSync(dir, { recursive: true });

const grades: Grade[] = [];
const rows: string[] = [];
for (const c of chosen) {
  process.stdout.write(`Test ${c.id} (${c.about})... `);
  const { answer, ms } = await callPlanner(c, new URL(`${c.id}.raw.json`, dir));
  writeFileSync(new URL(`${c.id}.json`, dir), JSON.stringify({ card: c, ms, answer }, null, 2));
  if ("error" in answer) {
    console.log(`error after ${(ms / 1000).toFixed(1)} s: ${answer.error}`);
    rows.push(`${c.id}\terror\t${(ms / 1000).toFixed(1)} s\t${answer.error}`);
    continue;
  }
  const byId = new Map<string, Place>([...PLACES, ...answer.places].map((p) => [p.id, p]));
  for (const p of input(c).saved) byId.set(p.id, p);
  const g = grade(c, answer.plans, (id) => byId.get(id));
  grades.push(g);
  const failed = g.checks.filter((x) => !x.pass);
  console.log(
    `${(ms / 1000).toFixed(1)} s, ${g.checks.length - failed.length}/${g.checks.length} checks, ${g.instantFails.length} instant fails`,
  );
  for (const f of failed) console.log(`   ✗ ${f.code} ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  for (const f of g.instantFails) console.log(`   🚨 ${f.code} ${f.name}: ${f.detail}`);
  rows.push(
    `${c.id}\t${(ms / 1000).toFixed(1)} s\t${g.checks.length - failed.length}/${g.checks.length}\t${g.instantFails.length}`,
  );
}

const s = summarize(grades);
writeFileSync(
  new URL("summary.json", dir),
  JSON.stringify({ app: APP, summary: s, grades }, null, 2),
);
console.log(
  `\n${s.tests} graded: ${s.checksPassed}/${s.checks} checks passed, ${s.testsAllPassed} tests fully passed, ${s.instantFails} instant fails`,
);
console.log(`Saved in ${dir.pathname}`);
