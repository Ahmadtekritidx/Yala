// Re-grades saved answers with the current tests.json and rules. Free: no network, no keys.
// Use it after changing the answer key, to see the new score without paying for new runs.
//
//   node --experimental-strip-types evals/compose/regrade.ts                     # all saved runs
//   node --experimental-strip-types evals/compose/regrade.ts --write-baseline    # also update baseline.json
//
// When a test was run more than once, its latest answer counts.
import { writeFileSync } from "node:fs";
import { grade, summarize, type Grade } from "./grade.ts";
import { here, loadCards, loadLatestAnswers, placeFinder } from "./answers.ts";

const cards = new Map(loadCards().cards.map((c) => [c.id, c]));
const latest = loadLatestAnswers();
if (!latest.size) {
  console.error("No saved answers in evals/compose/runs/. Run run-live.ts first.");
  process.exit(2);
}

const grades: Grade[] = [];
const ms: number[] = [];
for (const [id, saved] of [...latest].sort((a, b) => a[0] - b[0])) {
  const card = cards.get(id);
  if (!card) continue;
  const g = grade(card, saved.answer.plans, placeFinder(card, saved.answer));
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

// --save <file> --planner "<label>": keep this score next to the baseline, e.g. score-2026-11-18.json
const saveAt = process.argv.indexOf("--save");
if (saveAt > 0) {
  const label = process.argv[process.argv.indexOf("--planner") + 1] ?? "current planner";
  const file = process.argv[saveAt + 1]!;
  writeFileSync(
    new URL(file, here),
    JSON.stringify(
      {
        planner: label,
        date: new Date().toISOString().slice(0, 10),
        tests: s.tests,
        checks: s.checks,
        checksPassed: s.checksPassed,
        testsFullyPassed: s.testsAllPassed,
        instantFails: s.instantFails,
        quality: "not graded yet (needs the judge)",
        latencySeconds: { typical: sec(ms[Math.floor(ms.length / 2)]!), slowest: sec(ms.at(-1)!) },
        byCheck: s.byCheck,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Saved evals/compose/${file}`);
}

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
