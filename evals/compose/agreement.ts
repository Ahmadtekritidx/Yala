// Calibration: does the AI judge grade like our people do? (docs/ai/judge.md, "Calibrate")
//
//   npm run judge:agree -- <judge folder>            # compare judge vs human grades for that run
//   npm run judge:agree -- --push <judge folder>     # first send judge scores held back with --hold-judge
//
// <judge folder> is a evals/compose/runs/<time>-judge/ folder printed by `npm run judge`.
// Human grades are read from Langfuse (scores made in the annotation queue, source ANNOTATION).
// The judge's grades come from the folder's judgments.json, the exact answers of that run.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "../langfuse/client.ts";
import type { Judgment } from "./judge.ts";
import { RUBRIC } from "./rubric.ts";

// The bar the judge must clear before its grades count on their own.
export const CALIBRATION = { within1AtLeast: 0.8, minPairs: 5 } as const;

const argv = process.argv.slice(2);
const push = argv.includes("--push");
const folder = argv.filter((a) => !a.startsWith("--")).at(-1);
if (!folder) {
  console.error("Which run? npm run judge:agree -- evals/compose/runs/<time>-judge/");
  process.exit(2);
}
const dir = pathToFileURL(resolve(folder) + "/");
const run = JSON.parse(readFileSync(new URL("judgments.json", dir), "utf8")) as {
  summary: { judge: string; heldJudge: boolean };
  results: { id: number; about: string; traceId?: string; judgments: Judgment[] }[];
};
const traced = run.results.filter((r) => r.traceId);
if (!traced.length) {
  console.error("This run has no Langfuse traces (was it run with --offline?).");
  process.exit(2);
}

const { langfuse, close } = connect();
const api = langfuse.api;

if (push) {
  const { ensureScoreConfigs } = await import("../langfuse/client.ts");
  const configs = await ensureScoreConfigs(api);
  const cfg = (configs: Map<string, string>, name: string) => {
    const id = configs.get(name);
    return id ? { configId: id } : {};
  };
  let n = 0;
  for (const r of traced)
    for (const j of r.judgments) {
      if (j.value === null) continue;
      langfuse.score.create({
        traceId: r.traceId!,
        name: j.name,
        value: j.value,
        comment: j.evidence ? `${j.reason}\nEvidence: ${j.evidence}` : j.reason,
        ...cfg(configs, j.name),
        metadata: { grader: "ai-judge", judge: run.summary.judge, code: j.code },
      });
      n++;
    }
  await langfuse.score.flush();
  console.log(`Sent ${n} held judge scores to Langfuse.\n`);
}

// Human grades per test and question: grader -> value.
type HumanGrades = Map<string, Map<string, number>>; // question name -> grader -> value
const humans = new Map<number, HumanGrades>();
for (const r of traced) {
  const byQ: HumanGrades = new Map();
  let cursor: string | undefined;
  do {
    const page = await api.scores.getMany({
      traceId: r.traceId!,
      source: "ANNOTATION",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const s of page.data) {
      if (typeof s.value !== "number" && typeof s.value !== "boolean") continue;
      const v = typeof s.value === "boolean" ? (s.value ? 1 : 0) : s.value;
      const m = byQ.get(s.name) ?? new Map<string, number>();
      m.set(s.authorUserId ?? "unknown", v);
      byQ.set(s.name, m);
    }
    cursor = page.meta.cursor;
  } while (cursor);
  humans.set(r.id, byQ);
}
await close();

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number) => `${Math.round(x * 100)}%`;

type Row = {
  code: string;
  name: string;
  kind: "scale" | "flag";
  pairs: number;
  within1?: number;
  exact?: number;
  bias?: number; // judge minus people, on average: + means the judge is kinder
  agree?: number; // flags: same verdict
  peopleWithin1?: number; // people vs each other, when two or more graded the same test
  ok: boolean | null;
};
const rows: Row[] = [];
const disagreements: string[] = [];

