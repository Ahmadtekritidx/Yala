// The exam marker (evals/score.ts) and today's keyword parser (src/lib/intent.ts).
// Run: node --experimental-strip-types tests/eval-score.test.ts
import { scoreItem, summarize, validShape, type GoldenItem } from "../evals/score.ts";
import { areasIn, categoriesIn, keywordIntent } from "../src/lib/intent.ts";

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  if (!ok) failures++;
};

const item: GoldenItem = {
  id: 1,
  tags: ["en"],
  input: "Italian lunch in Batroun then coffee",
  ideal: {
    areas: ["Batroun"],
    slots: [{ cat: "Lunch", cuisine: "italian" }, { cat: "Specialty coffee" }],
    avoid: [],
  },
};

const perfect = scoreItem(item, item.ideal);
check("a perfect answer passes every check", perfect.pass && perfect.hardFails.length === 0);
check(
  "checks with nothing to test are n/a",
  perfect.checks.times === "n/a" && perfect.checks.clarify === "n/a",
);

const swapped = scoreItem(item, { ...item.ideal, slots: [...item.ideal.slots].reverse() });
check("slots in the wrong order fail", !swapped.pass && swapped.checks.slots === "fail");

const invented = scoreItem(item, { ...item.ideal, areas: ["Batroun", "Jbeil"] });
check("an extra area is a hard fail", invented.hardFails.includes("invented_area"));

const extra = scoreItem(item, { ...item.ideal, slots: [...item.ideal.slots, { cat: "Hike" }] });
check("an extra activity is a hard fail", extra.hardFails.includes("invented_activity"));

const shape = scoreItem(item, { areas: "Batroun" });
check("a wrong shape is a hard fail", shape.hardFails.includes("bad_shape") && !validShape({}));

const avoidItem: GoldenItem = {
  id: 2,
  tags: ["en"],
  input: "no hiking, lunch",
  ideal: { areas: [], slots: [{ cat: "Lunch" }], avoid: ["Hike"] },
};
check(
  "dropping a 'no' is a hard fail",
  scoreItem(avoidItem, { areas: [], slots: [{ cat: "Lunch" }], avoid: [] }).hardFails.includes(
    "dropped_avoid",
  ),
);
check(
  "an invented time fails the times check",
  scoreItem(item, { ...item.ideal, start: "12:00" }).checks.times === "fail",
);
check(
  "cuisine matches loosely (vegan vs vegan friendly)",
  scoreItem(
    {
      ...item,
      ideal: { areas: [], slots: [{ cat: "Lunch", cuisine: "vegan friendly" }], avoid: [] },
    },
    { areas: [], slots: [{ cat: "Lunch", cuisine: "vegan" }], avoid: [] },
  ).checks.cuisine === "pass",
);

const sum = summarize("t", [perfect, swapped]);
check("summary counts the pass rate", sum.passed === 1 && sum.passRate === 50);

// Today's keyword parser, so refactors of the planner keep its behaviour.
check("areas: Byblos is Jbeil", areasIn("Byblos lunch").includes("Jbeil"));
check("areas: Jouniye is Jounieh", areasIn("brunch in jouniye").includes("Jounieh"));
check(
  "categories by first word, in list order",
  categoriesIn("sunset by the sea then dinner").join() === "Dinner,Sea view",
);
const k = keywordIntent("Italian lunch in Batroun then a walk");
check(
  "keyword intent orders slots as written and puts the cuisine on the meal",
  k.slots.map((s) => s.cat).join() === "Lunch,Walk" && k.slots[0]!.cuisine === "italian",
);

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("all eval-score tests pass");
