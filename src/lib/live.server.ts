import { DUR, type Category, type Place } from "./places";
import type { City } from "./city";

// Google Places API (New), called directly with our own key
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const googleKey = () => process.env["GOOGLE_PLACES_API_KEY"];
const cache = new Map<string, { at: number; v: Place[] }>();
const igCache = new Map<string, string | null>();
let lastError = "";

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
const PRICE: Record<string, 1 | 2 | 3> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 3,
};
const MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.websiteUri,places.regularOpeningHours.weekdayDescriptions,places.editorialSummary,places.businessStatus";

type G = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  editorialSummary?: { text: string };
  businessStatus?: string;
};

// Outside Lebanon the Lebanese-specific words would only confuse Google.
const Q_WORLD: Partial<Record<Category, string>> = {
  Breakfast: "best breakfast",
  Lunch: "best local restaurant",
  Walk: "old town historic walk",
  "Scenic stop": "top attractions and landmarks",
};
const DAY_IDX: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const MEALS = new Set<Category>(["Breakfast", "Brunch", "Lunch", "Dinner"]);
// Food words we pass straight to Google so "Italian lunch" searches Italian places
const CUISINES = [
  "italian",
  "pizza",
  "sushi",
  "japanese",
  "chinese",
  "asian",
  "thai",
  "indian",
  "mexican",
  "burger",
  "steak",
  "seafood",
  "fish",
  "armenian",
  "french",
  "greek",
  "mediterranean",
  "manakish",
  "shawarma",
  "falafel",
  "grill",
  "vegan",
  "vegetarian",
];
export const cuisineOf = (text: string) =>
  CUISINES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? "";

