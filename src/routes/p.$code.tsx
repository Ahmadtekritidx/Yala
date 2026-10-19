import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { decodePlan, nextDate } from "@/lib/share";
import { byId, fmt, driveMins } from "@/lib/places";

export const Route = createFileRoute("/p/$code")({
  loader: ({ params }) => ({ plan: decodePlan(params.code) }),
  head: ({ loaderData }) => {
    const t = loaderData?.plan ? `${loaderData.plan.title} — Yalla` : "A weekend plan — Yalla";
    const d = loaderData?.plan?.vibe ?? "A ready weekend plan. Make your own in one tap.";
    return {
      meta: [
        { title: t }, { name: "description", content: d },
        { property: "og:title", content: t }, { property: "og:description", content: d },
        { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: SharedPlan,
});

function ics(title: string, day: string, stops: { placeId: string; time: number }[]) {
  const base = nextDate(day);
  const f = (m: number) => {
    const d = new Date(base.getTime() + m * 60000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  };
  const ev = stops.map((s, i) => {
    const pl = byId(s.placeId)!;
    return `BEGIN:VEVENT\nUID:yalla-${Date.now()}-${i}\nDTSTAMP:${f(0)}\nDTSTART:${f(s.time)}\nDTEND:${f(s.time + pl.mins)}\nSUMMARY:${pl.name} (${title})\nLOCATION:${pl.name}, ${pl.area}, Lebanon\nEND:VEVENT`;
  });
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Yalla//EN\r\n${ev.join("\r\n")}\r\nEND:VCALENDAR`.replace(/\n(?!\r)/g, "\r\n").replace(/\r\r/g, "\r");
}

const gq = (name: string, area: string) => encodeURIComponent(`${name}, ${area}, Lebanon`);
const mapsPlace = (name: string, area: string) => `https://www.google.com/maps/search/?api=1&query=${gq(name, area)}`;
const insta = (name: string) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`;

function gcal(title: string, vibe: string, day: string, stops: { placeId: string; time: number }[]) {
  const base = nextDate(day);
  const f = (m: number) => {
    const d = new Date(base.getTime() + m * 60000), p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  };
  const last = stops.at(-1)!, lp = byId(last.placeId)!;
  const end = last.time + (lp.cat === "Stay" ? 60 : lp.mins);
  const details = stops.map((s) => { const p = byId(s.placeId)!; return `${fmt(s.time)} · ${p.name} (${p.area})`; }).join("\n") + `\n\n${vibe}`;
  const first = byId(stops[0]!.placeId)!;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("yalla: " + title)}&dates=${f(stops[0]!.time)}/${f(end)}&ctz=Asia/Beirut&details=${encodeURIComponent(details)}&location=${gq(first.name, first.area)}`;
}

function SharedPlan() {
  const { plan } = Route.useLoaderData();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [here, setHere] = useState("");
  useEffect(() => setHere(window.location.href), []);

  if (!plan) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-5 pt-24 text-center">
        <p className="font-display text-3xl font-bold">This plan got lost on the way.</p>
        <Link to="/" className="mt-8 inline-flex min-h-12 items-center rounded-2xl pop press bg-primary px-6 font-bold text-primary-foreground">Make my own</Link>
      </main>
    );
  }

  const stopsP = plan.stops.map((s) => byId(s.placeId)).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
  const date = nextDate(plan.day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: plan.title, text: plan.vibe, url }); return; } catch {} }
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const cal = () => {
    const blob = new Blob([ics(plan.title, plan.day, plan.stops)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "yalla-plan.ics"; a.click();
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20 pt-8">
      <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">yalla<span className="text-primary">.</span></Link>
      <p className="mt-8 text-sm font-bold uppercase tracking-widest text-secondary">{date}</p>
      <h1 className="mt-2 font-display text-4xl font-bold leading-tight">{plan.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{plan.vibe}</p>

      <ol className="relative mt-10 space-y-8 border-l-2 border-dashed border-primary/40 pl-6">
        {plan.stops.map((s, i) => {
          const pl = byId(s.placeId);
          if (!pl) return null;
          const prev = i > 0 ? byId(plan.stops[i - 1]!.placeId) : undefined;
          const q = encodeURIComponent(`${pl.name}, ${pl.area}, Lebanon`);
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-background bg-primary" />
              {prev && <p className="mb-1 text-xs text-muted-foreground">{driveMins(prev, pl)} min drive</p>}
              <p className="font-display text-xl font-bold text-primary">{fmt(s.time)}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">{pl.cat}</p>
              <p className="text-lg font-bold">{pl.name}</p>
              <p className="text-muted-foreground">{s.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">{"$".repeat(pl.price)} · ★ {pl.rating} · {pl.area}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${pl.live ? `${pl.lat},${pl.lng}` : q}&travelmode=driving`} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full pop press bg-card px-4 text-sm font-medium hover:border-primary">Directions ↗</a>
                <a href={pl.insta ?? insta(pl.name)} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full pop press bg-card px-4 text-sm font-medium hover:border-primary">{pl.insta ? "Insta ↗" : "Find on Insta ↗"}</a>
                {pl.web && !pl.web.includes("instagram.com") && <a href={pl.web} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full pop press bg-card px-4 text-sm font-medium">Site</a>}
                <a href={pl.maps ?? mapsPlace(pl.name, pl.area)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full pop press bg-card px-4 text-sm font-medium">Reviews</a>
              </div>
            </li>
          );
        })}
      </ol>

      <a href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${gq(stopsP.at(-1)!.name, stopsP.at(-1)!.area)}&waypoints=${stopsP.slice(0, -1).map((p) => gq(p.name, p.area)).join("%7C")}`}
        target="_blank" rel="noreferrer"
        className="mt-12 flex min-h-14 items-center justify-center rounded-2xl pop press bg-accent font-display text-lg font-extrabold text-accent-foreground">
        Open full route in Maps
      </a>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={share} className="min-h-12 rounded-2xl pop press bg-primary font-bold text-primary-foreground">{copied ? "Link copied ✓" : "Share"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${plan.title} — ${plan.vibe}\n`)}${encodeURIComponent(here)}`} target="_blank" rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-2xl pop press bg-card font-bold">WhatsApp</a>
        <a href={gcal(plan.title, plan.vibe, plan.day, plan.stops)} target="_blank" rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-2xl pop press bg-secondary font-bold text-secondary-foreground">Google Calendar</a>
        <button onClick={cal} className="min-h-12 rounded-2xl pop press bg-card font-bold">Apple / Outlook</button>
      </div>
      <button onClick={() => router.history.back()} className="mt-3 min-h-11 w-full text-sm font-bold underline">Edit plan</button>
      <Link to="/" className="mt-6 block text-center font-bold text-primary">Make my own →</Link>
    </main>
  );
}
