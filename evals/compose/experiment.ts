// The full Compose plans exam: code checks + AI judge, sent to Langfuse as one experiment.
// See docs/ai/judge.md for the whole loop (judge, human queue, calibration).
//
//   npm run judge -- --source saved                 # grade saved runs (free planner, paid judge)
//   npm run judge -- --source saved --offline       # same, without Langfuse: prints and saves locally
//   npm run judge -- --source live --confirm        # new plans from the live app first (costs more)
//
// Options:
//   --ids 1,9,15     only these tests
//   --no-judge       code checks only (free)
//   --queue          add every graded test to the human queue "Plan quality (humans)"
//   --hold-judge     blind calibration: judge scores are saved locally, NOT sent to Langfuse,
//                    so people grade without seeing them. Send them later with
//                    `npm run judge:agree -- --push <folder>`.
//   --name "..."     a label for this run, e.g. "Write on Sonnet" (default: the planner)
//
// Every run saves evals/compose/runs/<time>-judge/judgments.json (not committed).
import { mkdirSync, writeFileSync } from "node:fs";
import type { Evaluation } from "@langfuse/client";
import type { Place } from "../../src/lib/places.ts";
import { grade, type Card, type Grade, type Plan } from "./grade.ts";
import { APP, callPlanner, loadCards, loadLatestAnswers, placeFinder, runsDir } from "./answers.ts";
import {
  anthropicAsk,
  judgeLabel,
  judgeTest,
  plansView,
  qualityAverage,
  type Ask,
  type Judgment,
} from "./judge.ts";
import { PASS } from "./rubric.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const source = arg("source");
if (source !== "saved" && source !== "live") {
  console.error(
    "Choose where plans come from: --source saved (free) or --source live (costs money).",
  );
  process.exit(2);
}
const offline = flag("offline");
const useJudge = !flag("no-judge");
const holdJudge = flag("hold-judge");
if (holdJudge && offline) {
  console.error(
    "--hold-judge only makes sense with Langfuse (it hides judge scores from human graders).",
  );
  process.exit(2);
}

const ids = arg("ids")?.split(",").map(Number);
const { cards } = loadCards();
let chosen = cards.filter((c) => c.status === "ready" && (!ids || ids.includes(c.id)));

const saved = source === "saved" ? loadLatestAnswers() : undefined;
if (saved) {
  const missing = chosen.filter((c) => !saved.has(c.id)).map((c) => c.id);
  if (missing.length) console.log(`No saved answer for tests ${missing.join(", ")}: skipped.`);
  chosen = chosen.filter((c) => saved.has(c.id));
}
if (!chosen.length) {
  console.error(
    source === "saved"
      ? "No saved answers to grade. Run evals/compose/run-live.ts first, or use --source live --confirm."
      : "No ready tests match --ids.",
  );
  process.exit(2);
}
if (source === "live" && !flag("confirm")) {
  console.log(
    `Would ask the live app (${APP}) for plans on ${chosen.length} tests, then grade them.`,
  );
  console.log("This costs money on the live app (up to ~80 cents per test). Add --confirm to run.");
  process.exit(0);
}

