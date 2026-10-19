import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { encodePlan, saveRecent } from "@/lib/share";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { generatePlans, type Plan, type Stop } from "@/lib/plans.functions";
import { allPlaces, registerPlaces, CATEGORIES, byId, driveMins, fmt, type Category } from "@/lib/places";

const Search = z.object({
  q: z.coerce.string().optional().default(""),
  what: z.string().optional().default(""),
  where: z.string().optional().default(""),
  day: z.string().optional().default("Saturday"),
  time: z.string().optional().default("12:00"),
  end: z.coerce.string().optional().default(""),
  people: z.coerce.string().optional().default("2"),
  avoid: z.string().optional().default(""),
  prefs: z.string().optional().default(""),
  stay: z.string().optional().default("No"),
  pace: z.enum(["Chill", "Packed"]).optional().default("Chill"),
});

export const Route = createFileRoute("/plans")({
  validateSearch: Search,
  head: () => ({
    meta: [
      { title: "Your 3 plans — Yalla" },
      { name: "description", content: "Three ready weekend plans. Swap, remove, pick one." },
      { property: "og:title", content: "Your 3 plans — Yalla" },
      { property: "og:description", content: "Three ready weekend plans. Swap, remove, pick one." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

const LOADING = ["Asking around...", "Checking who is open Sunday...", "Finding the good coffee...", "Yalla, almost there..."];

function PlansPage() {
  const s = Route.useSearch();
  const gen = useServerFn(generatePlans);
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState(0);
  const [msg, setMsg] = useState(0);
  const [swap, setSwap] = useState<{ p: number; i: number } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ prev: Plan[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const label = [s.q, s.what.replaceAll(",", ", "), s.where.replaceAll(",", ", ")].filter(Boolean).join(" · ") || "Surprise me";

  useEffect(() => {
    setPlans(null); setError("");
    const iv = setInterval(() => setMsg((m) => (m + 1) % LOADING.length), 1400);
    gen({ data: { q: s.q, what: s.what ? s.what.split(",") : [], where: s.where ? s.where.split(",") : [], day: s.day, time: s.time, end: s.end || undefined, people: s.people, pace: s.pace, avoid: s.avoid ? s.avoid.split(",") : [], prefs: s.prefs ? s.prefs.split(",") : [], stay: s.stay } })
      .then((r) => { if ("error" in r && r.error) return setError(r.error); if (r.places) registerPlaces(r.places); setPlans(r.plans!); })
      .catch(() => setError("Something broke on our side. Try again?"))
      .finally(() => clearInterval(iv));
    return () => clearInterval(iv);
  }, [s.q, s.what, s.where, s.day, s.time, s.end, s.people, s.pace, s.avoid, s.prefs, s.stay, n]);

  const retime = (stops: Stop[], start: number): Stop[] => {
    let t = start;
    return stops.map((st, i) => {
      if (i > 0) { const a = byId(stops[i - 1]!.placeId)!, b = byId(st.placeId)!; t = Math.ceil((t + a.mins + driveMins(a, b)) / 15) * 15; }
      return { ...st, time: t };
    });
  };

  const update = (p: number, stops: Stop[]) => setPlans((ps) => ps!.map((x, k) => (k === p ? { ...x, stops } : x)));

  const remove = (p: number, i: number) => {
    const plan = plans![p]!;
    const removed = byId(plan.stops[i]!.placeId)!;
    const stops = plan.stops.filter((_, k) => k !== i).map((st, k) => (k >= i ? { ...st, time: st.time - removed.mins } : st));
    setUndo({ prev: plans! });
    update(p, stops);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
  };

  const add = (p: number, cat: Category) => {
    const plan = plans![p]!;
    const last = byId(plan.stops.at(-1)!.placeId)!;
    const used = new Set(plans!.flatMap((x) => x.stops.map((st) => st.placeId)));
    const pick = allPlaces().filter((x) => x.cat === cat && !used.has(x.id))
      .sort((a, b) => (a.area === last.area ? -1 : 1) - (b.area === last.area ? -1 : 1))[0];
    if (!pick) return setAdding(null);
    update(p, [...plan.stops, { placeId: pick.id, reason: pick.reason, time: plan.stops.at(-1)!.time + 90 }]);
    setAdding(null);
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-24 pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="min-h-11 min-w-0 truncate rounded-full pop press bg-card px-4 py-2.5 text-sm font-medium">
          ← {label}
        </Link>
        <button onClick={() => setN((x) => x + 1)} disabled={!plans && !error}
          className="min-h-11 shrink-0 rounded-full pop press bg-accent text-accent-foreground px-4 text-sm font-bold text-secondary-foreground disabled:opacity-40">
          Shuffle all
        </button>
      </div>

      {error && (
        <div className="mt-16 text-center">
          <p className="font-display text-2xl font-bold">Ya jama3a...</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <button onClick={() => setN((x) => x + 1)} className="mt-6 min-h-12 rounded-2xl pop press bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      )}

      {!plans && !error && (
        <div className="mt-8 space-y-4">
          <p className="text-center text-sm font-medium text-secondary">{LOADING[msg]}</p>
          {[0, 1, 2].map((k) => (
            <div key={k} className="animate-pulse rounded-2xl bg-card p-5">
              <div className="h-6 w-1/2 rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
              <div className="mt-6 space-y-3">{[0, 1, 2].map((j) => <div key={j} className="h-14 rounded-xl bg-muted" />)}</div>
            </div>
          ))}
        </div>
      )}

      {plans && (
        <div className="mt-8 space-y-6">
          {plans.map((plan, p) => {
            const first = plan.stops[0], lastSt = plan.stops.at(-1);
            const lastPlace = lastSt ? byId(lastSt.placeId)! : null;
            const total = lastSt && first && lastPlace ? lastSt.time + (lastPlace.cat === "Stay" ? 0 : lastPlace.mins) - first.time : 0;
            const cost = plan.stops.reduce((a, st) => a + ([0, 8, 20, 45][byId(st.placeId)!.price] ?? 0), 0);
            return (
              <article key={p} className="rounded-2xl pop press bg-card p-5">
                <h2 className="font-display text-2xl font-bold leading-tight">{plan.title}</h2>
                <p className="mt-1 text-muted-foreground">{plan.vibe}</p>
                <ol className="mt-5 space-y-1">
                  {plan.stops.map((st, i) => {
                    const pl = byId(st.placeId)!;
                    const prev = i > 0 ? byId(plan.stops[i - 1]!.placeId)! : null;
                    return (
                      <li key={st.placeId + i}>
                        {prev && <p className="py-1 pl-16 text-xs text-muted-foreground">↓ {driveMins(prev, pl)} min drive</p>}
                        <div className="flex gap-3">
                          <p className="w-14 shrink-0 pt-0.5 font-display font-bold text-primary">{fmt(st.time)}</p>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-secondary">{pl.cat}</p>
                            <p className="font-bold">{pl.name}</p>
                            <p className="text-sm text-muted-foreground">{st.reason}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{"$".repeat(pl.price)} · ★ {pl.rating}{pl.reviews ? ` (${pl.reviews})` : ""} · {pl.area}{pl.live ? " · live on Google" : ""}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button aria-label="Swap" onClick={() => setSwap({ p, i })} className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary">⇄</button>
                            <button aria-label="Remove" disabled={plan.stops.length <= 1} onClick={() => remove(p, i)} className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary disabled:opacity-30">✕</button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {adding === p ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button key={c} onClick={() => add(p, c)} className="min-h-11 rounded-full border border-border px-3 text-sm hover:border-primary">{c}</button>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setAdding(p)} className="mt-4 min-h-11 text-sm font-bold text-primary">+ add a stop</button>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">{Math.round(total / 30) / 2}h{lastPlace?.cat === "Stay" ? " + overnight" : ""} · ~${cost}/person{Number(s.people) > 1 ? ` · ~$${cost * Number(s.people)} for ${s.people}` : ""}</p>
                  <button className="min-h-11 rounded-xl pop press bg-primary px-5 font-bold text-primary-foreground" onClick={() => { const code = encodePlan({ ...plan, day: s.day }); saveRecent(code, plan.title); navigate({ to: "/p/$code", params: { code } }); }}>Pick this plan</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {swap && plans && <SwapSheet plans={plans} at={swap} onClose={() => setSwap(null)} onPick={(id) => {
        const plan = plans[swap.p]!;
        const stops = plan.stops.map((st, k) => (k === swap.i ? { ...st, placeId: id, reason: byId(id)!.reason } : st));
        update(swap.p, retime(stops, plan.stops[0]!.time));
        setSwap(null);
      }} />}

      {undo && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-4 rounded-full bg-foreground px-5 py-3 text-sm text-background shadow-lg">
          Stop removed
          <button className="font-bold text-primary" onClick={() => { setPlans(undo.prev); setUndo(null); }}>Undo</button>
        </div>
      )}
    </main>
  );
}

function SwapSheet({ plans, at, onClose, onPick }: { plans: Plan[]; at: { p: number; i: number }; onClose: () => void; onPick: (id: string) => void }) {
  const [count, setCount] = useState(2);
  const plan = plans[at.p]!;
  const cur = byId(plan.stops[at.i]!.placeId)!;
  const used = new Set(plan.stops.map((s) => s.placeId));
  const alts = allPlaces().filter((x) => x.cat === cur.cat && !used.has(x.id) && driveMins(cur, x) <= 40)
    .sort((a, b) => driveMins(cur, a) - driveMins(cur, b));
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/40" onClick={onClose}>
      <div className="mx-auto w-full max-w-xl rounded-t-3xl bg-background p-6 pb-10" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-xl font-bold">Swap {cur.name}</p>
        {alts.length === 0 && <p className="mt-4 text-muted-foreground">No other {cur.cat.toLowerCase()} spots nearby. This one's a keeper.</p>}
        <div className="mt-4 space-y-3">
          {alts.slice(0, count).map((a) => (
            <button key={a.id} onClick={() => onPick(a.id)} className="block w-full rounded-2xl pop press bg-card p-4 text-left hover:border-primary">
              <p className="font-bold">{a.name}</p>
              <p className="text-sm text-muted-foreground">{a.reason}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{"$".repeat(a.price)} · ★ {a.rating} · {a.area} · {driveMins(cur, a)} min away</p>
            </button>
          ))}
        </div>
        {alts.length > count && <button onClick={() => setCount((c) => c + 2)} className="mt-4 min-h-11 text-sm font-bold text-primary">Show 2 more</button>}
      </div>
    </div>
  );
}
