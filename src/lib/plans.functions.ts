import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// Per-visitor limit (by IP): enough for shuffles and retries, a wall for scripts.
const LIMIT = 20, WINDOW = 3600e3;
const hits = new Map<string, number[]>();
import { z } from "zod";
import { CATEGORIES, PLACES, AREAS, AREA_CENTER, isLebanon, kmBetween, byId, driveMins, toMin, registerPlaces, type Category, type Place } from "./places";
import { livePlaces, findInstas, placesStatus, geocodeArea } from "./live.server";
import { openAt, closedToday } from "./hours";
import { aiConfigured, aiStatus, askJSON, PlanOut } from "./ai.server";

const Input = z.object({
  q: z.string().max(300).default(""),
  what: z.array(z.string()).max(10).default([]),
  where: z.array(z.string()).max(10).default([]),
  day: z.string().max(20).default("Saturday"),
  time: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  people: z.string().max(20).default("2"),
  avoid: z.array(z.string().max(30)).max(12).default([]),
  prefs: z.array(z.string().max(30)).max(12).default([]),
  stay: z.string().max(20).default("No"),
  pace: z.enum(["Chill", "Packed"]).default("Chill"),
  budget: z.number().int().min(0).max(3).default(0),
  maxDrive: z.number().int().min(10).max(90).default(30),
  saved: z.array(z.object({
    id: z.string().max(200), name: z.string().max(120), area: z.string().max(60),
    cat: z.enum(CATEGORIES as [Category, ...Category[]]), rating: z.number(), price: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    reason: z.string().max(200), lat: z.number(), lng: z.number(), mins: z.number(),
    maps: z.string().max(300).optional(), web: z.string().max(300).optional(), insta: z.string().max(300).optional(),
    reviews: z.number().optional(), live: z.boolean().optional(), dish: z.string().max(60).optional(),
  })).max(15).default([]),
});

const AiOut = z.object({
  plans: z.array(z.object({
    title: z.string(),
    vibe: z.string(),
    stops: z.array(z.object({ placeId: z.string(), reason: z.string(), time: z.string().optional() })).min(2).max(6),
  })).min(1).max(4),
});

export type Stop = { placeId: string; time: number; reason: string };
export type Plan = { title: string; vibe: string; stops: Stop[] };

