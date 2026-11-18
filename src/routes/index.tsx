import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { encodePlan } from "@/lib/share";
import { clearAsk, dueAsk, type PendingAsk } from "@/lib/did-you-go";
import { track } from "@/lib/track";
import { toMin } from "@/lib/places";
import { loadProfile, profileSearch, profileSummary, type Profile } from "@/lib/profile";
import { CityPicker } from "@/components/CityPicker";
import {
  encodeCity,
  isLebanon,
  LEBANON,
  loadCity,
  saveCity,
  weekendDays,
  type City,
} from "@/lib/city";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yalla — what are we doing this weekend?" },
      {
        name: "description",
        content: "Say what you feel like, tap once, get 3 ready weekend plans in your city.",
      },
      { property: "og:title", content: "Yalla — what are we doing this weekend?" },
      { property: "og:description", content: "One input, one tap, three weekend plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const WHAT = ["Brunch", "Lunch", "Dinner", "Coffee", "Dessert", "Something new"];
const WHERE = [
  "Beirut",
  "Batroun",
  "Jbeil",
  "Tripoli",
  "Broummana",
  "Jounieh",
  "Anywhere within 45 min",
];
const QUICK = [
  { label: "Sunday hike", q: "Morning hike then a village lunch", day: "Sunday", time: "08:00" },
  {
    label: "Douma road trip",
    q: "Breakfast in Douma then a mountain road trip",
    day: "Sunday",
    time: "08:30",
  },
  { label: "Surprise me", q: "Surprise us with something fun" },
  { label: "Sunset + dinner", q: "Sea view at sunset then a good dinner" },
  { label: "Lazy brunch day", q: "Slow brunch, a walk, then dessert" },
  { label: "Coffee crawl", q: "Two specialty coffee spots and a walk" },
];
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const st = (name: string, time: string, reason: string) => ({
  placeId: slug(name),
  time: toMin(time),
  reason,
});
const LOVED = [
  {
    title: "Batroun slow Sunday",
    vibe: "Fish on the rocks, lemonade, Phoenician sunset",
    day: "Sunday",
    stops: [
      st("Chez Maguy", "13:00", "Fish on the rocks"),
      st("Batroun Old Souk", "15:30", "Stone alleys and cats"),
      st("Hilmi Lemonade", "16:30", "The famous lemonade"),
      st("Phoenician Wall", "17:30", "Sunset on ancient stones"),
    ],
  },
  {
    title: "Beirut art & ashta",
    vibe: "Sursock, ice cream, Corniche walk",
    day: "Saturday",
    stops: [
      st("Sursock Museum", "11:00", "Art in a white palace"),
      st("Tawlet", "12:30", "Home cooks from every village"),
      st("Hanna Mitri", "15:00", "Legendary ashta ice cream"),
      st("Corniche Beirut", "16:00", "Seaside stroll with ka3ak"),
    ],
  },
  {
    title: "Byblos golden hour",
    vibe: "Old souk, knefeh, port sunset",
    day: "Saturday",
    stops: [
      st("Byblos Old Souk", "15:00", "Fossils and old stone"),
      st("Jbeil Sweets", "16:15", "Warm knefeh"),
      st("Byblos Port", "17:00", "Sunset by the old harbour"),
      st("Bab el Mina", "19:30", "Port lights, grilled fish"),
    ],
  },
];

type Recent = { id: string; title: string };

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-medium transition ${
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/60"
      }`}
    >
      {label}
    </button>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
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
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  // Max drive from the chosen place, in minutes: nothing is suggested further away (the radius).
  const [drive, setDrive] = useState(30);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [city, setCity] = useState<City>(LEBANON);
  const leb = isLebanon(city);
  const DAYS = weekendDays(city);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("yalla:recent") || "[]"));
      setAsk(dueAsk());
      const pr = loadProfile();
      setProfile(pr);
      if (pr?.maxDrive) setDrive(pr.maxDrive);
      const c = loadCity();
      setCity(c);
      if (!isLebanon(c)) {
        setDay(weekendDays(c)[0]);
        return;
      }
      const last = localStorage.getItem("yalla:lastArea") || pr?.homeArea;
      if (last) setWhere([last]);
    } catch {
      /* storage blocked: start with defaults */
    }
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const changeCity = (c: City) => {
    setCity(c);
    saveCity(c);
    setWhere([]);
    if (!weekendDays(c).includes(day)) setDay(weekendDays(c)[0]);
  };
  const cityParam = {
    // A city abroad, or a town picked in Lebanon (El Mina, Jounieh) or the current location:
    // the planner keeps every stop within the max drive of it.
    ...(leb && city.name === "Lebanon" ? {} : { city: encodeCity(city) }),
  };

  const ready = text.trim().length > 0 || what.length > 0 || where.length > 0 || !leb;

  const go = () => {
    if (where[0]) localStorage.setItem("yalla:lastArea", where[0]);
    navigate({
      to: "/plans",
      search: {
        q: text.trim(),
        what: what.join(","),
        where: where.join(","),
        day,
        time,
        end,
        // Read at tap time too, so a tap before the profile loads still respects it.
        ...profileSearch(profile ?? loadProfile()),
        drive: String(drive),
        ...cityParam,
      },
    });
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20 pt-10">
      <div className="flex items-center justify-between">
        <p className="font-display text-2xl font-extrabold tracking-tight">
          yalla<span className="text-primary">.</span>
        </p>
        <Link
          to="/profile"
          className="min-h-11 rounded-full pop press bg-card px-4 py-2.5 text-sm font-medium"
        >
          {profile?.name ? `Hi ${profile.name}` : "Profile"}
        </Link>
      </div>
      <h1 className="mt-6 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
        What are we doing{" "}
        <span className="inline-block -rotate-2 rounded-xl bg-accent px-2">this weekend?</span>
      </h1>

      <Link to="/profile" className="mt-4 block text-sm text-muted-foreground">
        {profile ? (
          <>
            Plans fit you:{" "}
            <span className="font-medium text-foreground">{profileSummary(profile)}</span> ·{" "}
            <span className="font-bold text-primary">edit</span>
          </>
        ) : (
          <>
            <span className="font-bold text-primary">Set your preferences</span> so every plan fits
            you
          </>
        )}
      </Link>

      <div className="mt-6 flex flex-wrap gap-2">
        {QUICK.filter((x) => leb || !/douma/i.test(x.label)).map((x) => (
          <button
            key={x.label}
            type="button"
            onClick={() =>
              navigate({
                to: "/plans",
                search: {
                  q: x.q,
                  what: "",
                  where: where.join(","),
                  day: "day" in x ? (leb ? x.day! : DAYS[1]) : day,
                  time: "time" in x ? x.time! : time,
                  end,
                  // Read at tap time too, so a tap before the profile loads still respects it.
                  ...profileSearch(profile ?? loadProfile()),
                  drive: String(drive),
                  ...cityParam,
                },
              })
            }
            className="min-h-11 shrink-0 rounded-full pop press bg-accent text-accent-foreground px-4 text-sm font-bold"
          >
            {leb ? x.label : x.label.replace("Sunday", DAYS[1])}
          </button>
        ))}
      </div>

      <Row title="What">
        {WHAT.map((c) => (
          <Chip key={c} label={c} on={what.includes(c)} onClick={() => toggle(what, setWhat, c)} />
        ))}
      </Row>
      <Row title="Where">
        <CityPicker city={city} onChange={changeCity} />
        {leb &&
          WHERE.map((c) => (
            <Chip
              key={c}
              label={c}
              on={where.includes(c)}
              onClick={() => toggle(where, setWhere, c)}
            />
          ))}
      </Row>
      <Row title="How far">
        <div className="w-full">
          <label htmlFor="max-drive" className="text-sm font-medium">
            Up to {drive} min drive from{" "}
            {where.filter((w) => !/anywhere/i.test(w)).join(" or ") ||
              (leb && city.name === "Lebanon" ? "the area you pick" : city.name)}
          </label>
          <input
            id="max-drive"
            type="range"
            min={10}
            max={90}
            step={5}
            value={drive}
            onChange={(e) => setDrive(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />
          <p className="text-xs text-muted-foreground">
            Nothing further away is suggested, and drives between stops stay under it too.
          </p>
        </div>
      </Row>
      <Row title="Day">
        {DAYS.map((d) => (
          <Chip key={d} label={d} on={day === d} onClick={() => setDay(d)} />
        ))}
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Start time"
          className="min-h-11 rounded-full pop press bg-card px-4 text-sm"
        />
        <span className="self-center text-sm text-muted-foreground">to</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="End time"
          className="min-h-11 rounded-full pop press bg-card px-4 text-sm"
        />
      </Row>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) go();
        }}
        placeholder={
          leb
            ? "Or type it: Italian lunch in Batroun then coffee"
            : "Or type it: brunch, a walk, then sunset"
        }
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

      {leb && (
        <section className="mt-16">
          <h2 className="font-display text-xl font-bold">Plans people loved</h2>
          <div className="mt-3 grid gap-3">
            {(leb ? LOVED : []).map((l) => (
              <button
                key={l.title}
                type="button"
                onClick={() => {
                  const code = encodePlan({
                    title: l.title,
                    vibe: l.vibe,
                    day: l.day,
                    stops: l.stops,
                  });
                  navigate({ to: "/p/$code", params: { code } });
                }}
                className="rounded-2xl pop press bg-card p-4 text-left transition hover:border-primary"
              >
                <p className="font-display text-lg font-bold">{l.title}</p>
                <p className="text-sm text-muted-foreground">{l.vibe}</p>
                <p className="mt-2 text-xs font-bold text-primary">Open plan →</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {ask && (
        <section className="mt-12 rounded-2xl pop bg-card p-5" aria-label="Did you go?">
          <p className="font-bold">
            {ask.day}'s plan, "{ask.title}": did you go?
          </p>
          <div className="mt-3 flex gap-2">
            {(
              [
                ["yes", "👍 Yes, loved it"],
                ["meh", "Went, it was ok"],
                ["no", "👎 Didn't go"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                onClick={() => {
                  track("did_you_go", { answer: v, title: ask.title }, ask.runId);
                  clearAsk();
                  setAsk(null);
                }}
                className="min-h-11 rounded-full border border-border px-3 text-sm font-medium hover:border-primary"
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Recent plans</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet, ya jama3a. Your plans will land here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  to="/p/$code"
                  params={{ code: r.id }}
                  className="block rounded-2xl pop press bg-card p-4 font-medium hover:border-primary"
                >
                  {r.title} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
