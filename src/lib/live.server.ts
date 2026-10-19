import { DUR, type Category, type Place } from "./places";

const GW = "https://connector-gateway.lovable.dev/google_maps";
const cache = new Map<string, { at: number; v: Place[] }>();
const igCache = new Map<string, string | null>();

const Q: Record<Category, string> = {
  Breakfast: "best breakfast manakish saj",
  Brunch: "best brunch cafe",
  Lunch: "best lebanese restaurant",
  Dinner: "best dinner restaurant",
  "Specialty coffee": "specialty coffee shop",
  Dessert: "best dessert ice cream sweets",
  "Sea view": "sunset sea view spot",
  Walk: "old souk historic walk",
  Hike: "hiking trail nature reserve",
  "Scenic stop": "scenic viewpoint",
  Stay: "guesthouse",
};
const PRICE: Record<string, 1 | 2 | 3> = { PRICE_LEVEL_FREE: 1, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 3 };
const MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.websiteUri,places.regularOpeningHours.weekdayDescriptions,places.editorialSummary,places.businessStatus";

type G = {
  id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number };
  rating?: number; userRatingCount?: number; priceLevel?: string; googleMapsUri?: string; websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] }; editorialSummary?: { text: string }; businessStatus?: string;
};

async function search(cat: Category, area: string, day: string, stayType: string, key: string, gkey: string): Promise<Place[]> {
  const text = `${cat === "Stay" ? stayType : Q[cat]} in ${area}, Lebanon`;
  const hit = cache.get(text + day);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.v;
  const res = await fetch(`${GW}/places/v1/places:searchText`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": gkey, "Content-Type": "application/json", "X-Goog-FieldMask": MASK },
    body: JSON.stringify({ textQuery: text, pageSize: 7, regionCode: "LB", languageCode: "en" }),
  });
  if (!res.ok) { console.error("places", res.status, (await res.text()).slice(0, 300)); return []; }
  const json = (await res.json()) as { places?: G[] };
  const dayIdx = day === "Sunday" ? 6 : 5; // Google lists Monday first
  const outdoors = cat === "Hike" || cat === "Scenic stop" || cat === "Sea view" || cat === "Walk";
  const v = (json.places ?? [])
    .filter((p) => p.location && p.displayName && (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL" && (p.userRatingCount ?? 0) >= (outdoors ? 5 : 25) && (p.rating ?? 0) >= 4)
    .map((p): Place => ({
      id: "g_" + p.id,
      name: p.displayName!.text,
      area,
      cat,
      rating: p.rating ?? 4.3,
      reviews: p.userRatingCount,
      price: PRICE[p.priceLevel ?? ""] ?? (outdoors ? 1 : 2),
      reason: (p.editorialSummary?.text ?? "").slice(0, 90),
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      mins: DUR[cat],
      maps: p.googleMapsUri,
      web: p.websiteUri,
      insta: p.websiteUri?.includes("instagram.com") ? p.websiteUri : undefined,
      hours: p.regularOpeningHours?.weekdayDescriptions?.[dayIdx]?.replace(/^\w+:\s*/, ""),
      live: true,
    }));
  cache.set(text + day, { at: Date.now(), v });
  return v;
}

export async function livePlaces(opts: { areas: string[]; cats: Category[]; day: string; stay: string }) {
  const key = process.env["LOVABLE_API_KEY"], gkey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key || !gkey) return [];
  const stayType = opts.stay === "Surprise me" || opts.stay === "No" ? "guesthouse or boutique hotel" : opts.stay.toLowerCase();
  const areas = opts.areas.slice(0, 3);
  const jobs = areas.flatMap((a) => opts.cats.map((c) => search(c, a, opts.day, stayType, key, gkey).catch(() => [] as Place[])));
  const seen = new Set<string>();
  return (await Promise.all(jobs.slice(0, 18))).flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

// Find each place's real Instagram account via web search (best effort, short timeout).
export async function findInstas(places: Place[]) {
  const fc = process.env["FIRECRAWL_API_KEY"];
  if (!fc) return;
  await Promise.all(places.filter((p) => !p.insta).slice(0, 12).map(async (p) => {
    const k = p.id;
    if (igCache.has(k)) { p.insta = igCache.get(k) ?? undefined; return; }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `site:instagram.com ${p.name} ${p.area} Lebanon`, limit: 4 }),
      });
      clearTimeout(t);
      if (!res.ok) return;
      const j = (await res.json()) as { data?: { web?: { url: string }[] } | { url: string }[] };
      const list = Array.isArray(j.data) ? j.data : j.data?.web ?? [];
      const url = list.map((r) => r.url).find((u) => /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(u.split("?")[0]!) && !/instagram\.com\/(explore|p|reel|stories|accounts)\b/.test(u));
      igCache.set(k, url ? url.split("?")[0]! : null);
      if (url) p.insta = url.split("?")[0];
    } catch { /* ignore */ }
  }));
}
