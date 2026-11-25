// Re-asks the judge the questions that failed in a held (blind) run, on the SAME plans and traces,
// so the human grades already in Langfuse still line up. Prints counts only, never scores:
// the person running it may be a grader.
//
//   npm run judge:rejudge -- evals/compose/runs/<time>-judge/
//
// Typical cause: the judge's key was wrong during `npm run judge`, so every question failed.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import type { Saved } from "./answers.ts";
import { loadCards, placeFinder, runsDir } from "./answers.ts";
import { anthropicAsk, judgeKeyProblem, judgeLabel, judgeOne } from "./judge.ts";
import { openRun, refreshSummary, saveRun } from "./judgments.ts";
import { questionsFor } from "./rubric.ts";

const folder = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!folder) {
  console.error("Which run? npm run judge:rejudge -- evals/compose/runs/<time>-judge/");
  process.exit(2);
}
const { run, file, stamp } = openRun(folder);
if (!run.summary.heldJudge) {
  console.error(
    "Only held runs (--hold-judge) can be re-judged: their judge scores are not in Langfuse yet. For other runs, run npm run judge again.",
  );
  process.exit(2);
}
if (run.summary.judge !== judgeLabel()) {
  console.error(
    `This run was judged by "${run.summary.judge}", but the judge is now "${judgeLabel()}". Mixing them would make calibration meaningless: run npm run judge again instead.`,
  );
  process.exit(2);
}
const keyProblem = judgeKeyProblem();
if (keyProblem) {
  console.error(keyProblem);
  process.exit(2);
}

const { cards } = loadCards();
const ask = anthropicAsk();

// The plans this run graded: its own saved answers folder.
function answerFor(id: number, answerDir?: string) {
  const dir = answerDir ?? (run.summary.source === "live" ? `${stamp}-live` : undefined);
  if (!dir) throw new Error(`test ${id}: this file doesn't say where its plans came from`);
  const f = new URL(`${dir}/${id}.json`, runsDir);
  if (!existsSync(f)) throw new Error(`test ${id}: ${f.pathname} is missing`);
  const saved = JSON.parse(readFileSync(f, "utf8")) as Saved;
  if ("error" in saved.answer) throw new Error(`test ${id}: the planner failed on this test`);
  return saved.answer;
}

let asked = 0;
let fixed = 0;
for (const r of run.results.filter((r) => r.code)) {
  const card = cards.find((c) => c.id === r.id);
  if (!card) {
    console.error(`Test ${r.id} is no longer in tests.json: skipped.`);
    continue;
  }
  const have = new Map(r.judgments.map((j) => [j.code, j]));
  const todo = questionsFor(card).filter((q) => {
    const j = have.get(q.code);
    return !j || j.error || j.value === null;
  });
  if (!todo.length) continue;
  const answer = answerFor(r.id, r.answerDir);
  const find = placeFinder(card, answer);
  const fresh = await Promise.all(
    todo.map((q) => judgeOne(q, card, answer.plans, find, ask, answer.places)),
  );
  for (const j of fresh) have.set(j.code, j);
  r.judgments = questionsFor(card)
    .map((q) => have.get(q.code)!)
    .filter(Boolean);
  asked += fresh.length;
  fixed += fresh.filter((j) => !j.error).length;
  console.log(
    `Test ${r.id}: re-asked ${fresh.length}, answered ${fresh.filter((j) => !j.error).length}`,
  );
}

if (!asked) {
  console.log("Nothing to re-ask: every question already has an answer.");
  process.exit(0);
}
const backup = new URL(`judgments.before-rejudge-${Date.now()}.json`, file);
copyFileSync(file, backup);
refreshSummary(run);
saveRun(file, run);

const errors = run.summary.judgeErrors ?? 0;
console.log(
  `\nRe-asked ${asked} questions: ${fixed} answered, ${errors} still failing. Judge cost for the run now about $${run.summary.judgeCostUsd}.`,
);
if (errors) {
  const first = run.results.flatMap((r) => r.judgments).find((j) => j.error);
  console.log(`First error: ${first?.error}`);
}
console.log(`Scores are still held back. Previous file kept as ${backup.pathname}`);