export const generatePlans = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    if (!aiConfigured()) return { error: "The planner isn't switched on yet (missing AI key)." };
    const ip = (getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0] || "anon").trim();
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
    if (recent.length >= LIMIT) {
      const mins = Math.ceil((WINDOW - (now - recent[0]!)) / 60000);
      return { error: `Easy habibi, that's a lot of plans. Try again in ${mins} min.` };
    }
    recent.push(now); hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    const known = [...new Set([...AREAS, ...Object.keys(AREA_CENTER)])];
    let areas = data.where.filter((a) => known.includes(a));
    const ql = data.q.toLowerCase().replace("jouniye", "jounieh").replace("byblos", "jbeil");
    const mentioned = known.filter((a) => ql.includes(a.toLowerCase()));
    areas = [...new Set([...areas, ...mentioned])];
    // Saved-from-reels places pull their areas in when the user did not pick any.
    if (!areas.length && data.saved.length) areas = [...new Set(data.saved.map((p) => p.area).filter((a) => known.includes(a)))];
    // Custom areas the user typed (any town or city in the world, not just our Lebanese list)
    const SPECIAL = ["Anywhere within 45 min", "Road trip"];
    const custom = [...new Set(data.where.map((a) => a.trim().slice(0, 60)).filter((a) => a && !known.includes(a) && !SPECIAL.includes(a)))].slice(0, 3);
    if (!areas.length && !custom.length && data.saved.length) areas = [...new Set(data.saved.map((p) => p.area).filter((a) => a && !isLebanon(a)))].slice(0, 3);
    const abroad = custom.length > 0 || areas.some((a) => !isLebanon(a));
    if (abroad) areas = [...new Set([...custom, ...areas.filter((a) => !isLebanon(a))])];
    else if (!areas.length || data.where.includes("Anywhere within 45 min") || data.where.includes("Road trip")) areas = AREAS;
    // Centres of the chosen areas; include every place within ~25 km so small areas still get full plans.
    const centers = abroad
      ? (await Promise.all(areas.map((a) => geocodeArea(a).catch(() => null)))).filter(Boolean) as [number, number][]
      : areas.map((a) => AREA_CENTER[a] ?? (() => { const ps = PLACES.filter((p) => p.area === a); return ps.length ? [ps.reduce((x, p) => x + p.lat, 0) / ps.length, ps.reduce((x, p) => x + p.lng, 0) / ps.length] as [number, number] : null; })()).filter(Boolean) as [number, number][];
    const radius = areas.length === AREAS.length ? 1e9 : 25;
    const inArea = PLACES.filter((p) => areas.includes(p.area) && p.cat !== "Stay");
    const roadTrip = data.where.includes("Road trip") || /road ?trip/i.test(data.q);
    let pool = !roadTrip && inArea.length >= 8
      ? PLACES.filter((p) => areas.includes(p.area) || (p.cat === "Stay" && centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius)))
      : PLACES.filter((p) => areas.includes(p.area) || centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius));
    if (pool.length < 12) pool = PLACES.filter((p) => centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= 45));
    if (pool.length < 8) pool = PLACES;
    // Outside Lebanon our curated list doesn't help: plan only from live Google results (and saved places)
    if (abroad) pool = [];
    // Live Google Places for the chosen areas
    const st = toMin(data.time), en = data.end ? toMin(data.end) : st + 8 * 60;
    const cats = new Set<Category>(["Specialty coffee", "Dessert"]);
    const all: Category[] = ["Breakfast", "Brunch", "Lunch", "Dinner", "Specialty coffee", "Dessert", "Sea view", "Walk", "Hike", "Scenic stop"];
    const wants = (data.what.join(" ") + " " + data.q + " " + data.prefs.join(" ")).toLowerCase();
    all.forEach((c) => { if (wants.includes(c.toLowerCase().split(" ")[0]!)) cats.add(c); });
    if (st < 11 * 60) cats.add("Breakfast");
    if (st <= 14 * 60 && en >= 13 * 60) cats.add("Lunch");
    if (en >= 20 * 60) cats.add("Dinner");
    if (en >= 17 * 60) cats.add("Sea view");
    if (/hike|hiking|nature|mountain/.test(wants)) cats.add("Hike");
    if (data.stay !== "No") cats.add("Stay");
    const liveAreas = abroad ? areas : areas.length === AREAS.length ? (roadTrip ? ["Batroun", "Douma", "Jbeil"] : ["Beirut", "Batroun"]) : areas;
    const avoidCats = new Set(data.avoid.map((a) => a.toLowerCase()));
    let live: Place[] = [];
    try { live = (await livePlaces({ areas: liveAreas, cats: [...cats].filter((c) => !avoidCats.has(c.toLowerCase())).slice(0, 7), day: data.day, stay: data.stay, prefs: data.prefs, q: data.q })); } catch (e) { console.error("live", e); }
    registerPlaces(live);
    if (live.length >= 10) pool = [...live, ...pool.filter((p) => p.cat === "Hike" || p.cat === "Scenic stop").slice(0, 6)];
    else pool = [...live, ...pool];
    // Code filters, so the model chooses instead of searching: closed that day, avoided, over budget
    pool = pool.filter((p) => !closedToday(p.hours) && !avoidCats.has(p.cat.toLowerCase()));
    if (data.budget) {
      const cheap = pool.filter((p) => p.price <= data.budget || p.cat === "Stay");
      if (cheap.length >= 8) pool = cheap;
    }
    const saved: Place[] = data.saved.filter((p) => p.cat !== "Stay").map(({ dish: _d, ...p }) => ({ ...p, live: p.live ?? !PLACES.some((x) => x.id === p.id) }));
    registerPlaces(saved.filter((p) => p.live));
    pool = [...saved, ...pool.filter((p) => !saved.some((x) => x.id === p.id))];
    const candidates = pool.map((p) => ({
      id: p.id, name: p.name, area: p.area, category: p.cat, rating: p.rating,
      price: "$".repeat(p.price), note: p.reason, new: !!p.isNew, lat: +p.lat.toFixed(3), lng: +p.lng.toFixed(3), stayMins: p.mins, reviews: p.reviews, hours: p.hours,
    }));
    const month = new Date().getMonth();
    const sunset = ["17:10","17:40","18:00","19:15","19:35","19:50","19:50","19:30","18:55","18:15","16:50","16:40"][month];

    const prompt = `Request: "${data.q}". Chips: ${data.what.join(", ") || "none"}. Areas: ${areas.join(", ")} (STRONGLY prefer places in these areas; use nearby areas only if nothing fits, and say so in the vibe). Day: ${data.day}, start ${data.time}.
Candidates are real places from Google Maps (rating, review count, opening hours on that day). Prefer high rating with many reviews. NEVER schedule a stop outside its hours; skip places "Closed" that day. Use ONLY these ids: ${JSON.stringify(candidates)}
Group: ${data.people} people. Time window: ${data.time} to ${data.end ?? "open"}. Pace: ${data.pace} (Chill = 2-3 stops with breathing room; Packed = 3-4 stops).
NOT into (never include these): ${data.avoid.join(", ") || "nothing"}. Preferences (respect food needs strictly, e.g. Vegan / Halal / No alcohol means pick places that fit): ${data.prefs.join(", ") || "none"}.${data.budget ? ` Budget: ${"$".repeat(data.budget)} max per place.` : ""}
Overnight: ${data.stay === "No" ? "no, day trip only. Never use Stay places." : `yes, end each plan with ONE Stay place of type "${data.stay === "Surprise me" ? "any" : data.stay}" (its note starts with the type), in or near the last area. The Stay counts as an extra stop.`}
RULES (be the smartest local friend):
- Timing: breakfast 8:00-10:30, brunch 10:00-13:00, lunch 12:30-15:30, dinner 19:30-22:30, hikes start before 11:00, Sea view / sunset stops ~45 min before sunset (${sunset} today). Coffee/dessert between meals.
- Geography: estimate drives from lat/lng (~1.5 min per km on local roads, mountains slower). Order stops so the route flows one direction, never backtrack. Max ${data.maxDrive} min between stops unless it is a road trip (max 60).
- Everything must fit in the time window, including drives. Drop stops rather than overflow.
- Never two meals back to back, never two of the same category in a row.
- For each stop give "time" as "HH:MM" (your suggested arrival).
Make exactly 3 genuinely different weekend plans (e.g. one city, one mountain/hike or road trip, one sea) fitting the time window. Road trips may chain nearby areas (e.g. breakfast in Douma then Tannourine hike then lunch).${abroad ? ` The user is planning OUTSIDE Lebanon (${areas.join(", ")}): only use the given candidates there, never Lebanese places.` : ""} Morning starts suit Breakfast/Hike. Suit the group size (solo = cafes/walks, big group = big tables, grills). Each plan has stops in a sensible order (meal times make sense, sunset spots late afternoon, keep drives short unless it is a road trip). Titles short and playful (e.g. "Batroun slow Sunday"). Vibe is one line like "Pasta, cortado, then sunset". Each stop reason is max 7 words. If "Something new" was asked, prefer new:true places.${saved.length ? `
SAVED: the user saved these from reels they loved: ${JSON.stringify(data.saved.map((p) => ({ id: p.id, name: p.name, area: p.area, mustOrder: p.dish })))}. Build plans AROUND them: every plan should include at least one saved place (more when they are close together), still respecting hours, timing and geography. Mention the mustOrder dish in that stop's reason when given.` : ""}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await askJSON(
        "You plan fun weekend outings (mostly in Lebanon, sometimes anywhere in the world), like the smartest local friend. Light, slightly Lebanese tone in English. Use only the place ids you are given.",
        prompt,
        PlanOut,
      );
      if (!res.ok && res.kind === "credits") return { error: "Out of AI credits for now." };
      if (!res.ok && res.kind === "busy") return { error: "Too many plans at once. Breathe, try again in a minute." };
      if (!res.ok && (res.kind === "key" || res.kind === "refused")) { console.error("ai", res.kind, res.error); break; }
      if (!res.ok) { console.error("ai", res.error); continue; }
      try {
        const parsed = AiOut.parse(res.data);
        const taken = new Set<string>();
        const plans: Plan[] = parsed.plans.map((p) => {
          let t = toMin(data.time);
          const out: Stop[] = [];
          for (const s of p.stops) {
            let place = byId(s.placeId);
            if (!place || out.some((o) => o.placeId === place!.id)) continue;
            let reason = s.reason;
            const prev = out.length ? byId(out.at(-1)!.placeId)! : null;
            // t is the previous stop's arrival; work on a copy so a dropped stop doesn't move the clock
            let at = prev ? Math.ceil((t + prev.mins + driveMins(prev, place)) / 15) * 15 : t;
            if (s.time && /^\d{1,2}:\d{2}$/.test(s.time)) at = Math.max(at, toMin(s.time));
            // Google hours are the truth: if the model put a stop at a closed time,
            // swap in the nearest open place of the same type, or drop the stop.
            if (place.cat !== "Stay" && !openAt(place.hours, at, place.mins)) {
              const from = prev ?? place;
              const alt = pool
                .filter((x) => x.cat === place!.cat && x.id !== place!.id && !taken.has(x.id) && !out.some((o) => o.placeId === x.id)
                  && openAt(x.hours, at, x.mins) && driveMins(from, x) <= data.maxDrive + 15)
                .sort((a, b) => driveMins(from, a) - driveMins(from, b) || b.rating - a.rating)[0];
              if (!alt) continue;
              place = alt;
              reason = alt.reason || reason;
            }
            if (out.length >= 2 && data.end && place.cat !== "Stay" && at > toMin(data.end)) break;
            out.push({ placeId: place.id, reason, time: at });
            t = at;
          }
          out.forEach((o) => taken.add(o.placeId));
          return { title: p.title, vibe: p.vibe, stops: out };
        }).filter((p) => p.stops.length >= 2);
        if (plans.length) {
          const used = [...new Set(plans.flatMap((p) => p.stops.map((s) => s.placeId)))].map((id) => byId(id)!).filter((p) => p.live);
          await findInstas(used);
          registerPlaces(used);
          return { plans, places: pool.filter((p) => p.live).map((p) => byId(p.id)!) };
        }
      } catch (e) { console.error("bad AI output", e); }
    }
    return { error: "Our friend who knows every spot is not answering. Try again?" };
  });

export const checkStatus = createServerFn({ method: "GET" }).handler(async () => ({ ...(await placesStatus()), ai: await aiStatus() }));
