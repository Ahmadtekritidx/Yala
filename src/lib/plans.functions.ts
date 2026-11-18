import { createServerFn } from "@tanstack/react-start";
import { rateLimit } from "./limit.server";

// Per-visitor limit (by IP): enough for shuffles and retries, a wall for scripts.
const LIMIT = 20,
  WINDOW = 3600e3;
import { z } from "zod";
import {
  CATEGORIES,
  PLACES,
  AREAS,
  AREA_CENTER,
  kmBetween,
  byId,
  driveMins,
  toMin,
  registerGooglePlaces,
  type Category,
  type Place,
} from "./places";
import { livePlaces, findInstas, placesStatus } from "./live.server";
import { openAt, closedToday, hoursOn, WEEKDAYS } from "./hours";
import { isLebanon } from "./city";
import { aiConfigured, aiStatus, askJSON, PlanOut } from "./ai.server";
import { logEvents } from "./log.server";
import { storePing } from "./store.server";
import { areasIn, categoriesIn, wantsHike } from "./intent";
import { composeDay } from "./compose/compose.server";
import { scorePlace } from "./compose/score";
import { localSunset } from "./compose/sun";
import { dietOf } from "./alternatives";
import { ROAD_TRIP_MAX_DRIVE } from "./rules";
import { nextDate } from "./share";

