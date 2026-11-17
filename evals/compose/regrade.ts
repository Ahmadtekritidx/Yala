// Re-grades saved answers with the current tests.json and rules. Free: no network, no keys.
// Use it after changing the answer key, to see the new score without paying for new runs.
//
//   node --experimental-strip-types evals/compose/regrade.ts                     # all saved runs
//   node --experimental-strip-types evals/compose/regrade.ts --write-baseline    # also update baseline.json
//
// When a test was run more than once, its latest answer counts.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { PLACES, type Place } from "../../src/lib/places.ts";
import { grade, summarize, withDefaults, type Card, type Grade, type Plan } from "./grade.ts";

const here = new URL("./", import.meta.url);
const runs = new URL("runs/", here);
const file = JSON.parse(readFileSync(new URL("tests.json", here), "utf8")) as {
  defaults: Partial<Card>;
  tests: Partial<Card>[];
};
const cards = new Map(file.tests.map((t) => [t.id!, withDefaults(file.defaults, t)]));

type Saved = { ms: number; answer: { plans: Plan[]; places: Place[] } | { error: string } };
const latest = new Map<number, Saved>();
const dirs = existsSync(runs)
  ? readdirSync(runs)
      .filter((d) => d.endsWith("-live"))
      .sort()
  : [];
for (const d of dirs)
  for (const f of readdirSync(new URL(`${d}/`, runs)).filter((f) => /^\d+\.json$/.test(f))) {
    const saved = JSON.parse(readFileSync(new URL(`${d}/${f}`, runs), "utf8")) as Saved;
    if (!("error" in saved.answer)) latest.set(Number(f.split(".")[0]), saved);
  }
if (!latest.size) {
  console.error("No saved answers in evals/compose/runs/. Run run-live.ts first.");
  process.exit(2);
}

const grades: Grade[] = [];
const ms: number[] = [];
for (const [id, saved] of [...latest].sort((a, b) => a[0] - b[0])) {
  const card = cards.get(id);
  if (!card || "error" in saved.answer) continue;
  const byId = new Map<string, Place>([...PLACES, ...saved.answer.places].map((p) => [p.id, p]));
  const g = grade(card, saved.answer.plans, (pid) => byId.get(pid));
  grades.push(g);
  ms.push(saved.ms);
  const failed = g.checks.filter((c) => !c.pass);
  console.log(
    `Test ${id}: ${g.checks.length - failed.length}/${g.checks.length} checks, ${g.instantFails.length} instant fails`,
  );
  for (const f of failed) console.log(`   ✗ ${f.code} ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
}

const s = summarize(grades);
ms.sort((a, b) => a - b);
const sec = (x: number) => +(x / 1000).toFixed(1);
console.log(
  `\n${s.tests} graded: ${s.checksPassed}/${s.checks} checks passed, ${s.testsAllPassed} tests fully passed, ${s.instantFails} instant fails`,
);
console.log(
  `Speed: typical ${sec(ms[Math.floor(ms.length / 2)]!)} s, slowest ${sec(ms.at(-1)!)} s`,
);

if (process.argv.includes("--write-baseline")) {
  const out = {
    planner: "live app today (one Opus 5.5 call, medium effort)",
    date: new Date().toISOString().slice(0, 10),
    tests: s.tests,
    checks: s.checks,
    checksPassed: s.checksPassed,
    testsFullyPassed: s.testsAllPassed,
    instantFails: s.instantFails,
    quality: "not graded yet (needs the judge)",
    latencySeconds: { typical: sec(ms[Math.floor(ms.length / 2)]!), slowest: sec(ms.at(-1)!) },
    byCheck: s.byCheck,
  };
  writeFileSync(new URL("baseline.json", here), JSON.stringify(out, null, 2) + "\n");
  console.log("Updated evals/compose/baseline.json");
}