async function search(
  cat: Category,
  area: string,
  day: string,
  stayType: string,
  gkey: string,
  diet = "",
  cuisine = "",
  geo?: City,
): Promise<Place[]> {
  const q = (geo && Q_WORLD[cat]) || Q[cat];
  const meal = cat === "Lunch" || cat === "Dinner" ? (cuisine ? `${cuisine} restaurant` : q) : q;
  const where = geo
    ? geo.name === geo.country
      ? geo.country
      : `${area}, ${geo.country}`
    : `${area}, Lebanon`;
  const text = `${cat === "Stay" ? stayType : (MEALS.has(cat) && diet && diet !== cuisine ? `${diet} ` : "") + meal} in ${where}`;
  // Places Google returns for "vegan lunch in Batroun" are the ones we know fit that diet (Swap/Add rely on it).
  const dietTag =
    MEALS.has(cat) && diet && new RegExp(`\\b${diet}\\b`, "i").test(text) ? diet : undefined;
  const hit = cache.get(text + day);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.v;
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": gkey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": MASK,
    },
    body: JSON.stringify({
      textQuery: text,
      pageSize: geo ? 10 : 7,
      regionCode: geo?.cc ?? "LB",
      languageCode: "en",
      ...(geo && geo.name !== geo.country
        ? {
            locationBias: {
              circle: { center: { latitude: geo.lat, longitude: geo.lng }, radius: 30000 },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) {
    lastError = `${res.status} ${(await res.text()).slice(0, 200)}`;
    console.error("places", lastError);
    return [];
  }
  const json = (await res.json()) as { places?: G[] };
  const dayIdx = DAY_IDX[day] ?? 5; // Google lists Monday first
  const outdoors = cat === "Hike" || cat === "Scenic stop" || cat === "Sea view" || cat === "Walk";
  const v = (json.places ?? [])
    .filter(
      (p) =>
        p.location &&
        p.displayName &&
        (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL" &&
        (p.userRatingCount ?? 0) >= (outdoors ? 5 : 25) &&
        (p.rating ?? 0) >= 4,
    )
    .map((p): Place => ({
      id: "g_" + p.id,
      name: p.displayName!.text,
      area,
      cat,
      rating: Math.round((p.rating ?? 4.3) * 10) / 10,
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
      week: p.regularOpeningHours?.weekdayDescriptions?.map((d) => d.replace(/^\w+:\s*/, "")),
      live: true,
      ...(dietTag ? { diet: dietTag } : {}),
    }));
  cache.set(text + day, { at: Date.now(), v });
  return v;
}

export async function livePlaces(opts: {
  areas: string[];
  cats: Category[];
  day: string;
  stay: string;
  prefs?: string[];
  q?: string;
  geo?: City | undefined;
}) {
  const gkey = googleKey();
  if (!gkey) return [];
  const stayType =
    opts.stay === "Surprise me" || opts.stay === "No"
      ? "guesthouse or boutique hotel"
      : opts.stay.toLowerCase();
  const areas = opts.areas.slice(0, 3);
  const diet =
    (opts.prefs ?? [])
      .find((p) => /^(vegan|vegetarian|halal|gluten free)$/i.test(p))
      ?.toLowerCase() ?? "";
  const jobs = areas.flatMap((a) =>
    opts.cats.map((c) =>
      search(c, a, opts.day, stayType, gkey, diet, cuisineOf(opts.q ?? ""), opts.geo).catch(
        () => [] as Place[],
      ),
    ),
  );
  // One entry per place; keep the diet tag if any of the searches that found it had one.
  const found = new Map<string, Place>();
  for (const p of (await Promise.all(jobs.slice(0, 18))).flat()) {
    const had = found.get(p.id);
    if (!had) found.set(p.id, p);
    else if (p.diet && !had.diet) found.set(p.id, { ...had, diet: p.diet });
  }
  return [...found.values()];
}

// Find each place's real Instagram account via web search (best effort, short timeout).
export async function findInstas(places: Place[]) {
  const fc = process.env["FIRECRAWL_API_KEY"];
  if (!fc) return;
  await Promise.all(
    places
      .filter((p) => !p.insta)
      .slice(0, 12)
      .map(async (p) => {
        const k = p.id;
        if (igCache.has(k)) {
          p.insta = igCache.get(k) ?? undefined;
          return;
        }
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 8000);
          const res = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            signal: ctl.signal,
            headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: `site:instagram.com ${p.name} ${p.area}`, limit: 4 }),
          });
          clearTimeout(t);
          if (!res.ok) return;
          const j = (await res.json()) as {
            data?: { web?: { url: string }[] } | { url: string }[];
          };
          const list = Array.isArray(j.data) ? j.data : (j.data?.web ?? []);
          const url = list
            .map((r) => r.url)
            .find(
              (u) =>
                /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(u.split("?")[0]!) &&
                !/instagram\.com\/(explore|p|reel|stories|accounts)\b/.test(u),
            );
          igCache.set(k, url ? url.split("?")[0]! : null);
          if (url) p.insta = url.split("?")[0];
        } catch {
          /* ignore */
        }
      }),
  );
}

// One live test search, for the /status page. Never returns keys.
export async function placesStatus() {
  const gkey = googleKey();
  const out = {
    googleKey: !!gkey,
    firecrawlKey: !!process.env["FIRECRAWL_API_KEY"],
    ok: false,
    count: 0,
    sample: [] as {
      name: string;
      rating: number;
      reviews?: number | undefined;
      hours?: string | undefined;
    }[],
    error: "",
  };
  if (!gkey) {
    out.error = "Missing secret: GOOGLE_PLACES_API_KEY";
    return out;
  }
  lastError = "";
  cache.delete("specialty coffee shop in Beirut, Lebanon" + "Saturday");
  const list = await search("Specialty coffee", "Beirut", "Saturday", "", gkey).catch((e) => {
    lastError = String(e);
    return [] as Place[];
  });
  out.count = list.length;
  out.ok = list.length > 0;
  out.sample = list
    .slice(0, 3)
    .map((p) => ({ name: p.name, rating: p.rating, reviews: p.reviews, hours: p.hours }));
  out.error =
    lastError ||
    (list.length
      ? ""
      : "Google answered but returned no places that pass the filters (rating 4+, 25+ reviews)");
  return out;
}

