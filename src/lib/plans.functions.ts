import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// Simple per-person limit: 1 plan request per hour per visitor (by IP).
const LIMIT = 1, WINDOW = 3600e3;
const hits = new Map<string, number[]>();
import { z } from "zod";
import { PLACES, AREAS, AREA_CENTER, kmBetween, byId, driveMins, toMin, registerPlaces, type Category, type Place } from "./places";
import { livePlaces, findInstas } from "./live.server";

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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI not configured");
    const ip = (getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0] || "anon").trim();
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
    if (recent.length >= LIMIT) {
      const mins = Math.ceil((WINDOW - (now - recent[0]!)) / 60000);
      return { error: `Easy habibi, one plan per hour. Try again in ${mins} min.` };
    }
    recent.push(now); hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    const known = [...new Set([...AREAS, ...Object.keys(AREA_CENTER)])];
    let areas = data.where.filter((a) => known.includes(a));
    const ql = data.q.toLowerCase().replace("jouniye", "jounieh").replace("byblos", "jbeil");
    const mentioned = known.filter((a) => ql.includes(a.toLowerCase()));
    areas = [...new Set([...areas, ...mentioned])];
    if (!areas.length || data.where.includes("Anywhere within 45 min") || data.where.includes("Road trip")) areas = AREAS;
    // Centres of the chosen areas; include every place within ~25 km so small areas still get full plans.
    const centers = areas.map((a) => AREA_CENTER[a] ?? (() => { const ps = PLACES.filter((p) => p.area === a); return ps.length ? [ps.reduce((x, p) => x + p.lat, 0) / ps.length, ps.reduce((x, p) => x + p.lng, 0) / ps.length] as [number, number] : null; })()).filter(Boolean) as [number, number][];
    const radius = areas.length === AREAS.length ? 1e9 : 25;
    const inArea = PLACES.filter((p) => areas.includes(p.area) && p.cat !== "Stay");
    const roadTrip = data.where.includes("Road trip") || /road ?trip/i.test(data.q);
    let pool = !roadTrip && inArea.length >= 8
      ? PLACES.filter((p) => areas.includes(p.area) || (p.cat === "Stay" && centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius)))
      : PLACES.filter((p) => areas.includes(p.area) || centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius));
    if (pool.length < 12) pool = PLACES.filter((p) => centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= 45));
    if (pool.length < 8) pool = PLACES;
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
    const liveAreas = areas.length === AREAS.length ? (roadTrip ? ["Batroun", "Douma", "Jbeil"] : ["Beirut", "Batroun"]) : areas;
    const avoidCats = new Set(data.avoid.map((a) => a.toLowerCase()));
    let live: Place[] = [];
    try { live = (await livePlaces({ areas: liveAreas, cats: [...cats].filter((c) => !avoidCats.has(c.toLowerCase())).slice(0, 7), day: data.day, stay: data.stay })); } catch (e) { console.error("live", e); }
    registerPlaces(live);
    if (live.length >= 10) pool = [...live, ...pool.filter((p) => p.cat === "Hike" || p.cat === "Scenic stop").slice(0, 6)];
    else pool = [...live, ...pool];
    const candidates = pool.map((p) => ({
      id: p.id, name: p.name, area: p.area, category: p.cat, rating: p.rating,
      price: "$".repeat(p.price), note: p.reason, new: !!p.isNew, lat: +p.lat.toFixed(3), lng: +p.lng.toFixed(3), stayMins: p.mins, reviews: p.reviews, hours: p.hours,
    }));
    const month = new Date().getMonth();
    const sunset = ["17:10","17:40","18:00","19:15","19:35","19:50","19:50","19:30","18:55","18:15","16:50","16:40"][month];

    const prompt = `Request: "${data.q}". Chips: ${data.what.join(", ") || "none"}. Areas: ${areas.join(", ")} (STRONGLY prefer places in these areas; use nearby areas only if nothing fits, and say so in the vibe). Day: ${data.day}, start ${data.time}.
Candidates are real places from Google Maps (rating, review count, opening hours on that day). Prefer high rating with many reviews. NEVER schedule a stop outside its hours; skip places "Closed" that day. Use ONLY these ids: ${JSON.stringify(candidates)}
Group: ${data.people} people. Time window: ${data.time} to ${data.end ?? "open"}. Pace: ${data.pace} (Chill = 2-3 stops with breathing room; Packed = 3-4 stops).
NOT into (never include these): ${data.avoid.join(", ") || "nothing"}. Preferences: ${data.prefs.join(", ") || "none"}.
Overnight: ${data.stay === "No" ? "no, day trip only. Never use Stay places." : `yes, end each plan with ONE Stay place of type "${data.stay === "Surprise me" ? "any" : data.stay}" (its note starts with the type), in or near the last area. The Stay counts as an extra stop.`}
RULES (be the smartest local friend):
- Timing: breakfast 8:00-10:30, brunch 10:00-13:00, lunch 12:30-15:30, dinner 19:30-22:30, hikes start before 11:00, Sea view / sunset stops ~45 min before sunset (${sunset} today). Coffee/dessert between meals.
- Geography: estimate drives from lat/lng (~1.5 min per km on Lebanese roads, mountains slower). Order stops so the route flows one direction, never backtrack. Max 30 min between stops unless it is a road trip (max 60).
- Everything must fit in the time window, including drives. Drop stops rather than overflow.
- Never two meals back to back, never two of the same category in a row.
- For each stop give "time" as "HH:MM" (your suggested arrival).
Make exactly 3 genuinely different weekend plans (e.g. one city, one mountain/hike or road trip, one sea) fitting the time window. Road trips may chain nearby areas (e.g. breakfast in Douma then Tannourine hike then lunch). Morning starts suit Breakfast/Hike. Suit the group size (solo = cafes/walks, big group = big tables, grills). Each plan has stops in a sensible order (meal times make sense, sunset spots late afternoon, keep drives short unless it is a road trip). Titles short and playful (e.g. "Batroun slow Sunday"). Vibe is one line like "Pasta, cortado, then sunset". Each stop reason is max 7 words. If "Something new" was asked, prefer new:true places.`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          messages: [
            { role: "system", content: 'You plan fun Lebanese weekend outings. Light, slightly Lebanese tone in English. Reply ONLY with JSON: {"plans":[{"title":string,"vibe":string,"stops":[{"placeId":string,"reason":string,"time":"HH:MM"}]}]}' },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "medium",
        }),
      });
      if (res.status === 429) return { error: "Too many plans at once. Breathe, try again in a minute." };
      if (res.status === 402) return { error: "Out of AI credits for now." };
      if (!res.ok) { console.error(res.status, await res.text()); continue; }
      try {
        const json = await res.json();
        const args = json.choices[0].message.content;
        const parsed = AiOut.parse(JSON.parse(args));
        const plans: Plan[] = parsed.plans.map((p) => {
          let t = toMin(data.time);
          const valid = p.stops.filter((s) => byId(s.placeId));
          return {
            title: p.title, vibe: p.vibe,
            stops: valid.map((s, i) => {
              const place = byId(s.placeId)!;
              if (i > 0) { const prev = byId(valid[i - 1]!.placeId)!; t += prev.mins + driveMins(prev, place); t = Math.ceil(t / 15) * 15; }
              if (s.time && /^\d{1,2}:\d{2}$/.test(s.time)) t = Math.max(t, toMin(s.time));
              return { placeId: s.placeId, reason: s.reason, time: t };
            }).filter((st, i) => i < 2 || !data.end || byId(st.placeId)!.cat === "Stay" || st.time <= toMin(data.end!)),
          };
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