if (useJudge && !process.env["ANTHROPIC_API_KEY"]) {
  console.error(
    "The AI judge needs ANTHROPIC_API_KEY in your environment. Or add --no-judge for code checks only.",
  );
  process.exit(2);
}
if (!offline && !(process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"])) {
  console.error(
    "Langfuse keys missing (LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY). Add --offline to grade without Langfuse. See docs/ai/judge.md.",
  );
  process.exit(2);
}
const ask: Ask | undefined = useJudge ? anthropicAsk() : undefined;
const runName = arg("name") ?? (source === "live" ? `live app ${APP}` : "saved answers");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = new URL(`${stamp}-judge/`, runsDir);
mkdirSync(outDir, { recursive: true });
const liveDir = new URL(`${stamp}-live/`, runsDir);
if (source === "live") mkdirSync(liveDir, { recursive: true });

type Answered = { plans: Plan[]; places: Place[] };
type Result = {
  id: number;
  about: string;
  traceId?: string;
  error?: string;
  ms?: number;
  code?: {
    checksPassed: number;
    checks: number;
    instantFails: Grade["instantFails"];
    failed: string[];
  };
  judgments: Judgment[];
  quality: number | null;
};
const results = new Map<number, Result>();
const answers = new Map<number, Answered>();

// Step 1: get the plans for one test (saved or live). Throws on a planner error.
async function plansFor(card: Card): Promise<Answered> {
  if (saved) return saved.get(card.id)!.answer;
  const { answer, ms } = await callPlanner(card, new URL(`${card.id}.raw.json`, liveDir));
  writeFileSync(new URL(`${card.id}.json`, liveDir), JSON.stringify({ card, ms, answer }, null, 2));
  if ("error" in answer) {
    results.set(card.id, {
      id: card.id,
      about: card.about,
      error: answer.error,
      ms,
      judgments: [],
      quality: null,
    });
    throw new Error(answer.error);
  }
  return answer;
}

// Step 2: grade one test with code, then the judge.
async function gradeTest(card: Card, answer: Answered): Promise<Result> {
  const find = placeFinder(card, answer);
  const g = grade(card, answer.plans, find);
  const judgments = ask ? await judgeTest(card, answer.plans, find, ask, answer.places) : [];
  const r: Result = {
    id: card.id,
    about: card.about,
    code: {
      checksPassed: g.checks.filter((c) => c.pass).length,
      checks: g.checks.length,
      instantFails: g.instantFails,
      failed: g.checks
        .filter((c) => !c.pass)
        .map((c) => `${c.code} ${c.name}${c.detail ? `: ${c.detail}` : ""}`),
    },
    judgments,
    quality: qualityAverage(judgments),
  };
  results.set(card.id, r);
  return r;
}

function printTest(r: Result) {
  if (r.error) return console.log(`Test ${r.id} (${r.about}): planner error: ${r.error}`);
  const c = r.code!;
  const fails = r.judgments.filter((j) => j.kind === "flag" && j.value === 0);
  console.log(
    `Test ${r.id} (${r.about}): checks ${c.checksPassed}/${c.checks}, code instant fails ${c.instantFails.length}` +
      (ask ? `, quality ${r.quality ?? "n/a"}, judge instant fails ${fails.length}` : ""),
  );
  for (const f of c.failed) console.log(`   ✗ ${f}`);
  for (const f of c.instantFails) console.log(`   🚨 ${f.code} ${f.name}: ${f.detail}`);
  for (const j of r.judgments) {
    if (j.error) console.log(`   ? ${j.code} judge error: ${j.error}`);
    else if (j.kind === "scale" && j.value! < PASS.noTestBelow)
      console.log(`   ↓ ${j.code} ${j.value}/5: ${j.reason}`);
    else if (j.kind === "flag" && j.value === 0)
      console.log(`   🚨 ${j.code} ${j.reason} [${j.evidence ?? ""}]`);
  }
}

// Links a score to its config when the config exists (it always does after judge:setup).
const cfg = (configs: Map<string, string>, name: string) => {
  const id = configs.get(name);
  return id ? { configId: id } : {};
};

// Scores for Langfuse. Code scores always; judge scores unless held back for blind calibration.
function evaluationsFor(r: Result, configs: Map<string, string>): Evaluation[] {
  if (!r.code) return [];
  const out: Evaluation[] = [
    {
      name: "A checks passed",
      value: r.code.checks ? r.code.checksPassed / r.code.checks : 1,
      comment: r.code.failed.join("\n") || "all passed",
      ...cfg(configs, "A checks passed"),
    },
    {
      name: "Instant fails (code)",
      value: r.code.instantFails.length,
      comment:
        r.code.instantFails.map((f) => `${f.code} ${f.name}: ${f.detail}`).join("\n") || "none",
      ...cfg(configs, "Instant fails (code)"),
    },
  ];
  if (holdJudge) return out;
  for (const j of r.judgments) {
    if (j.value === null) continue;
    out.push({
      name: j.name,
      value: j.value,
      comment: j.evidence ? `${j.reason}\nEvidence: ${j.evidence}` : j.reason,
      ...cfg(configs, j.name),
      metadata: { grader: "ai-judge", judge: judgeLabel(), code: j.code },
    });
  }
  if (r.quality !== null)
    out.push({
      name: "Quality avg",
      value: r.quality,
      ...cfg(configs, "Quality avg"),
      metadata: { grader: "ai-judge" },
    });
  return out;
}

// ---------- Run ----------

console.log(
  `Grading ${chosen.length} tests from ${source === "saved" ? "saved answers" : APP}` +
    (ask ? `, judge ${judgeLabel()}` : ", code checks only") +
    (offline ? ", offline (no Langfuse)" : ""),
);

let experimentUrl: string | undefined;
let queued = 0;
if (offline) {
  for (const card of chosen) {
    try {
      const answer = await plansFor(card);
      answers.set(card.id, answer);
      printTest(await gradeTest(card, answer));
    } catch {
      printTest(results.get(card.id)!);
    }
  }
} else {
  const { connect, ensureQueue, ensureScoreConfigs, DATASET_COMPOSE } =
    await import("../langfuse/client.ts");
  const { langfuse, close } = connect();
  const configs = await ensureScoreConfigs(langfuse.api);
  const dataset = await langfuse.dataset.get(DATASET_COMPOSE);
  const wanted = new Set(chosen.map((c) => c.id));
  const items = dataset.items.filter((it) => wanted.has((it.input as Card).id));
  if (items.length < chosen.length)
    console.log(
      `Only ${items.length} of ${chosen.length} tests are in the Langfuse dataset. Run npm run judge:setup.`,
    );
  const byId = new Map(chosen.map((c) => [c.id, c]));

  // Dataset items carry their dataset id, so each run still links to its test in the dataset.
  const result = await langfuse.experiment.run({
    // Only the chosen tests (running on the dataset itself would take every item).
    data: items,
    name: "Compose plans",
    runName: `${runName} · ${stamp}`,
    description: `Plans from ${source === "saved" ? "saved answers" : APP}. ${ask ? `Judge: ${judgeLabel()}.` : "No judge."}`,
    metadata: { source, app: APP, judge: ask ? judgeLabel() : "none", heldJudge: holdJudge },
    maxConcurrency: 2,
    // What people see in Langfuse: readable plans (names, times, reasons), not place ids.
    task: async ({ input }) => {
      const card = byId.get((input as Card).id)!;
      const answer = await plansFor(card);
      answers.set(card.id, answer);
      return { plans: plansView(answer.plans, placeFinder(card, answer)) };
    },
    evaluators: [
      async ({ input }) => {
        const card = byId.get((input as Card).id)!;
        const r = await gradeTest(card, answers.get(card.id)!);
        printTest(r);
        return evaluationsFor(r, configs);
      },
    ],
    // One line per run in the dashboard: the numbers the passing grade is about.
    runEvaluators: [
      async () => {
        const rs = [...results.values()].filter((r) => r.code);
        const qs = rs.map((r) => r.quality).filter((q): q is number => q !== null);
        const checks = rs.reduce((a, r) => a + r.code!.checks, 0);
        const out: Evaluation[] = [
          {
            name: "A checks passed",
            value: checks ? rs.reduce((a, r) => a + r.code!.checksPassed, 0) / checks : 1,
          },
          {
            name: "Instant fails (code)",
            value: rs.reduce((a, r) => a + r.code!.instantFails.length, 0),
          },
        ];
        if (qs.length && !holdJudge) {
          out.push({
            name: "Quality avg",
            value: Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100) / 100,
          });
          out.push({ name: "Tests below 3", value: qs.filter((q) => q < PASS.noTestBelow).length });
        }
        return out;
      },
    ],
  });
  experimentUrl = result.experimentUrl;
  for (const it of result.itemResults) {
    const r = results.get((it.item.input as Card).id);
    if (r && it.traceId) r.traceId = it.traceId;
  }
  if (flag("queue")) {
    const queueId = await ensureQueue(langfuse.api, configs);
    for (const r of results.values())
      if (r.traceId) {
        await langfuse.api.annotationQueues.createQueueItem(queueId, {
          objectId: r.traceId,
          objectType: "TRACE",
        });
        queued++;
      }
  }
  await close();
}

