import type { Plan } from "./plans.functions";
import { byId, registerPlaces, type Place } from "./places";
import { clipsFor, savedClips } from "./media";

export type Shared = Plan & { day: string; clips?: string[] };

// First video per stop (curated or saved on this device), so friends see the same story.
const firstClip = (id: string) => clipsFor(id, savedClips(id))[0]?.url ?? "";

export function encodePlan(p: Shared) {
  const clips = p.clips ?? p.stops.map((s) => firstClip(s.placeId));
  const raw = JSON.stringify({
    c: clips.some(Boolean) ? clips : undefined,
    t: p.title,
    v: p.vibe,
    d: p.day,
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
  });
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodePlan(code: string): (Shared & { places: Place[] }) | null {
  try {
    const b = code.replace(/-/g, "+").replace(/_/g, "/");
    const o = JSON.parse(decodeURIComponent(escape(atob(b))));
    const places: Place[] = Array.isArray(o.x) ? o.x.map(([id, name, area, cat, rating, price, lat, lng, mins, maps, web, insta, reviews]: any[]) => ({ id, name, area, cat, rating, price, lat, lng, mins, reason: "", maps: maps || undefined, web: web || undefined, insta: insta || undefined, reviews, live: true })) : [];
    registerPlaces(places);
    return { clips: Array.isArray(o.c) ? o.c.map(String) : undefined, title: o.t, vibe: o.v, day: o.d, places, stops: o.s.map(([placeId, time, reason]: [string, number, string]) => ({ placeId, time, reason })) };
  } catch {
    return null;
  }
}

export function nextDate(day: string) {
  const target = day === "Sunday" ? 0 : 6;
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
  } catch {}
}
