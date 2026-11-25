import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { adminQuality } from "@/lib/admin.functions";
import type { QuestionRow, QualityReport, RunRow } from "@/lib/quality-report";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Yalla" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Answer = Awaited<ReturnType<typeof adminQuality>>;
// The key lives for this browser tab only. Storage can be blocked: the page still works, it just asks again.
const KEY = "yalla-admin-key";
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const writeKey = (k: string) => {
  try {
    if (k) sessionStorage.setItem(KEY, k);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
};

const PASS = { quality: 4, checks: 1 };
const fmt = (n: number | null, d = 2) => (n === null ? "–" : n.toFixed(d).replace(/\.?0+$/, ""));
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);
const usd = (n: number | null) => (n === null ? "–" : `$${n.toFixed(2)}`);

function AdminPage() {
  const run = useServerFn(adminQuality);
  // idle (no key) ─▶ loading ─▶ answered
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "answered"; answer: Answer }
    | { status: "failed"; error: string }
  >({ status: "idle" });
  const [draft, setDraft] = useState("");

  const load = useCallback(
    (key: string) => {
      setState({ status: "loading" });
      run({ data: { key } }).then(
        (answer) => {
          if (answer.status === "wrong-key") writeKey("");
          else writeKey(key);
          setState({ status: "answered", answer });
        },
        (e) => setState({ status: "failed", error: String(e) }),
      );
    },
    [run],
  );

  useEffect(() => {
    const k = readKey();
    if (k) load(k);
  }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) load(draft.trim());
  };
  const answer = state.status === "answered" ? state.answer : null;
  const signedIn = answer?.status === "ok";

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pb-20 pt-8 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
          yalla<span className="text-primary">.</span>
        </Link>
        {signedIn && (
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => {
              writeKey("");
              setDraft("");
              setState({ status: "idle" });
            }}
          >
            Sign out
          </button>
        )}
      </div>
      <h1 className="mt-8 font-display text-3xl font-bold">Plan quality</h1>
      <p className="mt-1 text-muted-foreground">
        The Compose plans exam: code checks, the AI judge and people's grades, run by run.
      </p>

      {!signedIn && state.status !== "loading" && (
        <form
          onSubmit={submit}
          className="mt-6 flex flex-col gap-3 rounded-2xl pop bg-card p-4 sm:flex-row"
        >
          <label className="sr-only" htmlFor="admin-key">
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            autoComplete="current-password"
            placeholder="Admin key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground"
          >
            Open
          </button>
        </form>
      )}

      {state.status === "loading" && (
        <p className="mt-6 text-muted-foreground">Reading scores from Langfuse...</p>
      )}
      {state.status === "failed" && <p className="mt-6 text-destructive">{state.error}</p>}
      {answer?.status === "wrong-key" && (
        <p className="mt-3 text-destructive">That key is not right.</p>
      )}
      {answer?.status === "slow-down" && (
        <p className="mt-3 text-destructive">
          Too many tries. Try again in {answer.minutes} minutes.
        </p>
      )}
      {answer?.status === "not-set-up" && (
        <p className="mt-3 text-destructive">
          The admin page is not set up on the server yet. Missing settings:{" "}
          {answer.missing.join(", ")}. See docs/ai/judge.md, "Admin page".
        </p>
      )}
      {answer?.status === "langfuse-error" && (
        <p className="mt-3 text-destructive">Could not read Langfuse: {answer.error}</p>
      )}
      {answer?.status === "ok" && (
        <Report report={answer.report} langfuse={answer.links.langfuse} />
      )}
    </main>
  );
}

