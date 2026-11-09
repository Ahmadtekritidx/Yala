// User preferences, saved on this device (no account needed in v1).
export type Profile = {
  name: string;
  homeArea: string;
  people: string;
  budget: 0 | 1 | 2 | 3; // 0 = any
  pace: "Chill" | "Packed";
  maxDrive: number; // minutes between stops
  diet: string[];
  likes: string[];
  avoid: string[];
  stay: string;
};

export const DIETS = ["Vegetarian", "Vegan", "Halal", "Gluten free", "No alcohol"];
export const LIKES = [
  "Something new",
  "Hidden gems",
  "Sea view",
  "Mountains",
  "Live music",
  "Quiet spots",
  "Kids friendly",
  "Pet friendly",
  "Outdoor seating",
];
export const AVOIDS = [
  "Hike",
  "Sea view",
  "Walk",
  "Dessert",
  "Specialty coffee",
  "Breakfast",
  "Brunch",
];
export const STAYS = ["No", "Guesthouse", "Hotel", "Glamping", "Camping", "Surprise me"];
export const AREAS = ["Beirut", "Batroun", "Jbeil", "Tripoli", "Broummana", "Jounieh"];

export const EMPTY: Profile = {
  name: "",
  homeArea: "",
  people: "2",
  budget: 0,
  pace: "Chill",
  maxDrive: 30,
  diet: [],
  likes: [],
  avoid: [],
  stay: "No",
};

const KEY = "yalla:profile";

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the profile just isn't remembered */
  }
}

// What the plans page receives as search params
export function profileSearch(p: Profile | null) {
  if (!p) return {};
  return {
    people: p.people,
    pace: p.pace,
    stay: p.stay,
    avoid: p.avoid.join(","),
    prefs: [...p.diet, ...p.likes].join(","),
    budget: String(p.budget),
    drive: String(p.maxDrive),
  };
}

// Short summary for the home screen, e.g. "4 people · $$ max · Vegetarian · no Hike"
export function profileSummary(p: Profile) {
  return [
    `${p.people} ${p.people === "1" ? "person" : "people"}`,
    p.budget ? `${"$".repeat(p.budget)} max` : "",
    p.pace === "Packed" ? "packed day" : "",
    ...p.diet,
    ...p.likes.slice(0, 2),
    ...p.avoid.map((a) => `no ${a.toLowerCase()}`),
    p.stay !== "No" ? `stay: ${p.stay.toLowerCase()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
