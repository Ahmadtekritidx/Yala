// The admin quality report: Langfuse scores grouped by exam run (docs/ai/judge.md).
// Pure, so tests/quality-report.test.ts can check it without Langfuse.

export type RawScore = {
  name: string;
  value: number | boolean | null;
  // API = written by a program (code checks, AI judge); ANNOTATION = a person in the queue.
  source: string;
  timestamp: string;
  traceId?: string;
  // metadata.run: the run's label, "<name> · <time>", written by `npm run judge`.
  run?: string;
};

export type RunRow = {
  key: string;
  name: string;
  date: string; // YYYY-MM-DD
  tests: number;
  checksPassed: number | null; // 0 to 1
  codeFails: number | null;
  judgeQuality: number | null; // 1 to 5
  judgeFails: number | null;
  peopleQuality: number | null; // 1 to 5
  peopleFails: number | null;
  peopleGraded: number; // tests with at least one human grade
  judgeCostUsd: number | null;
};

export type QuestionRow = {
  name: string;
  code: string;
  kind: "scale" | "flag";
  judge: number | null; // scale: average 1 to 5; flag: share clean 0 to 1
  people: number | null;
  judgeCount: number;
  peopleCount: number;
  // scale: judge minus people (+ = judge kinder); flag: difference in share clean
  gap: number | null;
};

export type QualityReport = { runs: RunRow[]; questions: Record<string, QuestionRow[]> };

const NAMES = {
  checks: "A checks passed",
  codeFails: "Instant fails (code)",
  quality: "Quality avg",
  judgeCost: "Run: judge cost (USD)",
} as const;

// "B1 Fits the request" -> scale, "C4 No invented fact" -> flag (instant fail when false).
export function rubricKind(name: string): "scale" | "flag" | null {
  if (/^B\d+ /.test(name)) return "scale";
  if (/^C\d+ /.test(name)) return "flag";
  return null;
}

const num = (v: RawScore["value"]) =>
  typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" ? v : null;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) : null);
const round = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

// "First calibration · 2026-11-25T15-51-53" -> name and date.
function describe(key: string, firstSeen: string) {
  if (key.startsWith("day:")) return { name: "Unnamed run", date: key.slice(4) };
  const i = key.lastIndexOf(" · ");
  const stamp = i >= 0 ? key.slice(i + 3) : "";
  const date = /^\d{4}-\d{2}-\d{2}/.exec(stamp)?.[0] ?? firstSeen.slice(0, 10);
  return { name: i >= 0 ? key.slice(0, i) : key, date };
}

export function buildReport(scores: RawScore[]): QualityReport {
  // A trace belongs to the run named on any of its scores. People's grades carry no run, so
  // they join through the trace; old scores with no run anywhere fall back to their day.
  const traceRun = new Map<string, string>();
  for (const s of scores) if (s.traceId && s.run) traceRun.set(s.traceId, s.run);

  const byRun = new Map<string, RawScore[]>();
  for (const s of scores) {
    // Without a trace, only the run-level "Run: ..." scores count. Older run-level scores
    // shared the per-test names and would count twice.
    if (!s.traceId && !s.name.startsWith("Run: ")) continue;
    const key =
      s.run ??
      (s.traceId ? traceRun.get(s.traceId) : undefined) ??
      `day:${s.timestamp.slice(0, 10)}`;
    byRun.set(key, [...(byRun.get(key) ?? []), s]);
  }

  const runs: RunRow[] = [];
  const questions: Record<string, QuestionRow[]> = {};
  for (const [key, list] of byRun) {
    const values = (pick: (s: RawScore) => boolean) =>
      list
        .filter(pick)
        .map((s) => num(s.value))
        .filter((v): v is number => v !== null);
    const judge = (s: RawScore) => s.source !== "ANNOTATION";
    const people = (s: RawScore) => s.source === "ANNOTATION";
    const firstSeen = list.map((s) => s.timestamp).sort()[0] ?? "";
    const traces = new Set(list.filter((s) => s.traceId).map((s) => s.traceId!));
    const graded = new Set(list.filter((s) => people(s) && s.traceId).map((s) => s.traceId!));
    const fails = (pick: (s: RawScore) => boolean) => {
      const v = values((s) => pick(s) && rubricKind(s.name) === "flag");
      return v.length ? v.filter((x) => x === 0).length : null;
    };

    runs.push({
      key,
      ...describe(key, firstSeen),
      tests: traces.size,
      checksPassed: round(avg(values((s) => s.name === NAMES.checks)), 4),
      codeFails: sum(values((s) => s.name === NAMES.codeFails)),
      judgeQuality: round(avg(values((s) => judge(s) && s.name === NAMES.quality))),
      judgeFails: fails(judge),
      peopleQuality: round(avg(values((s) => people(s) && rubricKind(s.name) === "scale"))),
      peopleFails: fails(people),
      peopleGraded: graded.size,
      judgeCostUsd: round(sum(values((s) => s.name === NAMES.judgeCost))),
    });

    const names = [...new Set(list.map((s) => s.name).filter((n) => rubricKind(n)))].sort();
    questions[key] = names.map((name) => {
      const kind = rubricKind(name)!;
      const j = values((s) => judge(s) && s.name === name);
      const p = values((s) => people(s) && s.name === name);
      const ja = avg(j);
      const pa = avg(p);
      return {
        name,
        code: name.split(" ")[0]!,
        kind,
        judge: round(ja),
        people: round(pa),
        judgeCount: j.length,
        peopleCount: p.length,
        gap: ja !== null && pa !== null ? round(ja - pa) : null,
      };
    });
  }
  runs.sort((a, b) =>
    a.date === b.date ? b.key.localeCompare(a.key) : b.date.localeCompare(a.date),
  );
  return { runs, questions };
}
