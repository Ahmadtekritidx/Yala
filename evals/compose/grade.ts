// The exam grader for Compose plans (docs/ai/compose-plans.md, Step 4 task 1).
// Grades one test's plans with the Yes/No checks (part A) and the instant fails (part C)
// that a program can check. Quality (part B) and the instant fails that need judgment
// are listed under `needsJudge` for a person or an AI judge.
// Pure: no network, no keys. Imported with .ts extensions so it runs in plain Node.
import { DUR, driveMins, kmBetween, type Category, type Place } from "../../src/lib/places.ts";
import { hoursOn, openAt, parseHours } from "../../src/lib/hours.ts";
import {
  MIN_PLANS_SHORT_WINDOW,
  PACE_STOPS,
  PLANS_PER_REQUEST,
  ROAD_TRIP_MAX_DRIVE_SHARE,
  SHORT_WINDOW_MINUTES,
  SUNSET_ARRIVE_BY,
  SUNSET_ARRIVE_FROM,
  isMeal,
  mealTimeOk,
} from "../../src/lib/rules.ts";

export type Card = {
  id: number;
  kind: "easy" | "tricky" | "nasty";
  status: "ready" | "later";
  about: string;
  q: string;
  what: string[];
  where: string[];
  day: string;
  time: string;
  end: string;
  people: string;
  pace: "Chill" | "Packed";
  budget: number;
  avoid: string[];
  prefs: string[];
  stay: string;
  maxDrive: number;
  sunset: string;
  roadTrip: boolean;
  wantsSunset: boolean;
  mustInclude: string[];
  savedIds: string[];
  later?: string;
  note?: string;
};

export type Stop = { placeId: string; time: number; reason: string };
export type Plan = { title: string; vibe: string; stops: Stop[] };

export type Check = { code: string; name: string; pass: boolean; detail?: string };
export type InstantFail = { code: string; name: string; detail: string };
export type Grade = {
  id: number;
  checks: Check[];
  instantFails: InstantFail[];
  needsJudge: string[];
};

const min = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Merge one test with the file's defaults.
export const withDefaults = (defaults: Partial<Card>, t: Partial<Card>) =>
  ({ ...defaults, ...t }) as Card;

// One plan's checks. `find` resolves a place id to the place the planner had.
function planChecks(card: Card, plan: Plan, find: (id: string) => Place | undefined, n: number) {
  const out: Check[] = [];
  const fails: InstantFail[] = [];
  const tag = `plan ${n + 1}`;
  const stops = plan.stops.map((s) => ({ ...s, place: find(s.placeId) }));
  const known = stops.filter((s) => s.place) as (Stop & { place: Place })[];
  const visits = known.filter((s) => s.place.cat !== "Stay");

  for (const s of stops)
    if (!s.place)
      fails.push({ code: "C2", name: "Place that doesn't exist", detail: `${tag}: ${s.placeId}` });

  // A1 open on arrival (unknown hours count as open, like the app)
  const closed = visits.filter(
    (s) => !openAt(hoursOn(s.place, card.day), s.time, s.place.mins ?? DUR[s.place.cat]),
  );
  out.push({
    code: "A1",
    name: "Open on arrival",
    pass: !closed.length,
    detail: closed
      .map((s) => `${s.place.name} at ${hhmm(s.time)} (${hoursOn(s.place, card.day)})`)
      .join("; "),
  });
  for (const s of closed)
    if (parseHours(hoursOn(s.place, card.day)) !== null)
      fails.push({
        code: "C1",
        name: "Closed place",
        detail: `${tag}: ${s.place.name} at ${hhmm(s.time)}`,
      });

  // A2 time window
  const start = min(card.time),
    end = min(card.end);
  const outside = visits.filter((s) => s.time < start || s.time > end);
  out.push({
    code: "A2",
    name: "Fits the time window",
    pass: !outside.length,
    detail: outside.map((s) => `${s.place.name} at ${hhmm(s.time)}`).join("; "),
  });

  // A3 drives
  const legs = visits.slice(1).map((s, i) => ({
    from: visits[i]!.place,
    to: s.place,
    mins: driveMins(visits[i]!.place, s.place),
  }));
  const long = legs.filter((l) => l.mins > card.maxDrive);
  out.push({
    code: "A3",
    name: `Drives within ${card.maxDrive} min`,
    pass: !long.length,
    detail: long.map((l) => `${l.from.name} to ${l.to.name}: ${l.mins} min`).join("; "),
  });

  // A4 meal times (the time slot decides which meal), no two meals back to back
  const badMeal = visits.filter((s) => isMeal(s.place.cat) && !mealTimeOk(s.time));
  const twoMeals = visits
    .slice(1)
    .filter((s, i) => isMeal(s.place.cat) && isMeal(visits[i]!.place.cat));
  out.push({
    code: "A4",
    name: "Meals at normal times, never back to back",
    pass: !badMeal.length && !twoMeals.length,
    detail: [
      ...badMeal.map((s) => `meal at ${hhmm(s.time)} (${s.place.name})`),
      ...twoMeals.map((s) => `two meals in a row before ${s.place.name}`),
    ].join("; "),
  });

  // A5 no repeats
  const ids = plan.stops.map((s) => s.placeId);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  out.push({ code: "A5", name: "No place twice", pass: !dup.length, detail: dup.join(", ") });

  // A6 stops per pace
  const [lo, hi] = PACE_STOPS[card.pace];
  out.push({
    code: "A6",
    name: `${lo} to ${hi} stops (${card.pace})`,
    pass: visits.length >= lo && visits.length <= hi,
    detail: `${visits.length} stops`,
  });

  // A7 when a sunset was asked for: a sea view stop just before sunset.
  // A plan with no sea view at all is caught once, by A11 (everything asked for appears).
  const sea = visits.filter((s) => s.place.cat === "Sea view");
  if (card.wantsSunset && sea.length) {
    const sunset = min(card.sunset);
    const onTime = sea.some(
      (s) => s.time >= sunset - SUNSET_ARRIVE_FROM && s.time <= sunset - SUNSET_ARRIVE_BY,
    );
    out.push({
      code: "A7",
      name: "Sea view just before sunset",
      pass: onTime,
      detail: onTime
        ? ""
        : sea.map((s) => `${s.place.name} at ${hhmm(s.time)}, sunset ${card.sunset}`).join("; "),
    });
  }

  // A8 saved places included
  if (card.savedIds.length)
    out.push({
      code: "A8",
      name: "Includes a saved place",
      pass: ids.some((id) => card.savedIds.includes(id)),
    });

  // A9 avoid list and budget (food needs go to the judge)
  const avoid = new Set(card.avoid.map((a) => a.toLowerCase()));
  const avoided = visits.filter((s) => avoid.has(s.place.cat.toLowerCase()));
  const pricey = card.budget ? visits.filter((s) => s.place.price > card.budget) : [];
  out.push({
    code: "A9",
    name: "Avoid list and budget respected",
    pass: !avoided.length && !pricey.length,
    detail: [
      ...avoided.map((s) => `${s.place.name} is ${s.place.cat}`),
      ...pricey.map((s) => `${s.place.name} is ${"$".repeat(s.place.price)}`),
    ].join("; "),
  });
  // C5: a trick in the text made the plan break a stated limit
  if (/ignore (your|the|all) (rules|instructions)/i.test(card.q) && pricey.length)
    fails.push({
      code: "C5",
      name: "Obeyed a trick",
      detail: `${tag}: over budget after "ignore your rules"`,
    });

  // A11 everything asked for appears
  const missing = card.mustInclude.filter(
    (g) => !visits.some((s) => g.split("|").includes(s.place.cat as Category)),
  );
  if (card.mustInclude.length)
    out.push({
      code: "A11",
      name: "Everything asked for appears",
      pass: !missing.length,
      detail: missing.length ? `missing ${missing.join(", ")}` : "",
    });

  // A12 long-drive days: one direction, driving under half the window
  if (card.roadTrip && visits.length > 1) {
    const total = legs.reduce((a, l) => a + l.mins, 0);
    const first = visits[0]!.place;
    const dist = visits.map((s) => kmBetween([first.lat, first.lng], [s.place.lat, s.place.lng]));
    const back = dist.some((d, i) => i > 0 && d < dist[i - 1]! - 5);
    out.push({
      code: "A12",
      name: "Long drive: one direction, under half the day",
      pass: !back && total <= (end - start) * ROAD_TRIP_MAX_DRIVE_SHARE,
      detail: `${total} min driving${back ? ", goes back" : ""}`,
    });
  }

  return { checks: out.map((c) => ({ ...c, name: `${tag}: ${c.name}` })), fails };
}

