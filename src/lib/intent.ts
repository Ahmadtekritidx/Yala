// Understanding the user's sentence: what today's code pulls out of the free text.
// This is plain keyword matching (English only). It is the BASELINE the AI parser must beat:
// evals/run.ts scores it against evals/parser.golden.json on every change.
// Pure and imported with .ts extensions so it runs in plain Node for the eval and tests.
import { AREAS, AREA_CENTER, type Category } from "./places.ts";

// Food words passed straight to Google, so "Italian lunch" searches Italian places.
export const CUISINES = [
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

// Categories a request can name in words. A category matches when the text contains its first word
// ("sea" for "Sea view", "specialty" for "Specialty coffee").
export const TEXT_CATEGORIES: Category[] = [
  "Breakfast",
  "Brunch",
  "Lunch",
  "Dinner",
  "Specialty coffee",
  "Dessert",
  "Sea view",
  "Walk",
  "Hike",
  "Scenic stop",
];
const firstWord = (c: Category) => c.toLowerCase().split(" ")[0]!;
export const categoriesIn = (text: string): Category[] => {
  const t = text.toLowerCase();
  return TEXT_CATEGORIES.filter((c) => t.includes(firstWord(c)));
};
export const wantsHike = (text: string) => /hike|hiking|nature|mountain/.test(text.toLowerCase());

// Lebanese areas the planner knows by name.
export const KNOWN_AREAS = [...new Set([...AREAS, ...Object.keys(AREA_CENTER)])];

// Areas named in the text, from a list of known names. Two common alternate spellings are folded in.
export const areasIn = (text: string, known: string[] = KNOWN_AREAS) => {
  const t = text.toLowerCase().replace("jouniye", "jounieh").replace("byblos", "jbeil");
  return known.filter((a) => t.includes(a.toLowerCase()));
};

// The structured request, in the shape of the golden set (evals/parser.golden.json "schema").
export type Slot = { cat: Category; cuisine?: string; time?: string };
export type Intent = {
  areas: string[];
  slots: Slot[];
  day?: "Saturday" | "Sunday";
  start?: string;
  end?: string;
  people?: number;
  budget?: 1 | 2 | 3;
  avoid: string[];
  clarify?: string;
};

const MEALS = new Set<Category>(["Breakfast", "Brunch", "Lunch", "Dinner"]);

// Everything today's keyword code understands from the sentence alone, as one Intent.
// Slots come in the order their words appear; the cuisine goes on the first meal.
export function keywordIntent(q: string): Intent {
  const t = q.toLowerCase();
  const cats = new Set<Category>(categoriesIn(q));
  if (wantsHike(q)) cats.add("Hike");
  const at = (c: Category) => {
    const i = c === "Hike" && !t.includes("hike") ? t.search(/hiking|nature|mountain/) : -1;
    return i >= 0 ? i : t.indexOf(firstWord(c));
  };
  const ordered = [...cats].sort((a, b) => at(a) - at(b));
  const cuisine = cuisineOf(q);
  let given = false;
  const slots = ordered.map((cat): Slot => {
    if (cuisine && !given && MEALS.has(cat)) {
      given = true;
      return { cat, cuisine };
    }
    return { cat };
  });
  return { areas: areasIn(q), slots, avoid: [] };
}