for (const q of RUBRIC) {
  const pairs: { id: number; judge: number; people: number; reason: string }[] = [];
  const peoplePairs: number[] = [];
  for (const r of traced) {
    const j = r.judgments.find((x) => x.code === q.code);
    const graders = humans.get(r.id)?.get(q.name);
    if (!graders?.size) continue;
    const vals = [...graders.values()];
    if (vals.length > 1)
      for (let a = 0; a < vals.length; a++)
        for (let b = a + 1; b < vals.length; b++) peoplePairs.push(Math.abs(vals[a]! - vals[b]!));
    if (j?.value === null || j?.value === undefined) continue;
    pairs.push({ id: r.id, judge: j.value, people: mean(vals), reason: j.reason });
  }
  const row: Row = { code: q.code, name: q.name, kind: q.kind, pairs: pairs.length, ok: null };
  if (peoplePairs.length)
    row.peopleWithin1 = peoplePairs.filter((d) => d <= 1).length / peoplePairs.length;
  if (pairs.length) {
    if (q.kind === "scale") {
      row.within1 = pairs.filter((p) => Math.abs(p.judge - p.people) <= 1).length / pairs.length;
      row.exact = pairs.filter((p) => Math.round(p.people) === p.judge).length / pairs.length;
      row.bias = Math.round(mean(pairs.map((p) => p.judge - p.people)) * 100) / 100;
      if (pairs.length >= CALIBRATION.minPairs) row.ok = row.within1 >= CALIBRATION.within1AtLeast;
      for (const p of pairs)
        if (Math.abs(p.judge - p.people) >= 2)
          disagreements.push(
            `${q.code} test ${p.id}: judge ${p.judge}, people ${p.people.toFixed(1)}. Judge said: ${p.reason}`,
          );
    } else {
      // A flag: people's verdict is "fail" when any grader marked it failed.
      const verdicts = pairs.map((p) => ({ ...p, people: p.people < 1 ? 0 : 1 }));
      row.agree = verdicts.filter((p) => p.judge === p.people).length / verdicts.length;
      // Missing a real instant fail is never acceptable; false alarms are allowed up to the bar.
      const missed = verdicts.some((p) => p.people === 0 && p.judge === 1);
      if (missed) row.ok = false;
      else if (verdicts.length >= CALIBRATION.minPairs)
        row.ok = row.agree >= CALIBRATION.within1AtLeast;
      for (const p of verdicts)
        if (p.judge !== p.people)
          disagreements.push(
            `${q.code} test ${p.id}: judge ${p.judge ? "clean" : "FAIL"}, people ${p.people ? "clean" : "FAIL"}. Judge said: ${p.reason}`,
          );
    }
  }
  rows.push(row);
}

console.log(`Judge: ${run.summary.judge}\nTests with traces: ${traced.length}\n`);
console.log(
  "Question                      pairs  judge~people  exact  bias   people~people  verdict",
);
for (const r of rows) {
  const verdict =
    r.ok === null
      ? r.pairs
        ? `need ${CALIBRATION.minPairs}+ pairs`
        : "no human grades yet"
      : r.ok
        ? "trusted"
        : "FIX RUBRIC";
  const agree =
    r.kind === "scale"
      ? r.within1 !== undefined
        ? pct(r.within1) + " ±1"
        : "-"
      : r.agree !== undefined
        ? pct(r.agree) + " same"
        : "-";
  console.log(
    `${r.name.padEnd(30)}${String(r.pairs).padStart(5)}  ${agree.padEnd(12)}  ${(r.exact !== undefined ? pct(r.exact) : "-").padEnd(5)}  ${(r.bias !== undefined ? (r.bias > 0 ? "+" : "") + r.bias : "-").padEnd(5)}  ${(r.peopleWithin1 !== undefined ? pct(r.peopleWithin1) + " ±1" : "-").padEnd(13)}  ${verdict}`,
  );
}
if (disagreements.length) {
  console.log("\nBiggest disagreements (read these, then sharpen the rubric or the judge prompt):");
  for (const d of disagreements) console.log(`  - ${d}`);
}
const decided = rows.filter((r) => r.ok !== null);
const allTrusted =
  decided.length > 0 &&
  decided.every((r) => r.ok) &&
  rows.every((r) => r.pairs === 0 || r.ok !== null);
console.log(
  allTrusted
    ? "\nThe judge agrees with people on every question graded. It can grade exam runs on its own; keep spot-checking about 10%."
    : rows.some((r) => r.ok === false)
      ? "\nNot calibrated yet: read the disagreements, sharpen the questions marked FIX RUBRIC, and re-run."
      : "\nNot calibrated yet: keep grading until every question has enough pairs.",
);
writeFileSync(
  new URL("agreement.json", dir),
  JSON.stringify(
    { date: new Date().toISOString(), calibration: CALIBRATION, rows, disagreements },
    null,
    2,
  ),
);
console.log(`Saved ${new URL("agreement.json", dir).pathname}`);
