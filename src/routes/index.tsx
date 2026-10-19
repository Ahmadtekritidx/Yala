import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { encodePlan } from "@/lib/share";
import { toMin } from "@/lib/places";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yalla — what are we doing this weekend?" },
      { name: "description", content: "Say what you feel like, tap once, get 3 ready weekend plans in Lebanon." },
      { property: "og:title", content: "Yalla — what are we doing this weekend?" },
      { property: "og:description", content: "One input, one tap, three weekend plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const WHAT = ["Brunch", "Lunch", "Dinner", "Coffee", "Dessert", "Something new"];
const WHERE = ["Beirut", "Batroun", "Jbeil", "Tripoli", "Broummana", "Jounieh", "Anywhere within 45 min"];
const DAYS = ["Saturday", "Sunday"];
const QUICK = [
  { label: "Sunday hike", q: "Morning hike then a village lunch", day: "Sunday", time: "08:00" },
  { label: "Douma road trip", q: "Breakfast in Douma then a mountain road trip", day: "Sunday", time: "08:30" },
  { label: "Surprise me", q: "Surprise us with something fun" },
  { label: "Sunset + dinner", q: "Sea view at sunset then a good dinner" },
  { label: "Lazy brunch day", q: "Slow brunch, a walk, then dessert" },
  { label: "Coffee crawl", q: "Two specialty coffee spots and a walk" },
];
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const st = (name: string, time: string, reason: string) => ({ placeId: slug(name), time: toMin(time), reason });
const LOVED = [
  { title: "Batroun slow Sunday", vibe: "Fish on the rocks, lemonade, Phoenician sunset", day: "Sunday",
    stops: [st("Chez Maguy", "13:00", "Fish on the rocks"), st("Batroun Old Souk", "15:30", "Stone alleys and cats"), st("Hilmi Lemonade", "16:30", "The famous lemonade"), st("Phoenician Wall", "17:30", "Sunset on ancient stones")] },
  { title: "Beirut art & ashta", vibe: "Sursock, ice cream, Corniche walk", day: "Saturday",
    stops: [st("Sursock Museum", "11:00", "Art in a white palace"), st("Tawlet", "12:30", "Home cooks from every village"), st("Hanna Mitri", "15:00", "Legendary ashta ice cream"), st("Corniche Beirut", "16:00", "Seaside stroll with ka3ak")] },
  { title: "Byblos golden hour", vibe: "Old souk, knefeh, port sunset", day: "Saturday",
    stops: [st("Byblos Old Souk", "15:00", "Fossils and old stone"), st("Jbeil Sweets", "16:15", "Warm knefeh"), st("Byblos Port", "17:00", "Sunset by the old harbour"), st("Bab el Mina", "19:30", "Port lights, grilled fish")] },
];

type Recent = { id: string; title: string };

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-medium transition ${
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/60"
      }`}
    >
      {label}
    </button>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Home() {
  const [text, setText] = useState("");
  const [what, setWhat] = useState<string[]>([]);
  const [where, setWhere] = useState<string[]>([]);
  const [day, setDay] = useState("Saturday");
  const [time, setTime] = useState("12:00");
  const [end, setEnd] = useState("18:00");
  const [recent, setRecent] = useState<Recent[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("yalla:recent") || "[]"));
      const last = localStorage.getItem("yalla:lastArea");
      if (last) setWhere([last]);
    } catch {}
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const ready = text.trim().length > 0 || what.length > 0 || where.length > 0;

  const go = () => {
    if (where[0]) localStorage.setItem("yalla:lastArea", where[0]);
    navigate({ to: "/plans", search: { q: text.trim(), what: what.join(","), where: where.join(","), day, time, end } });
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20 pt-10">
      <p className="font-display text-2xl font-extrabold tracking-tight">yalla<span className="text-primary">.</span></p>
      <h1 className="mt-6 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
        What are we doing <span className="inline-block -rotate-2 rounded-xl bg-accent px-2">this weekend?</span>
      </h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {QUICK.map((x) => (
          <button key={x.label} type="button"
            onClick={() => navigate({ to: "/plans", search: { q: x.q, what: "", where: where.join(","), day: "day" in x ? x.day! : day, time: "time" in x ? x.time! : time, end } })}
            className="min-h-11 shrink-0 rounded-full pop press bg-accent text-accent-foreground px-4 text-sm font-bold">
            {x.label}
          </button>
        ))}
      </div>

      <Row title="What">
        {WHAT.map((c) => <Chip key={c} label={c} on={what.includes(c)} onClick={() => toggle(what, setWhat, c)} />)}
      </Row>
      <Row title="Where">
        {WHERE.map((c) => <Chip key={c} label={c} on={where.includes(c)} onClick={() => toggle(where, setWhere, c)} />)}
      </Row>
      <Row title="When">
        {DAYS.map((d) => <Chip key={d} label={d} on={day === d} onClick={() => setDay(d)} />)}
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Start time"
          className="min-h-11 rounded-full pop press bg-card px-4 text-sm"
        />
        <span className="self-center text-sm text-muted-foreground">to</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time"
          className="min-h-11 rounded-full pop press bg-card px-4 text-sm" />
      </Row>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && ready) go(); }}
        placeholder="Or type it: Italian lunch in Batroun then coffee"
        className="mt-6 min-h-12 w-full rounded-2xl pop bg-card px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
      />

      <button
        type="button"
        disabled={!ready}
        onClick={go}
        className="mt-10 min-h-14 w-full rounded-2xl pop press bg-primary font-display text-lg font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Give me 3 plans
      </button>

      <section className="mt-16">
        <h2 className="font-display text-xl font-bold">Plans people loved</h2>
        <div className="mt-3 grid gap-3">
          {LOVED.map((l) => (
            <button key={l.title} type="button"
              onClick={() => { const code = encodePlan({ title: l.title, vibe: l.vibe, day: l.day, stops: l.stops }); navigate({ to: "/p/$code", params: { code } }); }}
              className="rounded-2xl pop press bg-card p-4 text-left transition hover:border-primary">
              <p className="font-display text-lg font-bold">{l.title}</p>
              <p className="text-sm text-muted-foreground">{l.vibe}</p>
              <p className="mt-2 text-xs font-bold text-primary">Open plan →</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Recent plans</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet, ya jama3a. Your plans will land here.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.map((r) => (
              <li key={r.id}><Link to="/p/$code" params={{ code: r.id }} className="block rounded-2xl pop press bg-card p-4 font-medium hover:border-primary">{r.title} →</Link></li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
