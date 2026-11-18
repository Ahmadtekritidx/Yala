// Swap / Add candidates (src/lib/alternatives.ts). Run: node --experimental-strip-types tests/alternatives.test.ts
import { alternatives, arrivalAfter, dietOf, fits, type Rules } from "../src/lib/alternatives.ts";
import type { Place } from "../src/lib/places.ts";

const place = (id: string, over: Partial<Place> = {}): Place => ({
  id,
  name: id,
  area: "Batroun",
  cat: "Lunch",
  rating: 4.5,
  price: 2,
  reason: "",
  lat: 34.256,
  lng: 35.659,
  mins: 120,
  ...over,
});
const rules = (over: Partial<Rules> = {}): Rules => ({
  day: "Saturday",
  budget: 0,
  avoid: [],
  diet: "",
  ...over,
});
const NOON = 12 * 60;

let failed = 0;
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "FAIL"} ${name}`);
  if (!cond) failed++;
};

// Opening hours
ok("unknown hours count as open", fits(place("a"), NOON, rules()));
ok("open at that time", fits(place("a", { hours: "11:00 AM – 11:00 PM" }), NOON, rules()));
ok("closed at that time", !fits(place("a", { hours: "6:00 PM – 11:00 PM" }), NOON, rules()));
ok("closed all day", !fits(place("a", { hours: "Closed" }), NOON, rules()));
const week = ["9:00 AM – 5:00 PM", "", "", "", "", "Closed", "9:00 AM – 5:00 PM"];
ok("uses the plan's weekday", !fits(place("a", { week }), NOON, rules({ day: "Saturday" })));
ok("same place open on Sunday", fits(place("a", { week }), NOON, rules({ day: "Sunday" })));
ok(
  "a Stay ignores opening hours",
  fits(place("s", { cat: "Stay", hours: "Closed" }), NOON, rules()),
);

// Avoided categories
ok("avoided category", !fits(place("h", { cat: "Hike" }), NOON, rules({ avoid: ["hike"] })));
ok("other category is fine", fits(place("a"), NOON, rules({ avoid: ["Hike"] })));

// Budget
ok("over budget", !fits(place("a", { price: 3 }), NOON, rules({ budget: 2 })));
ok("within budget", fits(place("a", { price: 2 }), NOON, rules({ budget: 2 })));
ok("no budget set", fits(place("a", { price: 3 }), NOON, rules()));
ok(
  "a Stay ignores budget",
  fits(place("s", { cat: "Stay", price: 3 }), NOON, rules({ budget: 1 })),
);

// Diet
ok("dietOf picks the diet", dietOf(["Seafood", "Vegan"]) === "vegan");
ok("dietOf with none", dietOf(["Seafood"]) === "");
ok("meal not known to fit the diet", !fits(place("a"), NOON, rules({ diet: "vegan" })));
ok(
  "meal found by a vegan search",
  fits(place("a", { diet: "vegan" }), NOON, rules({ diet: "vegan" })),
);
ok("wrong diet tag", !fits(place("a", { diet: "halal" }), NOON, rules({ diet: "vegan" })));
ok(
  "diet doesn't apply to coffee",
  fits(place("c", { cat: "Specialty coffee", mins: 45 }), NOON, rules({ diet: "vegan" })),
);

// Arrival time: previous start + its visit + drive, rounded up to 15 minutes
const here = place("here");
ok("arrival after a stop", arrivalAfter(NOON, here, place("next")) === NOON + 120 + 15);

// Ranking and filtering
const near = place("near", { lat: 34.26 }); // ~0.5 km away
const nearBetter = place("nearBetter", { lat: 34.26, rating: 4.8 });
const far = place("far", { lat: 34.9 }); // ~70 km away
const closed = place("closed", { lat: 34.257, hours: "Closed" });
const used = place("used", { lat: 34.257 });
const coffee = place("coffee", { cat: "Specialty coffee", lat: 34.257 });
const got = alternatives([far, near, closed, used, coffee, nearBetter], {
  cat: "Lunch",
  near: here,
  exclude: new Set(["used"]),
  maxDrive: 40,
  arriveAt: () => NOON,
  rules: rules(),
}).map((p) => p.id);
ok(
  "keeps open, unused, same-category places nearby, closest then best rated",
  JSON.stringify(got) === JSON.stringify(["nearBetter", "near"]),
);

console.log(failed ? `${failed} failed` : "all alternatives tests pass");
if (failed) process.exit(1);
