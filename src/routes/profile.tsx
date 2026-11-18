import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CityPicker } from "@/components/CityPicker";
import { isLebanon, LEBANON, loadCity, saveCity, type City } from "@/lib/city";
import {
  AREAS,
  AVOIDS,
  DIETS,
  EMPTY,
  LIKES,
  STAYS,
  cleanOwn,
  loadProfile,
  saveProfile,
  type Profile,
} from "@/lib/profile";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your preferences — Yalla" },
      { name: "description", content: "Tell Yalla what you like once, every plan fits you." },
    ],
  }),
  component: ProfilePage,
});

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

// Your own items: each shows as a chip with ✕ to remove, plus a box to add a new one.
function AddOwn({
  items,
  preset,
  placeholder,
  onAdd,
  onRemove,
}: {
  items: string[];
  preset: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [v, setV] = useState("");
  const own = items.filter((x) => !preset.includes(x));
  const add = () => {
    const x = cleanOwn(v);
    if (x && !items.some((i) => i.toLowerCase() === x.toLowerCase())) onAdd(x);
    setV("");
  };
  return (
    <>
      {own.map((x) => (
        <span
          key={x}
          className="flex min-h-11 items-center gap-1 rounded-full border-2 border-primary bg-primary pl-4 pr-1 text-sm font-medium text-primary-foreground"
        >
          {x}
          <button
            type="button"
            onClick={() => onRemove(x)}
            aria-label={`Remove ${x}`}
            className="min-h-9 min-w-9 rounded-full font-bold hover:bg-black/10"
          >
            ✕
          </button>
        </span>
      ))}
      <div className="flex w-full gap-2">
        <input
          value={v}
          maxLength={30}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 min-w-0 flex-1 rounded-full pop bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
        />
        <button
          type="button"
          onClick={add}
          disabled={!cleanOwn(v)}
          className="min-h-11 rounded-full pop press bg-card px-4 text-sm font-bold disabled:opacity-40"
        >
          + Add
        </button>
      </div>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function ProfilePage() {
  const [p, setP] = useState<Profile>(EMPTY);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  const [city, setCity] = useState<City>(LEBANON);
  useEffect(() => {
    const x = loadProfile();
    if (x) setP(x);
    setCity(loadCity());
  }, []);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((o) => ({ ...o, [k]: v }));
    setSaved(false);
  };
  const toggle = (k: "diet" | "likes" | "avoid", v: string) =>
    set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  const save = () => {
    saveProfile(p);
    saveCity(city);
    if (p.homeArea) localStorage.setItem("yalla:lastArea", p.homeArea);
    setSaved(true);
    setTimeout(() => navigate({ to: "/" }), 600);
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-24 pt-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
          yalla<span className="text-primary">.</span>
        </Link>
        <Link
          to="/"
          className="min-h-11 rounded-full pop press bg-card px-4 py-2.5 text-sm font-medium"
        >
          ← Back
        </Link>
      </div>
      <h1 className="mt-8 font-display text-4xl font-extrabold leading-tight">Your preferences</h1>
      <p className="mt-2 text-muted-foreground">
        Tell us once. Every plan fits you. Saved on this phone only.
      </p>

      <section className="mt-8">
        <label
          htmlFor="name"
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          Your name
        </label>
        <input
          id="name"
          value={p.name}
          maxLength={30}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Optional"
          className="mt-3 min-h-12 w-full rounded-2xl pop bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring/30"
        />
      </section>

      <Section title="Home city" hint="Anywhere in the world. We plan around here by default.">
        <CityPicker
          city={city}
          onChange={(c) => {
            setCity(c);
            setSaved(false);
            if (!isLebanon(c)) set("homeArea", "");
          }}
        />
        {isLebanon(city) &&
          AREAS.map((a) => (
            <Chip
              key={a}
              label={a}
              on={p.homeArea === a}
              onClick={() => set("homeArea", p.homeArea === a ? "" : a)}
            />
          ))}
      </Section>

      <Section title="Usually going out as">
        {[
          ["1", "Solo"],
          ["2", "Couple"],
          ["4", "Small group"],
          ["8", "Big group"],
        ].map(([v, l]) => (
          <Chip
            key={v}
            label={`${l} (${v})`}
            on={p.people === v}
            onClick={() => set("people", v!)}
          />
        ))}
      </Section>

      <Section title="Budget per person">
        {(
          [
            [0, "Any"],
            [1, "$ Cheap"],
            [2, "$$ Mid"],
            [3, "$$$ Fancy"],
          ] as const
        ).map(([v, l]) => (
          <Chip key={v} label={l} on={p.budget === v} onClick={() => set("budget", v)} />
        ))}
      </Section>

      <Section title="Pace">
        <Chip
          label="Chill (2 to 3 stops)"
          on={p.pace === "Chill"}
          onClick={() => set("pace", "Chill")}
        />
        <Chip
          label="Packed (3 to 4 stops)"
          on={p.pace === "Packed"}
          onClick={() => set("pace", "Packed")}
        />
      </Section>

      <Section title="Max drive between stops">
        {[15, 30, 45, 60].map((m) => (
          <Chip
            key={m}
            label={`${m} min`}
            on={p.maxDrive === m}
            onClick={() => set("maxDrive", m)}
          />
        ))}
      </Section>

      <Section title="Food">
        {DIETS.map((d) => (
          <Chip key={d} label={d} on={p.diet.includes(d)} onClick={() => toggle("diet", d)} />
        ))}
      </Section>

      <Section title="You love">
        {LIKES.map((d) => (
          <Chip key={d} label={d} on={p.likes.includes(d)} onClick={() => toggle("likes", d)} />
        ))}
        <AddOwn
          items={p.likes}
          preset={LIKES}
          placeholder="Add your own, e.g. Rooftops"
          onAdd={(v) => set("likes", [...p.likes, v])}
          onRemove={(v) => toggle("likes", v)}
        />
      </Section>

      <Section title="Not into" hint="We never put these in your plans.">
        {AVOIDS.map((d) => (
          <Chip key={d} label={d} on={p.avoid.includes(d)} onClick={() => toggle("avoid", d)} />
        ))}
        <AddOwn
          items={p.avoid}
          preset={AVOIDS}
          placeholder="Add your own, e.g. Loud bars"
          onAdd={(v) => set("avoid", [...p.avoid, v])}
          onRemove={(v) => toggle("avoid", v)}
        />
      </Section>

      <Section title="Stay overnight?">
        {STAYS.map((d) => (
          <Chip key={d} label={d} on={p.stay === d} onClick={() => set("stay", d)} />
        ))}
      </Section>

      <button
        type="button"
        onClick={save}
        className="mt-12 min-h-14 w-full rounded-2xl pop press bg-primary font-display text-lg font-bold text-primary-foreground"
      >
        {saved ? "Saved ✓" : "Save preferences"}
      </button>
      <button
        type="button"
        onClick={() => {
          setP(EMPTY);
          saveProfile(EMPTY);
          setSaved(false);
        }}
        className="mt-3 min-h-11 w-full text-sm font-bold text-muted-foreground underline"
      >
        Reset
      </button>
    </main>
  );
}