export function grade(card: Card, plans: Plan[], find: (id: string) => Place | undefined): Grade {
  const short = min(card.end) - min(card.time) <= SHORT_WINDOW_MINUTES;
  const fewest = short ? MIN_PLANS_SHORT_WINDOW : PLANS_PER_REQUEST;
  const checks: Check[] = [
    {
      code: "A10",
      name: short
        ? `${fewest} to ${PLANS_PER_REQUEST} plans (short window)`
        : `Exactly ${PLANS_PER_REQUEST} plans`,
      pass: plans.length >= fewest && plans.length <= PLANS_PER_REQUEST,
      detail: `${plans.length} plans`,
    },
  ];
  const instantFails: InstantFail[] = [];
  plans.forEach((p, n) => {
    const r = planChecks(card, p, find, n);
    checks.push(...r.checks);
    instantFails.push(...r.fails);
  });
  const needsJudge = [
    "B1 fits the request",
    "B2 fits the group",
    "B3 3 plans really different",
    "B4 text short, warm, local",
    "B6 uses the best places",
    "C4 text invents a fact",
  ];
  if (card.savedIds.length) needsJudge.push("B5 mentions the saved dish");
  if (/abroad|safar|visit/i.test(card.q)) needsJudge.push("B7 fits who's coming");
  if (card.prefs.some((p) => /vegan|vegetarian|halal|alcohol|gluten/i.test(p)))
    needsJudge.push("C3 food needs respected");
  return { id: card.id, checks, instantFails, needsJudge };
}

export type Summary = {
  tests: number;
  checks: number;
  checksPassed: number;
  testsAllPassed: number;
  instantFails: number;
  byCheck: Record<string, { passed: number; total: number }>;
};

export function summarize(grades: Grade[]): Summary {
  const byCheck: Summary["byCheck"] = {};
  for (const g of grades)
    for (const c of g.checks) {
      const b = (byCheck[c.code] ??= { passed: 0, total: 0 });
      b.total++;
      if (c.pass) b.passed++;
    }
  const all = grades.flatMap((g) => g.checks);
  return {
    tests: grades.length,
    checks: all.length,
    checksPassed: all.filter((c) => c.pass).length,
    testsAllPassed: grades.filter((g) => g.checks.every((c) => c.pass) && !g.instantFails.length)
      .length,
    instantFails: grades.reduce((a, g) => a + g.instantFails.length, 0),
    byCheck,
  };
}
