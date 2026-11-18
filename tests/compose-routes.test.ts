// The route builder (D2) must only produce routes that pass the exam's Yes/No checks.
// Hand-made places, no network:  node --experimental-strip-types tests/compose-routes.test.ts
import assert from "node:assert/strict";
import { buildRoutes, pickDiverse, type RouteContext } from "../src/lib/compose/routes.ts";
import { adjustedRating, scorePlace } from "../src/lib/compose/score.ts";
import { grade, withDefaults, type Card } from "../evals/compose/grade.ts";
import type { Place } from "../src/lib/places.ts";

let n = 0;
const place = (
  name: string,
  cat: Place["cat"],
  hours: string,
  dLat: number,
  dLng: number,
  extra: Partial<Place> = {},
): Place => ({
  id: `p${n++}`,
  name,
  area: "Batroun",
  cat,
  rating: 4.5,
  price: 2,
  reason: name,
  lat: 34.255 + dLat,
  lng: 35.658 + dLng,
  mins:
    { Lunch: 120, Dinner: 120, Brunch: 90, Breakfast: 60, "Sea view": 60, Walk: 60 }[
      cat as string
    ] ?? 45,
  hours,
  reviews: 400,
  live: true,
  ...extra,
});
const pool: Place[] = [
  place("Pizza", "Lunch", "12:00 PM – 11:00 PM", 0, 0),
  place("Fish", "Dinner", "7:00 PM – 12:00 AM", 0.002, 0.003, { price: 3 }),
  place("Grill", "Dinner", "6:00 PM – 11:00 PM", -0.003, 0.002),
  place("Souk", "Walk", "Open 24 hours", 0.001, 0.002),
  place("Pier", "Sea view", "Open 24 hours", 0.002, -0.003),
  place("Cafe", "Specialty coffee", "8:00 AM – 6:00 PM", 0.001, 0.001),
  place("Late cafe", "Specialty coffee", "9:00 AM – 11:00 PM", -0.001, 0.001),
  place("Ice", "Dessert", "11:00 AM – 11:00 PM", 0.001, -0.001),
  place("Closed", "Lunch", "Closed", 0, 0.001, { rating: 5 }),
  place("Far", "Scenic stop", "Open 24 hours", 0.6, 0.6, { rating: 5 }),
  place("Brunchy", "Brunch", "9:00 AM – 3:00 PM", 0.002, 0.001),
];
const card: Card = withDefaults(
  {
    day: "Saturday",
    people: "4",
    pace: "Chill",
    budget: 0,
    avoid: [],
    prefs: [],
    stay: "No",
    maxDrive: 30,
    sunset: "16:34",
    roadTrip: false,
    wantsSunset: false,
    mustInclude: [],
    savedIds: [],
    what: [],
    where: [],
  },
  { id: 1, kind: "easy", status: "ready", about: "t", q: "t", time: "14:00", end: "22:00" },
);
const ctxFor = (c: Card): RouteContext => {
  const savedIds = new Set(c.savedIds);
  return {
    rules: { day: c.day, budget: c.budget, avoid: c.avoid, diet: "" },
    start: 14 * 60,
    end: Number(c.end.slice(0, 2)) * 60 + Number(c.end.slice(3)),
    pace: c.pace,
    maxDrive: c.maxDrive,
    roadTrip: c.roadTrip,
    sunset: 16 * 60 + 34,
    wantsSunset: c.wantsSunset,
    want: [],
    savedIds,
    scores: new Map(pool.map((p) => [p.id, scorePlace(p, { centers: [], likes: [], savedIds })])),
  };
};
const byId = new Map(pool.map((p) => [p.id, p]));
const asPlans = (routes: ReturnType<typeof buildRoutes>) =>
  routes.map((r) => ({
    title: "t",
    vibe: "v",
    stops: r.stops.map((st) => ({ placeId: st.place.id, time: st.time, reason: "r" })),
  }));

// D1: 4.8 from 40 reviews ranks below 4.5 from 900
assert.ok(
  adjustedRating({ rating: 4.8, reviews: 40, live: true }) <
    adjustedRating({ rating: 4.5, reviews: 900, live: true }),
);

for (const c of [
  card,
  { ...card, wantsSunset: true },
  { ...card, budget: 2 },
  { ...card, avoid: ["Sea view"] },
  { ...card, pace: "Packed" as const },
  { ...card, savedIds: [pool[3]!.id] },
]) {
  const routes = pickDiverse(buildRoutes(pool, ctxFor(c)), 10, new Set(c.savedIds));
  assert.ok(routes.length >= 3, `at least 3 routes for ${JSON.stringify(c.budget)}`);
  for (const plan of asPlans(routes)) {
    const g = grade(c, [plan, plan, plan], (id) => byId.get(id));
    const failed = g.checks.filter((x) => !x.pass);
    assert.deepEqual(
      failed,
      [],
      `route ${plan.stops.map((s) => byId.get(s.placeId)!.name).join(" > ")}`,
    );
    assert.deepEqual(g.instantFails, []);
  }
}

// Never the closed place, never the far place on a local day
const all = buildRoutes(pool, ctxFor(card)).flatMap((r) => r.stops.map((s) => s.place.name));
assert.ok(!all.includes("Closed"));
assert.ok(!all.includes("Far"));

// The routes kept differ from each other
const diverse = pickDiverse(buildRoutes(pool, ctxFor(card)), 10);
const keys = diverse.map((r) => r.stops.map((s) => s.place.id).join());
assert.equal(new Set(keys).size, keys.length);

console.log(
  `compose routes: every route passes the exam's Yes/No checks (${diverse.length} diverse routes)`,
);