// ---------- Summary ----------

const done = [...results.values()].filter((r) => r.code).sort((a, b) => a.id - b.id);
const qs = done.map((r) => r.quality).filter((q): q is number => q !== null);
const judgeFails = done.flatMap((r) =>
  r.judgments.filter((j) => j.kind === "flag" && j.value === 0),
);
const codeFails = done.reduce((a, r) => a + r.code!.instantFails.length, 0);
const cost = done.flatMap((r) => r.judgments).reduce((a, j) => a + (j.costUsd ?? 0), 0);
const avg = qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100) / 100 : null;
const below = qs.filter((q) => q < PASS.noTestBelow).length;
const summary = {
  date: new Date().toISOString(),
  run: runName,
  source,
  judge: ask ? judgeLabel() : "none",
  heldJudge: holdJudge,
  tests: done.length,
  plannerErrors: [...results.values()].filter((r) => r.error).length,
  checks: done.reduce((a, r) => a + r.code!.checks, 0),
  checksPassed: done.reduce((a, r) => a + r.code!.checksPassed, 0),
  instantFails: { code: codeFails, judge: judgeFails.length },
  quality: ask
    ? {
        average: avg,
        testsBelow3: below,
        passing: avg !== null && avg >= PASS.averageAtLeast && below === 0,
      }
    : null,
  judgeCostUsd: Math.round(cost * 100) / 100,
  experimentUrl: experimentUrl ?? null,
};
writeFileSync(
  new URL("judgments.json", outDir),
  JSON.stringify({ summary, results: done }, null, 2),
);

console.log(
  `\n${summary.tests} graded: ${summary.checksPassed}/${summary.checks} checks, instant fails ${codeFails} (code) + ${judgeFails.length} (judge)`,
);
if (ask)
  console.log(
    `Quality: average ${avg ?? "n/a"} (target ${PASS.averageAtLeast}), tests below ${PASS.noTestBelow}: ${below}. Judge cost about $${summary.judgeCostUsd}.`,
  );
if (holdJudge)
  console.log(
    "Judge scores held back for blind grading. Send them later: npm run judge:agree -- --push " +
      outDir.pathname,
  );
if (queued) console.log(`Added ${queued} tests to the human queue "Plan quality (humans)".`);
if (experimentUrl) console.log(`Langfuse: ${experimentUrl}`);
console.log(`Saved ${outDir.pathname}judgments.json`);
