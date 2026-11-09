import type { Plan } from "./plans.functions";
import { byId, CATEGORIES, registerPlaces, type Category, type Place } from "./places";
import { clipsFor, savedClips } from "./media";

export type Shared = Plan & { day: string; clips?: string[] };

// First video per stop (curated or saved on this device), so friends see the same story.
const firstClip = (id: string) => clipsFor(id, savedClips(id))[0]?.url ?? "";

function toRaw(p: Shared) {
  const clips = p.clips ?? p.stops.map((s) => firstClip(s.placeId));
  return {
    c: clips.some(Boolean) ? clips : undefined,
    t: p.title,
    v: p.vibe,
    d: p.day,
    a: p.date,
    b: p.base ? [p.base.name, +p.base.lat.toFixed(5), +p.base.lng.toFixed(5)] : undefined,
    s: p.stops.map((s) => [s.placeId, s.time, s.reason]),
    x: p.stops
      .map((s) => byId(s.placeId))
      .filter((pl): pl is Place => !!pl?.live)
      .map((pl) => [
        pl.id,
        pl.name,
        pl.area,
        pl.cat,
        pl.rating,
        pl.price,
        +pl.lat.toFixed(5),
        +pl.lng.toFixed(5),
        pl.mins,
        pl.maps ?? "",
        pl.web ?? "",
        pl.insta ?? "",
        pl.reviews ?? 0,
      ]),
  };
}
const pack = (o: unknown) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(o))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const encodePlan = (p: Shared) => pack(toRaw(p));
// A multi-day trip travels as one link: every day in order.
export const encodeTrip = (days: Shared[]) => pack({ T: days.map(toRaw) });

type Decoded = Shared & { places: Place[]; trip?: Decoded[] | undefined };
// Anyone can craft a share link, so its links must be plain web links and its numbers real numbers.
const webLink = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : undefined);
const num = (n: unknown, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRaw(o: any): Decoded {
  const places: Place[] = Array.isArray(o.x)
    ? o.x.map(
        ([
          id,
          name,
          area,
          cat,
          rating,
          price,
          lat,
          lng,
          mins,
          maps,
          web,
          insta,
          reviews,
        ]: unknown[]) => ({
          id: String(id),
          name: String(name),
          area: String(area),
          cat: (CATEGORIES as unknown[]).includes(cat) ? (cat as Category) : "Lunch",
          rating: num(rating),
          price: Math.min(3, Math.max(1, num(price, 2))) as 1 | 2 | 3,
          lat: num(lat),
          lng: num(lng),
          mins: num(mins, 60),
          reason: "",
          maps: webLink(maps),
          web: webLink(web),
          insta: webLink(insta),
          reviews: num(reviews),
          live: true,
        }),
      )
    : [];
  registerPlaces(places);
  return {
    clips: Array.isArray(o.c) ? o.c.map((c: unknown) => webLink(c) ?? "") : undefined,
    title: String(o.t ?? ""),
    vibe: String(o.v ?? ""),
    day: String(o.d ?? "Saturday"),
    date: typeof o.a === "string" ? o.a : undefined,
    base: Array.isArray(o.b)
      ? { name: String(o.b[0]), lat: num(o.b[1]), lng: num(o.b[2]) }
      : undefined,
    places,
    stops: o.s.map(([placeId, time, reason]: [unknown, unknown, unknown]) => ({
      placeId: String(placeId),
      time: num(time),
      reason: String(reason ?? ""),
    })),
  };
}

export function decodePlan(code: string): Decoded | null {
  try {
    const b = code.replace(/-/g, "+").replace(/_/g, "/");
    const o = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (Array.isArray(o.T) && o.T.length) {
      const days = o.T.map(fromRaw);
      return { ...days[0], trip: days };
    }
    return fromRaw(o);
  } catch {
    return null;
  }
}

export function nextDate(day: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date(day + "T00:00:00");
  const idx = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ].indexOf(day);
  const target = idx < 0 ? 6 : idx;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

export function saveRecent(id: string, title: string) {
  try {
    const list = JSON.parse(localStorage.getItem("yalla:recent") || "[]") as {
      id: string;
      title: string;
    }[];
    const next = [{ id, title }, ...list.filter((r) => r.id !== id)].slice(0, 8);
    localStorage.setItem("yalla:recent", JSON.stringify(next));
  } catch {
    /* storage full or blocked: recent plans are a nice-to-have */
  }
}
