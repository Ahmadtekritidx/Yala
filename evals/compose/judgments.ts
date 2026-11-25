// The judgments.json file that `npm run judge` saves, shared by rejudge.ts and agreement.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { qualityAverage, type Judgment } from "./judge.ts";
import { PASS } from "./rubric.ts";

export type JudgedTest = {
  id: number;
  about: string;
  traceId?: string;
  answerDir?: string;
  code?: { checksPassed: number; checks: number; instantFails: unknown[]; failed: string[] };
  judgments: Judgment[];
  quality: number | null;
};

export type JudgedRun = {
  summary: {
    run: string;
    runLabel?: string;
    source: "saved" | "live";
    judge: string;
    heldJudge: boolean;
    quality: { average: number | null; testsBelow3: number; passing: boolean } | null;
    instantFails: { code: number; judge: number };
    judgeCostUsd: number;
    judgeErrors?: number;
    experimentId?: string | null;
    experimentUrl: string | null;
    [k: string]: unknown;
  };
  results: JudgedTest[];
};

export function openRun(folder: string) {
  const dir = pathToFileURL(resolve(folder) + "/");
  const file = new URL("judgments.json", dir);
  const run = JSON.parse(readFileSync(file, "utf8")) as JudgedRun;
  // "2026-11-25T15-51-53-judge" -> "2026-11-25T15-51-53"
  const stamp = basename(resolve(folder)).replace(/-judge$/, "");
  // Files saved before runLabel and experimentId were recorded: rebuild them the same way.
  run.summary.runLabel ??= `${run.summary.run} · ${stamp}`;
  run.summary.experimentId ??= run.summary.experimentUrl
    ? new URL(run.summary.experimentUrl).searchParams.get("baseline")
    : null;
  return {
    run,
    dir,
    file,
    stamp,
    label: run.summary.runLabel,
    experimentId: run.summary.experimentId,
  };
}

// Recomputes the judge part of the summary after judgments changed.
export function refreshSummary(run: JudgedRun) {
  for (const r of run.results) r.quality = qualityAverage(r.judgments);
  const done = run.results.filter((r) => r.code);
  const calls = done.flatMap((r) => r.judgments);
  const qs = done.map((r) => r.quality).filter((q): q is number => q !== null);
  const avg = qs.length
    ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100) / 100
    : null;
  const below = qs.filter((q) => q < PASS.noTestBelow).length;
  run.summary.quality = {
    average: avg,
    testsBelow3: below,
    passing: avg !== null && avg >= PASS.averageAtLeast && below === 0,
  };
  run.summary.instantFails.judge = calls.filter((j) => j.kind === "flag" && j.value === 0).length;
  run.summary.judgeCostUsd =
    Math.round(calls.reduce((a, j) => a + (j.costUsd ?? 0), 0) * 100) / 100;
  run.summary.judgeErrors = calls.filter((j) => j.error).length;
}

export function saveRun(file: URL, run: JudgedRun) {
  writeFileSync(file, JSON.stringify(run, null, 2));
}