function Tile({
  label,
  value,
  good,
  hint,
}: {
  label: string;
  value: string;
  good?: boolean | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-2xl pop bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold ${good === undefined ? "" : good ? "" : "text-destructive"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-3 overflow-x-auto rounded-2xl pop bg-card">{children}</div>
    </section>
  );
}

const th = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground";
const td = "px-3 py-2 align-top tabular-nums";

function Report({ report, langfuse }: { report: QualityReport; langfuse: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (!report.runs.length)
    return (
      <p className="mt-6 text-muted-foreground">No exam runs in Langfuse yet. Run npm run judge.</p>
    );
  const latest = report.runs[0]!;
  const withQuestions = report.runs.find((r) => report.questions[r.key]?.length);
  const runKey = picked ?? withQuestions?.key ?? latest.key;
  const questions = report.questions[runKey] ?? [];
  const fails = (r: RunRow) =>
    [r.codeFails, r.judgeFails].every((x) => x === null)
      ? null
      : (r.codeFails ?? 0) + (r.judgeFails ?? 0);

  return (
    <>
      <p className="mt-6 text-sm text-muted-foreground">
        Latest run: <span className="font-bold text-foreground">{latest.name}</span>, {latest.date},{" "}
        {latest.tests} tests.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="Quality avg (AI judge)"
          value={fmt(latest.judgeQuality)}
          good={latest.judgeQuality === null ? undefined : latest.judgeQuality >= PASS.quality}
          hint={latest.judgeQuality === null ? "Held back or not judged yet" : "Target 4 or more"}
        />
        <Tile
          label="Quality avg (people)"
          value={fmt(latest.peopleQuality)}
          hint={`${latest.peopleGraded} of ${latest.tests} tests graded`}
        />
        <Tile
          label="Instant fails"
          value={fails(latest) === null ? "–" : String(fails(latest))}
          good={fails(latest) === null ? undefined : fails(latest) === 0}
          hint={`code ${latest.codeFails ?? "–"} · judge ${latest.judgeFails ?? "–"} · people ${latest.peopleFails ?? "–"}`}
        />
        <Tile
          label="Checks passed"
          value={pct(latest.checksPassed)}
          good={latest.checksPassed === null ? undefined : latest.checksPassed >= PASS.checks}
          hint="Yes/No checks A1 to A12, target 100%"
        />
        <Tile
          label="Judge cost"
          value={usd(latest.judgeCostUsd)}
          hint="This run. App AI cost is in its spend log."
        />
      </div>

      <Section title="Runs" note="Newest first. One row per npm run judge.">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th className={th}>Run</th>
              <th className={th}>Tests</th>
              <th className={th}>Checks</th>
              <th className={th}>Quality (judge)</th>
              <th className={th}>Quality (people)</th>
              <th className={th}>Instant fails</th>
              <th className={th}>Judge cost</th>
            </tr>
          </thead>
          <tbody>
            {report.runs.map((r) => (
              <tr key={r.key} className="border-t">
                <td className={td}>
                  <span className="font-bold">{r.name}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">{r.date}</span>
                </td>
                <td className={td}>{r.tests}</td>
                <td className={td}>{pct(r.checksPassed)}</td>
                <td className={td}>{fmt(r.judgeQuality)}</td>
                <td className={td}>
                  {fmt(r.peopleQuality)}
                  {r.peopleGraded > 0 && (
                    <span className="text-xs text-muted-foreground"> ({r.peopleGraded})</span>
                  )}
                </td>
                <td className={td}>{fails(r) ?? "–"}</td>
                <td className={td}>{usd(r.judgeCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Score per question: judge vs people"
        note={
          <>
            Gap = judge minus people (+ means the judge is kinder). A gap over 1 point means the
            judge can't be trusted on that question yet. Judge scores of a blind run appear only
            after <code>npm run judge:agree -- --push</code>.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <label htmlFor="run-pick" className="text-sm text-muted-foreground">
            Run
          </label>
          <select
            id="run-pick"
            value={runKey}
            onChange={(e) => setPicked(e.target.value)}
            className="min-w-0 max-w-full rounded-lg border bg-background px-2 py-1 text-sm"
          >
            {report.runs.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} · {r.date}
              </option>
            ))}
          </select>
        </div>
        {questions.length ? (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className={th}>Question</th>
                <th className={th}>AI judge</th>
                <th className={th}>People</th>
                <th className={th}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <QuestionLine key={q.name} q={q} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">No rubric grades for this run yet.</p>
        )}
      </Section>

      <p className="mt-8 text-sm text-muted-foreground">
        Details, plans and every reason:{" "}
        <a className="underline" href={langfuse} target="_blank" rel="noreferrer">
          Langfuse
        </a>{" "}
        (dashboard "Yalla plan quality", queue "Plan quality (humans)").
      </p>
    </>
  );
}

function QuestionLine({ q }: { q: QuestionRow }) {
  const show = (v: number | null, n: number) =>
    v === null ? "–" : `${q.kind === "scale" ? fmt(v) : `${pct(v)} clean`} (${n})`;
  const off = q.gap !== null && (q.kind === "scale" ? Math.abs(q.gap) > 1 : q.gap !== 0);
  return (
    <tr className="border-t">
      <td className={td}>{q.name}</td>
      <td className={td}>{show(q.judge, q.judgeCount)}</td>
      <td className={td}>{show(q.people, q.peopleCount)}</td>
      <td className={`${td} ${off ? "font-bold text-destructive" : ""}`}>
        {q.gap === null
          ? "–"
          : q.kind === "scale"
            ? `${q.gap > 0 ? "+" : ""}${fmt(q.gap)}`
            : pct(q.gap)}
      </td>
    </tr>
  );
}