// Links sent by the browser: keep only plain web links.
const webLink = z
  .string()
  .max(300)
  .optional()
  .transform((u) => (u && /^https?:\/\//i.test(u) ? u : undefined));

const Input = z.object({
  q: z.string().max(300).default(""),
  what: z.array(z.string()).max(10).default([]),
  where: z.array(z.string()).max(10).default([]),
  day: z.string().max(20).default("Saturday"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("12:00"),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  people: z.string().max(20).default("2"),
  avoid: z.array(z.string().max(30)).max(12).default([]),
  prefs: z.array(z.string().max(30)).max(12).default([]),
  stay: z.string().max(20).default("No"),
  pace: z.enum(["Chill", "Packed"]).default("Chill"),
  budget: z.number().int().min(0).max(3).default(0),
  maxDrive: z.number().int().min(10).max(90).default(30),
  days: z.number().int().min(1).max(7).default(1),
  base: z.object({ name: z.string().max(120), lat: z.number(), lng: z.number() }).optional(),
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  city: z
    .object({
      name: z.string().max(80),
      country: z.string().max(80),
      cc: z.string().length(2),
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  saved: z
    .array(
      z.object({
        id: z.string().max(200),
        name: z.string().max(120),
        area: z.string().max(60),
        cat: z.enum(CATEGORIES as [Category, ...Category[]]),
        rating: z.number(),
        price: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        reason: z.string().max(200),
        lat: z.number(),
        lng: z.number(),
        mins: z.number(),
        maps: webLink,
        web: webLink,
        insta: webLink,
        reviews: z.number().optional(),
        live: z.boolean().optional(),
        dish: z.string().max(60).optional(),
      }),
    )
    .max(15)
    .default([]),
  // Anonymous id of this browser (random, made on the device), to join events from the same person.
  device: z.string().uuid().optional(),
  // Set by a "Not quite right?" button: the run being adjusted. The first adjust of a run is free.
  adjustOf: z.string().uuid().optional(),
  // How many times this search was shuffled: a repeat of the same request and attempt counts once.
  attempt: z.number().int().min(0).max(1000).default(0),
});

const AiOut = z.object({
  plans: z
    .array(
      z.object({
        title: z.string(),
        vibe: z.string(),
        stops: z
          .array(z.object({ placeId: z.string(), reason: z.string(), time: z.string().optional() }))
          .min(2)
          .max(7),
      }),
    )
    .min(1)
    .max(7),
});

export type Stop = { placeId: string; time: number; reason: string };
export type Plan = {
  title: string;
  vibe: string;
  stops: Stop[];
  /** Why this plan suits the group, from the Choose step (day-out plans). */
  why?: string | undefined;
  day?: string | undefined;
  date?: string | undefined;
  base?: { name: string; lat: number; lng: number } | undefined;
};

export const generatePlans = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    // One id per request: it joins the AI calls, this event and the user's taps on these plans.
    const runId = crypto.randomUUID();
    const started = Date.now();
    const r = await buildPlans(data, runId);
    await logEvents([
      {
        name: "error" in r ? "plans_failed" : "plans_generated",
        run_id: runId,
        device_id: data.device ?? null,
        props: {
          q: data.q.slice(0, 300),
          what: data.what,
          where: data.where,
          day: data.day,
          time: data.time,
          end: data.end ?? null,
          people: data.people,
          budget: data.budget,
          avoid: data.avoid,
          prefs: data.prefs,
          days: data.days,
          city: data.city?.name ?? null,
          saved: data.saved.length,
          latency_ms: Date.now() - started,
          ...("error" in r
            ? { error: r.error }
            : {
                plans: r.plans.length,
                stops: r.plans.map((p) => p.stops.length),
                place_ids: r.plans.map((p) => p.stops.map((st) => st.placeId)),
              }),
        },
      },
    ]).catch(() => {});
    return { ...r, runId };
  });

// Free version (docs/ai/compose-plans.md, Step 8): plans per browser, counted by its anonymous id.
// Requests without one (scripts, the exam runner) only meet the per-IP limit below.
const FREE_PER_DAY = Number(process.env["YALLA_FREE_PER_DAY"] ?? 2);
const FREE_PER_MONTH = Number(process.env["YALLA_FREE_PER_MONTH"] ?? 5);
const DAY_MS = 24 * 3600e3;

async function freeLimit(data: z.infer<typeof Input>): Promise<string> {
  if (!data.device || FREE_PER_DAY <= 0) return "";
  if (
    data.adjustOf &&
    !(await rateLimit("adjust", 1, 30 * DAY_MS, `${data.device}:${data.adjustOf}`))
  )
    return "";
  const day = await rateLimit("free-day", FREE_PER_DAY, DAY_MS, data.device);
  if (day)
    return `You've used your ${FREE_PER_DAY} free plans for today. Your recent plans are on the home page; new ones tomorrow (in about ${Math.ceil(day / 60)}h). Unlimited plans are coming soon.`;
  const month = await rateLimit("free-month", FREE_PER_MONTH, 30 * DAY_MS, data.device);
  if (month)
    return `You've used your ${FREE_PER_MONTH} free plans this month. Your recent plans are on the home page; new ones in ${Math.ceil(month / 1440)} days. Unlimited plans are coming soon.`;
  return "";
}

async function buildPlans(data: z.infer<typeof Input>, runId: string) {
  const free = await freeLimit(data);
  if (free) return { error: free, limit: true };
  const mins = await rateLimit("plans", LIMIT, WINDOW);
  if (mins) return { error: `Easy habibi, that's a lot of plans. Try again in ${mins} min.` };
  // Trip mode: one plan per day from the start date, each with its own weekday (opening hours differ).
  const trip = data.days > 1;
  const startDate = data.start ? new Date(data.start + "T12:00:00Z") : new Date();
  const tripDays = trip
    ? Array.from({ length: data.days }, (_, k) => {
        const d = new Date(startDate.getTime() + k * 864e5);
        return { name: WEEKDAYS[(d.getUTCDay() + 6) % 7]!, date: d.toISOString().slice(0, 10) };
      })
    : [];
  const dayOf = (k: number) => (trip ? (tripDays[k]?.name ?? data.day) : data.day);
  // Any city outside Lebanon: no hand-picked inventory, everything comes live from Google.
  const geo = data.city && !isLebanon(data.city) ? data.city : undefined;
  // In Lebanon, a town picked in the city picker (El Mina, Jounieh) or the current location:
  // plans are built around that point (docs/ai/compose-plans.md: max drive from where you are).
  const spot =
    data.city && isLebanon(data.city) && data.city.name !== "Lebanon" ? data.city : undefined;
  const known = geo ? [geo.name] : [...new Set([...AREAS, ...Object.keys(AREA_CENTER)])];
  let areas = geo ? [geo.name] : data.where.filter((a) => known.includes(a));
  const mentioned = areasIn(data.q, known);
  areas = [...new Set([...areas, ...mentioned])];
  // Saved-from-reels places pull their areas in when the user did not pick any.
  if (spot && !areas.length) {
    const near = known.filter((a) => {
      const c =
        AREA_CENTER[a] ??
        (() => {
          const ps = PLACES.filter((p) => p.area === a);
          return ps.length
            ? ([
                ps.reduce((x, p) => x + p.lat, 0) / ps.length,
                ps.reduce((x, p) => x + p.lng, 0) / ps.length,
              ] as [number, number])
            : null;
        })();
      return c && kmBetween(c, [spot.lat, spot.lng]) <= 15;
    });
    areas = near.length ? near : areasIn(spot.name, known);
  }
  if (!areas.length && data.saved.length)
    areas = [...new Set(data.saved.map((p) => p.area).filter((a) => known.includes(a)))];
  if (
    !geo &&
    !(spot && !data.where.length) &&
    (!areas.length ||
      data.where.includes("Anywhere within 45 min") ||
      data.where.includes("Road trip"))
  )
    areas = AREAS;
  // Centres of the chosen areas; include every place within ~25 km so small areas still get full plans.
  const centers = data.base
    ? [[data.base.lat, data.base.lng] as [number, number]]
    : spot
      ? [[spot.lat, spot.lng] as [number, number]]
      : geo
        ? [[geo.lat, geo.lng] as [number, number]]
        : (areas
            .map(
              (a) =>
                AREA_CENTER[a] ??
                (() => {
                  const ps = PLACES.filter((p) => p.area === a);
                  return ps.length
                    ? ([
                        ps.reduce((x, p) => x + p.lat, 0) / ps.length,
                        ps.reduce((x, p) => x + p.lng, 0) / ps.length,
                      ] as [number, number])
                    : null;
                })(),
            )
            .filter(Boolean) as [number, number][]);
  const radius = areas.length === AREAS.length ? 1e9 : 25;
  const inArea = PLACES.filter((p) => areas.includes(p.area) && p.cat !== "Stay");
  const roadTrip = data.where.includes("Road trip") || /road ?trip/i.test(data.q);
  let pool =
    !roadTrip && inArea.length >= 8
      ? PLACES.filter(
          (p) =>
            areas.includes(p.area) ||
            (p.cat === "Stay" && centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius)),
        )
      : PLACES.filter(
          (p) =>
            areas.includes(p.area) || centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= radius),
        );
  if (pool.length < 12)
    pool = PLACES.filter((p) => centers.some((c) => kmBetween(c, [p.lat, p.lng]) <= 45));
  if (pool.length < 8 && !geo) pool = PLACES;
  // Live Google Places for the chosen areas
  const st = toMin(data.time),
    en = data.end ? toMin(data.end) : st + 8 * 60;
  const cats = new Set<Category>(["Specialty coffee", "Dessert"]);
  const wants = (data.what.join(" ") + " " + data.q + " " + data.prefs.join(" ")).toLowerCase();
  categoriesIn(wants).forEach((c) => cats.add(c));
  if (st < 11 * 60) cats.add("Breakfast");
  if (st <= 14 * 60 && en >= 13 * 60) cats.add("Lunch");
  if (en >= 20 * 60) cats.add("Dinner");
  if (en >= 17 * 60) cats.add("Sea view");
  if (wantsHike(wants)) cats.add("Hike");
  if (data.stay !== "No") cats.add("Stay");
  // A trip needs the full day and the sights, not just what the chips asked for.
  if (trip)
    ["Breakfast", "Lunch", "Dinner", "Scenic stop", "Walk"].reverse().forEach((c) => {
      cats.delete(c as Category);
      cats.add(c as Category);
    });
  const catList = trip ? [...cats].reverse() : [...cats];
  const liveAreas = geo
    ? [geo.name]
    : spot && !data.where.length
      ? [...new Set([...areas.slice(0, 1), spot.name])]
      : areas.length === AREAS.length
        ? roadTrip
          ? ["Batroun", "Douma", "Jbeil"]
          : ["Beirut", "Batroun"]
        : areas;
  const avoidCats = new Set(data.avoid.map((a) => a.toLowerCase()));
  let live: Place[] = [];
  try {
    live = await livePlaces({
      areas: liveAreas,
      cats: catList.filter((c) => !avoidCats.has(c.toLowerCase())).slice(0, 7),
      day: dayOf(0),
      stay: data.stay,
      prefs: data.prefs,
      q: data.q,
      geo: geo && data.base ? { ...geo, lat: data.base.lat, lng: data.base.lng } : geo,
    });
  } catch (e) {
    console.error("live", e);
  }
  registerGooglePlaces(live);
  const fromGoogle = new Set(live);
  if (geo && live.length < 4)
    return {
      error: `We couldn't find enough good spots in ${geo.name} right now. Try a bigger city nearby?`,
    };
  if (live.length >= 10)
    pool = [
      ...live,
      ...pool.filter((p) => p.cat === "Hike" || p.cat === "Scenic stop").slice(0, 6),
    ];
  else pool = [...live, ...pool];
  // Code filters, so the model chooses instead of searching: closed that day, avoided, over budget
  pool = pool.filter(
    (p) =>
      (trip ? !tripDays.every((d) => closedToday(hoursOn(p, d.name))) : !closedToday(p.hours)) &&
      !avoidCats.has(p.cat.toLowerCase()),
  );
  if (data.budget) {
    const cheap = pool.filter((p) => p.price <= data.budget || p.cat === "Stay");
    if (cheap.length >= 8) pool = cheap;
  }
  // Saves from another city or country would wreck the route, keep only ones near this plan.
  const saved: Place[] = data.saved
    .filter(
      (p) => p.cat !== "Stay" && (!geo || kmBetween([geo.lat, geo.lng], [p.lat, p.lng]) <= 60),
    )
    .map(({ dish: _d, ...p }) => ({ ...p, live: p.live ?? !PLACES.some((x) => x.id === p.id) }));
  pool = [...saved, ...pool.filter((p) => !saved.some((x) => x.id === p.id))];
  // This request's places first: saved places live here only, never in the shared registry.
  const local = new Map(pool.map((p) => [p.id, p]));
  const find = (id: string) => local.get(id) ?? byId(id);

  // Day out: the new composer (docs/ai/compose-plans.md). Code builds valid routes, AI chooses and
  // writes, code checks; it still works, more plainly, with the AI off. Trips keep the path below.
  if (!trip)
    return composeDayOut(data, {
      pool,
      find,
      centers,
      areas,
      geo,
      roadTrip,
      st,
      en,
      fromGoogle,
      runId,
    });
  if (!aiConfigured()) return { error: "The planner isn't switched on yet (missing AI key)." };
  const candidates = pool.map((p) => ({
    id: p.id,
    name: p.name,
    area: p.area,
    category: p.cat,
    rating: p.rating,
    price: "$".repeat(p.price),
    note: p.reason,
    new: !!p.isNew,
    lat: +p.lat.toFixed(3),
    lng: +p.lng.toFixed(3),
    stayMins: p.mins,
    reviews: p.reviews,
    hours: p.hours,
    ...(trip
      ? { closedOn: tripDays.filter((d) => closedToday(hoursOn(p, d.name))).map((d) => d.name) }
      : {}),
  }));
  const month = new Date().getMonth();
  const region = geo ? `${geo.name}, ${geo.country}` : "Lebanon";
  const sunset = geo
    ? `local sunset in ${region} this month`
    : [
        "17:10",
        "17:40",
        "18:00",
        "19:15",
        "19:35",
        "19:50",
        "19:50",
        "19:30",
        "18:55",
        "18:15",
        "16:50",
        "16:40",
      ][month] + " today";

  const prompt = `Request: "${data.q}". Chips: ${data.what.join(", ") || "none"}. Areas: ${areas.join(", ")} (STRONGLY prefer places in these areas; use nearby areas only if nothing fits, and say so in the vibe). Day: ${data.day}, start ${data.time}.
Candidates are real places from Google Maps (rating, review count, opening hours on that day). Prefer high rating with many reviews. NEVER schedule a stop outside its hours; skip places "Closed" that day. Use ONLY these ids: ${JSON.stringify(candidates)}
Group: ${data.people} people. Time window: ${data.time} to ${data.end ?? "open"}. Pace: ${data.pace} (Chill = 2-3 stops with breathing room; Packed = 3-4 stops).
NOT into (never include these): ${data.avoid.join(", ") || "nothing"}. Preferences (respect food needs strictly, e.g. Vegan / Halal / No alcohol means pick places that fit): ${data.prefs.join(", ") || "none"}.${data.budget ? ` Budget: ${"$".repeat(data.budget)} max per place.` : ""}
Overnight: ${data.stay === "No" ? "no, day trip only. Never use Stay places." : `yes, end each plan with ONE Stay place of type "${data.stay === "Surprise me" ? "any" : data.stay}" (its note starts with the type), in or near the last area. The Stay counts as an extra stop.`}
RULES (be the smartest local friend):
- Timing: breakfast 8:00-10:30, brunch 10:00-13:00, lunch 12:30-15:30, dinner 19:30-22:30, hikes start before 11:00, Sea view / sunset stops ~45 min before sunset (${sunset}). Coffee/dessert between meals.
- Geography: estimate drives from lat/lng (~1.5 min per km on ${geo ? "city" : "Lebanese"} roads, mountains slower). Order stops so the route flows one direction, never backtrack. Max ${data.maxDrive} min between stops unless it is a road trip (max 60).
- Everything must fit in the time window, including drives. Drop stops rather than overflow.
- Never two meals back to back, never two of the same category in a row.
- For each stop give "time" as "HH:MM" (your suggested arrival).
${
  data.base
    ? `STAYING AT: ${data.base.name} (lat ${data.base.lat.toFixed(3)}, lng ${data.base.lng.toFixed(3)}). Start every day close to it and finish back near it; prefer places within ~25 min of it, and only go further for a must-see.
`
    : ""
}${
    trip
      ? `TRIP: ${data.days} days in ${region}: ${tripDays.map((d, k) => `Day ${k + 1} = ${d.name} ${d.date}`).join(", ")}. Hours shown are for Day 1; NEVER put a place on a day listed in its closedOn.
Make exactly ${data.days} plans, plan k is Day k, in order. NEVER repeat a place across days. Give each day its own theme and neighbourhood (e.g. old city icons, food and markets, views and evening, a day trip), and cover the must-see highlights of ${region} across the trip. 3-5 stops a day with real meals. Titles like "Day 1 · Old city icons". Ignore the "3 different plans" rule below.
`
      : ""
  }Make exactly 3 genuinely different weekend plans in ${region} (e.g. ${geo ? "one food-led, one outdoors or culture, one evening/views" : "one city, one mountain/hike or road trip, one sea"}) fitting the time window.${geo ? " Respect local customs (prayer times, family sections, dress codes) when relevant." : " Road trips may chain nearby areas (e.g. breakfast in Douma then Tannourine hike then lunch)."} Morning starts suit Breakfast/Hike. Suit the group size (solo = cafes/walks, big group = big tables, grills). Each plan has stops in a sensible order (meal times make sense, sunset spots late afternoon, keep drives short unless it is a road trip). Titles short and playful (e.g. "${geo ? `${geo.name} slow ${data.day}` : "Batroun slow Sunday"}"). Vibe is one line like "Pasta, cortado, then sunset". Each stop reason is max 7 words. If "Something new" was asked, prefer new:true places.${
    saved.length
      ? `
SAVED: the user saved these from reels they loved: ${JSON.stringify(data.saved.filter((p) => saved.some((x) => x.id === p.id)).map((p) => ({ id: p.id, name: p.name, area: p.area, mustOrder: p.dish })))}. Build plans AROUND them: every plan should include at least one saved place (more when they are close together), still respecting hours, timing and geography. Mention the mustOrder dish in that stop's reason when given.`
      : ""
  }`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await askJSON(
      geo
        ? `You plan fun weekend outings in ${geo.name}, ${geo.country}, like the smartest local friend. Warm English with a light local flavour. Use only the place ids you are given.`
        : "You plan fun Lebanese weekend outings, like the smartest local friend. Light, slightly Lebanese tone in English. Use only the place ids you are given.",
      prompt,
      PlanOut,
      "medium",
      { feature: "plans", runId, promptVersion: "plans-v1", input: data.q },
    );
    if (!res.ok && res.kind === "credits") return { error: "Out of AI credits for now." };
    if (!res.ok && res.kind === "busy")
      return { error: "Too many plans at once. Breathe, try again in a minute." };
    if (!res.ok && (res.kind === "key" || res.kind === "refused")) {
      console.error("ai", res.kind, res.error);
      break;
    }
    if (!res.ok) {
      console.error("ai", res.error);
      continue;
    }
    try {
      const parsed = AiOut.parse(res.data);
      const taken = new Set<string>();
      const plans: Plan[] = parsed.plans
        .slice(0, trip ? data.days : 4)
        .map((p, k) => {
          const day = dayOf(k);
          let t = toMin(data.time);
          const out: Stop[] = [];
          for (const s of p.stops) {
            let place = find(s.placeId);
            if (!place || out.some((o) => o.placeId === place!.id) || (trip && taken.has(place.id)))
              continue;
            let reason = s.reason;
            const prev = out.length ? find(out.at(-1)!.placeId)! : null;
            // t is the previous stop's arrival; work on a copy so a dropped stop doesn't move the clock
            let at = prev ? Math.ceil((t + prev.mins + driveMins(prev, place)) / 15) * 15 : t;
            if (s.time && /^\d{1,2}:\d{2}$/.test(s.time)) at = Math.max(at, toMin(s.time));
            // Google hours are the truth: if the model put a stop at a closed time,
            // swap in the nearest open place of the same type, or drop the stop.
            if (place.cat !== "Stay" && !openAt(hoursOn(place, day), at, place.mins)) {
              const from = prev ?? place;
              const alt = pool
                .filter(
                  (x) =>
                    x.cat === place!.cat &&
                    x.id !== place!.id &&
                    !taken.has(x.id) &&
                    !out.some((o) => o.placeId === x.id) &&
                    openAt(hoursOn(x, day), at, x.mins) &&
                    driveMins(from, x) <= data.maxDrive + 15,
                )
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
          return {
            title: p.title,
            vibe: p.vibe,
            stops: out,
            ...(trip ? { day, date: tripDays[k]!.date } : {}),
            ...(data.base ? { base: data.base } : {}),
          };
        })
        .filter((p) => p.stops.length >= 2);
      if (plans.length) {
        const used = [...new Set(plans.flatMap((p) => p.stops.map((s) => s.placeId)))]
          .map((id) => find(id)!)
          .filter((p) => p.live);
        await findInstas(used);
        registerGooglePlaces(used.filter((p) => fromGoogle.has(p)));
        return { plans, places: pool.filter((p) => p.live) };
      }
    } catch (e) {
      console.error("bad AI output", e);
    }
  }
  return { error: "Our friend who knows every spot is not answering. Try again?" };
}

type DayOutContext = {
  pool: Place[];
  find: (id: string) => Place | undefined;
  centers: [number, number][];
  areas: string[];
  geo: { name: string; country: string; lat: number; lng: number } | undefined;
  roadTrip: boolean;
  st: number;
  en: number;
  fromGoogle: Set<Place>;
  runId: string;
};

const WHAT_CATEGORY: Record<string, Category> = {
  Coffee: "Specialty coffee",
  Brunch: "Brunch",
  Lunch: "Lunch",
  Dinner: "Dinner",
  Dessert: "Dessert",
};
const SUNSET_WORDS = /sunset|ghroub|ghurub|ghroob|maghreb|golden hour|غروب/i;
const VISITOR_WORDS = /safar|abroad|visiting|visitors|tourist|first time|جايين من السفر/i;

async function composeDayOut(data: z.infer<typeof Input>, c: DayOutContext) {
  const { find, centers, areas, geo, st, en } = c;
  const savedIds = new Set(data.saved.map((p) => p.id));
  const likes = [...data.prefs, ...data.what];
  // Far named areas (Tripoli and Beirut, say) make a long-drive day, like an explicit road trip.
  const spread =
    centers.length > 1 &&
    centers.some((a) => centers.some((b) => kmBetween(a, b) > 40)) &&
    areas.length < AREAS.length;
  const roadTrip = c.roadTrip || spread;
  // Every stop within the max drive (30 min by default) of where the user wants to be: the picked
  // area, town, current location or hotel. Not on a road trip, where the drive is the point.
  const pool = roadTrip
    ? c.pool
    : c.pool.filter(
        (p) =>
          !centers.length ||
          Math.min(...centers.map(([lat, lng]) => driveMins({ lat, lng }, p))) <= data.maxDrive,
      );
  const scores = new Map(pool.map((p) => [p.id, scorePlace(p, { centers, likes, savedIds })]));
  const date = nextDate(data.day);
  const here = centers[0] ?? [33.89, 35.5];
  const want = [
    ...new Set([
      ...data.what
        .map(
          (w) =>
            WHAT_CATEGORY[w] ??
            ((CATEGORIES as string[]).includes(w) ? (w as Category) : undefined),
        )
        .filter((x): x is Category => !!x),
      ...categoriesIn(data.q.toLowerCase()),
    ]),
  ];
  const diet = dietOf(data.prefs);
  const area = geo
    ? geo.name
    : areas.length === AREAS.length
      ? "Lebanon"
      : areas.slice(0, 2).join(" and ");
  const r = await composeDay(
    pool,
    {
      rules: { day: data.day, budget: data.budget, avoid: data.avoid, diet },
      start: st,
      end: Math.min(en, 24 * 60),
      pace: data.pace,
      maxDrive: roadTrip ? ROAD_TRIP_MAX_DRIVE : data.maxDrive,
      roadTrip,
      sunset: localSunset(here[0], here[1], date, geo ? undefined : "Asia/Beirut"),
      wantsSunset: SUNSET_WORDS.test(data.q),
      want,
      savedIds,
      scores,
    },
    {
      q: data.q,
      region: geo ? `${geo.name}, ${geo.country}` : "Lebanon",
      area,
      day: data.day,
      people: data.people,
      pace: data.pace,
      budget: data.budget,
      prefs: data.prefs,
      avoid: data.avoid,
      likes,
      visitors: VISITOR_WORDS.test(data.q),
      dishes: new Map(data.saved.filter((p) => p.dish).map((p) => [p.id, p.dish!])),
      runId: c.runId,
    },
    data.stay !== "No",
  );
  if ("error" in r) {
    const open = pool.filter((p) => p.cat !== "Stay").length;
    return {
      error:
        open < 6
          ? `Only ${open} spots are open in ${area} on ${data.day}. Try a nearby area or another day?`
          : `We couldn't fit 3 good plans between ${data.time} and ${data.end ?? "the evening"} in ${area}. Try a longer time window or a nearby area?`,
    };
  }
  const notices = [...r.notices];
  const meals = (p: (typeof r.plans)[number]) =>
    p.stops.some((s) => /^(Breakfast|Brunch|Lunch|Dinner)$/.test(find(s.placeId)?.cat ?? ""));
  if (diet && !r.plans.some(meals))
    notices.push(
      `We couldn't find ${diet} spots for a meal here, so these plans skip meals. Want to try Beirut?`,
    );
  if (roadTrip) {
    const drive = Math.max(
      ...r.plans.map((p) =>
        p.stops
          .slice(1)
          .reduce((a, s, i) => a + driveMins(find(p.stops[i]!.placeId)!, find(s.placeId)!), 0),
      ),
    );
    if (drive >= 60)
      notices.push(
        `About ${Math.floor(drive / 60)}h${String(drive % 60).padStart(2, "0")} of driving on the longest plan.`,
      );
  }
  const plans: Plan[] = r.plans.map((p) => ({
    title: p.title,
    vibe: p.vibe,
    why: p.why || undefined,
    stops: p.stops,
    ...(data.base ? { base: data.base } : {}),
  }));
  const used = [...new Set(plans.flatMap((p) => p.stops.map((s) => s.placeId)))]
    .map((id) => find(id)!)
    .filter((p) => p.live);
  await findInstas(used);
  registerGooglePlaces(used.filter((p) => c.fromGoogle.has(p)));
  return { plans, places: pool.filter((p) => p.live), notices, ai: r.ai };
}

// /status is public and each check makes a paid Claude call and a Google search,
// so one check is shared by everyone for a few minutes.
const STATUS_TTL = 5 * 60e3;
let lastStatus: {
  at: number;
  v: Promise<
    Awaited<ReturnType<typeof placesStatus>> & {
      ai: Awaited<ReturnType<typeof aiStatus>>;
      store: Awaited<ReturnType<typeof storePing>>;
      checkedAt: number;
    }
  >;
} | null = null;
export const checkStatus = createServerFn({ method: "GET" }).handler(() => {
  if (!lastStatus || Date.now() - lastStatus.at > STATUS_TTL) {
    const at = Date.now();
    lastStatus = {
      at,
      v: (async () => ({
        ...(await placesStatus()),
        ai: await aiStatus(),
        store: await storePing(),
        checkedAt: at,
      }))(),
    };
  }
  return lastStatus.v;
});
