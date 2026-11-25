// The admin quality report: grouping Langfuse scores by run (src/lib/quality-report.ts).
import assert from "node:assert/strict";
import { buildReport, rubricKind, type RawScore } from "../src/lib/quality-report.ts";

const RUN = "First calibration · 2026-11-25T15-51-53";
const at = "2026-11-25T15:53:00.000Z";
const s = (o: Partial<RawScore> & Pick<RawScore, "name" | "value">): RawScore => ({
  source: "API",
  timestamp: at,
  ...o,
});

assert.equal(rubricKind("B1 Fits the request"), "scale");
assert.equal(rubricKind("C4 No invented fact"), "flag");
assert.equal(rubricKind("Quality avg"), null);

const scores: RawScore[] = [
  // code scores of two tests, tagged with the run
  s({ name: "A checks passed", value: 1, traceId: "t1", run: RUN }),
  s({ name: "A checks passed", value: 0.5, traceId: "t2", run: RUN }),
  s({ name: "Instant fails (code)", value: 0, traceId: "t1", run: RUN }),
  s({ name: "Instant fails (code)", value: 2, traceId: "t2", run: RUN }),
  // an old run-level score with a per-test name: must not count twice
  s({ name: "A checks passed", value: 0.1 }),
  // the judge
  s({ name: "B1 Fits the request", value: 5, traceId: "t1", run: RUN }),
  s({ name: "B1 Fits the request", value: 3, traceId: "t2", run: RUN }),
  s({ name: "C4 No invented fact", value: false, traceId: "t2", run: RUN }),
  s({ name: "Quality avg", value: 5, traceId: "t1", run: RUN }),
  s({ name: "Quality avg", value: 3, traceId: "t2", run: RUN }),
  s({ name: "Run - judge cost (USD)", value: 2.5, run: RUN }),
  // people: no run on their scores, joined through the trace
  s({ name: "B1 Fits the request", value: 4, traceId: "t1", source: "ANNOTATION" }),
  s({ name: "B1 Fits the request", value: 2, traceId: "t2", source: "ANNOTATION" }),
  s({ name: "C4 No invented fact", value: 1, traceId: "t2", source: "ANNOTATION" }),
  // a trace no score names a run for: grouped by its day
  s({ name: "A checks passed", value: 1, traceId: "old", timestamp: "2026-11-20T10:00:00Z" }),
];

const r = buildReport(scores);
assert.equal(r.runs.length, 2);
const [cal, old] = r.runs;
assert.equal(cal!.name, "First calibration");
assert.equal(cal!.date, "2026-11-25");
assert.equal(cal!.tests, 2);
assert.equal(cal!.checksPassed, 0.75, "the old run-level duplicate is ignored");
assert.equal(cal!.codeFails, 2);
assert.equal(cal!.judgeQuality, 4);
assert.equal(cal!.judgeFails, 1);
assert.equal(cal!.peopleQuality, 3);
assert.equal(cal!.peopleFails, 0);
assert.equal(cal!.peopleGraded, 2);
assert.equal(cal!.judgeCostUsd, 2.5);
assert.equal(old!.name, "Unnamed run");
assert.equal(old!.date, "2026-11-20");

const qs = r.questions[cal!.key]!;
const b1 = qs.find((q) => q.code === "B1")!;
assert.deepEqual([b1.judge, b1.people, b1.gap], [4, 3, 1], "+1 means the judge is kinder");
const c4 = qs.find((q) => q.code === "C4")!;
assert.deepEqual([c4.kind, c4.judge, c4.people, c4.gap], ["flag", 0, 1, -1]);

// Before any judge score is sent (blind grading), the report shows people only.
const blind = buildReport(scores.filter((x) => x.source === "ANNOTATION" || !rubricKind(x.name)));
assert.ok(blind.runs.every((x) => x.judgeFails === null));

console.log("quality report: groups scores by run, judge vs people per question");
