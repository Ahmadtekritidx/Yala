// Runs Compose plans tests through the LIVE app (today's planner, with the app's own keys),
// grades the plans, and saves everything under evals/compose/runs/ (not committed).
//
//   node --experimental-strip-types evals/compose/run-live.ts --ids 1,9,15 --confirm
//
// COSTS MONEY on the live app's Google and Anthropic bills (up to ~80 cents per test today),
// and counts toward the live app's limit of 20 plans per hour. Without --confirm it only prints the plan.
import { writeFileSync, mkdirSync } from "node:fs";
import { grade, summarize, type Grade } from "./grade.ts";
import { APP, callPlanner, loadCards, placeFinder } from "./answers.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const { cards } = loadCards();
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
  const g = grade(c, answer.plans, placeFinder(c, answer));
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