// Look up one named place (e.g. pulled from a reel caption) on Google Places.
export async function findPlace(
  name: string,
  area: string,
  cat: Category,
  near?: City,
): Promise<Place | null> {
  const gkey = googleKey();
  if (!gkey) return null;
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": gkey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": MASK,
    },
    body: JSON.stringify({
      textQuery: `${name}${area ? ` ${area}` : ""}`,
      pageSize: 1,
      languageCode: "en",
      ...(near
        ? {
            locationBias: {
              circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) {
    console.error("findPlace", res.status);
    return null;
  }
  const p = ((await res.json()) as { places?: G[] }).places?.[0];
  if (!p?.location || !p.displayName) return null;
  const outdoors = cat === "Hike" || cat === "Scenic stop" || cat === "Sea view" || cat === "Walk";
  return {
    id: "g_" + p.id,
    name: p.displayName.text,
    area: area || (p.formattedAddress?.split(",").at(-2)?.trim() ?? ""),
    cat,
    rating: p.rating ?? 4.3,
    reviews: p.userRatingCount,
    price: PRICE[p.priceLevel ?? ""] ?? (outdoors ? 1 : 2),
    reason: (p.editorialSummary?.text ?? "").slice(0, 90),
    lat: p.location.latitude,
    lng: p.location.longitude,
    mins: DUR[cat],
    maps: p.googleMapsUri,
    web: p.websiteUri,
    insta: p.websiteUri?.includes("instagram.com") ? p.websiteUri : undefined,
    live: true,
  };
}

// City lookups for the "Where" picker (Google Places, our own key).
type GC = {
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
};
const CITY_MASK = "places.displayName,places.location,places.addressComponents";
const toCity = (p: GC): City | null => {
  const c = p.addressComponents?.find((a) => a.types.includes("country"));
  if (!p.displayName || !p.location || !c) return null;
  return {
    name: p.displayName.text,
    country: c.longText,
    cc: c.shortText,
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
};

export async function searchCityList(q: string): Promise<City[]> {
  const gkey = googleKey();
  if (!gkey || !q.trim()) return [];
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": gkey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": CITY_MASK,
    },
    body: JSON.stringify({
      textQuery: q,
      includedType: "locality",
      pageSize: 5,
      languageCode: "en",
    }),
  });
  if (!res.ok) {
    console.error("cities", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  return (((await res.json()) as { places?: GC[] }).places ?? [])
    .map(toCity)
    .filter((c): c is City => !!c);
}

export async function cityNear(lat: number, lng: number): Promise<City | null> {
  const gkey = googleKey();
  if (!gkey) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": gkey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": CITY_MASK,
    },
    body: JSON.stringify({
      includedTypes: ["locality"],
      maxResultCount: 1,
      rankPreference: "DISTANCE",
      languageCode: "en",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } },
    }),
  });
  if (!res.ok) {
    console.error("cityNear", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const p = ((await res.json()) as { places?: GC[] }).places?.[0];
  return p ? toCity(p) : null;
}

// Hotels / neighbourhoods for "Where are you staying?", biased to the trip city.
export async function searchStayList(
  q: string,
  near?: { lat: number; lng: number },
): Promise<{ name: string; address: string; lat: number; lng: number }[]> {
  const gkey = googleKey();
  if (!gkey || !q.trim()) return [];
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": gkey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: q,
      pageSize: 5,
      languageCode: "en",
      ...(near
        ? {
            locationBias: {
              circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 40000 },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) {
    console.error("stays", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  return (((await res.json()) as { places?: G[] }).places ?? [])
    .filter((p) => p.displayName && p.location)
    .map((p) => ({
      name: p.displayName!.text,
      address: p.formattedAddress ?? "",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}
