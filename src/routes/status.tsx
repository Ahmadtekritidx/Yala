import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { checkStatus } from "@/lib/plans.functions";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status — Yalla" }, { name: "robots", content: "noindex" }] }),
  component: StatusPage,
});

type S = Awaited<ReturnType<typeof checkStatus>>;

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl pop bg-card p-4">
      <span className={`mt-0.5 font-bold ${ok ? "text-primary" : "text-destructive"}`}>
        {ok ? "✓" : "✕"}
      </span>
      <div>
        <p className="font-bold">{label}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function StatusPage() {
  const run = useServerFn(checkStatus);
  // checking ─▶ ready | failed
  const [check, setCheck] = useState<
    { status: "checking" } | { status: "ready"; data: S } | { status: "failed"; error: string }
  >({ status: "checking" });
  useEffect(() => {
    run().then(
      (data) => setCheck({ status: "ready", data }),
      (e) => setCheck({ status: "failed", error: String(e) }),
    );
  }, [run]);
  const s = check.status === "ready" ? check.data : null;
  const err = check.status === "failed" ? check.error : "";
  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20 pt-8">
      <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
        yalla<span className="text-primary">.</span>
      </Link>
      <h1 className="mt-8 font-display text-3xl font-bold">System status</h1>
      {check.status === "checking" && (
        <p className="mt-6 text-muted-foreground">Running a live Google Places search...</p>
      )}
      {err && <p className="mt-6 text-destructive">{err}</p>}
      {s && (
        <ul className="mt-6 space-y-3">
          <Row
            label="AI planner (Claude, ANTHROPIC_API_KEY)"
            ok={s.ai.ok}
            detail={s.ai.ok ? `${s.ai.model} answered` : s.ai.error}
          />
          <Row label="Google key (GOOGLE_PLACES_API_KEY)" ok={s.googleKey} />
          <Row
            label="Firecrawl key (Instagram links)"
            ok={s.firecrawlKey}
            detail={s.firecrawlKey ? "" : "Optional. Without it, Insta buttons open a search."}
          />
          <Row
            label="Live Google Places search"
            ok={s.ok}
            detail={
              s.ok
                ? `${s.count} coffee shops in Beirut, e.g. ${s.sample.map((x) => `${x.name} (★ ${x.rating}${x.reviews ? `, ${x.reviews} reviews` : ""}${x.hours ? `, Sat ${x.hours}` : ""})`).join("; ")}`
                : s.error
            }
          />
        </ul>
      )}
    </main>
  );
}
