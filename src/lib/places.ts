// Starter inventory (demo data) until live Google Places is connected.
export type Category =
  | "Breakfast"
  | "Stay"
  | "Hike"
  | "Scenic stop"
  | "Brunch"
  | "Lunch"
  | "Dinner"
  | "Specialty coffee"
  | "Dessert"
  | "Sea view"
  | "Walk";
export type Place = {
  id: string;
  name: string;
  area: string;
  cat: Category;
  rating: number;
  price: 1 | 2 | 3;
  reason: string;
  lat: number;
  lng: number;
  isNew?: boolean;
  mins: number;
  maps?: string | undefined;
  web?: string | undefined;
  insta?: string | undefined;
  reviews?: number | undefined;
  hours?: string | undefined;
  live?: boolean | undefined;
  /** Opening hours for each weekday, Monday first (live places only). */
  week?: string[] | undefined;
};

type Row = [string, string, Category, number, 1 | 2 | 3, string, number, number, boolean?];
const rows: Row[] = [
  ["Aaliya's Books", "Beirut", "Brunch", 4.6, 2, "Eggs between bookshelves", 33.8938, 35.5105],
  ["Tawlet", "Beirut", "Lunch", 4.5, 2, "Home cooks from every village", 33.8966, 35.5196],
  ["Em Sherif Café", "Beirut", "Lunch", 4.6, 3, "Mezze done properly", 33.8889, 35.5108],
  ["Liza", "Beirut", "Dinner", 4.5, 3, "Old mansion, big flavours", 33.8942, 35.5163],
  ["Baron", "Beirut", "Dinner", 4.6, 3, "Wood fire, smart plates", 33.898, 35.527],
  [
    "Kalei Coffee Co.",
    "Beirut",
    "Specialty coffee",
    4.6,
    2,
    "Garden cortado spot",
    33.8962,
    35.5231,
  ],
  ["Sip", "Beirut", "Specialty coffee", 4.5, 2, "Tiny bar, serious beans", 33.895, 35.5175],
  ["Café Younes", "Beirut", "Specialty coffee", 4.5, 1, "Roasting since 1935", 33.8967, 35.483],
  ["Hanna Mitri", "Beirut", "Dessert", 4.7, 1, "Legendary ashta ice cream", 33.8917, 35.516],
  ["Bachir", "Beirut", "Dessert", 4.4, 1, "Pistachio ice cream classic", 33.897, 35.489],
  ["Raouche Rocks", "Beirut", "Sea view", 4.7, 1, "Pigeon Rocks at golden hour", 33.8906, 35.4695],
  ["Corniche Beirut", "Beirut", "Walk", 4.6, 1, "Seaside stroll with ka3ak", 33.901, 35.48],
  ["Sursock Museum", "Beirut", "Walk", 4.7, 1, "Art in a white palace", 33.894, 35.516, true],
  ["Chez Maguy", "Batroun", "Lunch", 4.6, 2, "Fish on the rocks", 34.2571, 35.657],
  ["Jammal", "Batroun", "Dinner", 4.5, 3, "Seafood by the waves", 34.26, 35.656],
  ["Colonel Brewery", "Batroun", "Dinner", 4.5, 2, "Craft beer, big garden", 34.264, 35.665],
  ["Batroun Old Souk", "Batroun", "Walk", 4.6, 1, "Stone alleys and cats", 34.2555, 35.659],
  ["Phoenician Wall", "Batroun", "Sea view", 4.7, 1, "Sunset on ancient stones", 34.2568, 35.6563],
  ["Hilmi Lemonade", "Batroun", "Dessert", 4.6, 1, "The famous lemonade", 34.256, 35.66],
  [
    "Batroun Coffee Lab",
    "Batroun",
    "Specialty coffee",
    4.5,
    2,
    "Good pour-over near the souk",
    34.258,
    35.661,
    true,
  ],
  ["Pierre & Friends", "Batroun", "Sea view", 4.4, 2, "Feet in the water", 34.28, 35.663],
  ["Byblos Sur Mer brunch", "Jbeil", "Brunch", 4.4, 3, "Brunch over the harbour", 34.121, 35.644],
  ["Pepe's Fishing Club", "Jbeil", "Lunch", 4.4, 3, "Fish right on the port", 34.1215, 35.6445],
  ["Bab el Mina", "Jbeil", "Dinner", 4.4, 2, "Port lights, grilled fish", 34.1213, 35.645],
  ["Byblos Old Souk", "Jbeil", "Walk", 4.6, 1, "Fossils and old stone", 34.12, 35.647],
  ["Byblos Citadel", "Jbeil", "Walk", 4.6, 1, "7,000 years in one hour", 34.1195, 35.646],
  ["Byblos Port", "Jbeil", "Sea view", 4.7, 1, "Sunset by the old harbour", 34.1217, 35.644],
  [
    "Café Byblos Roastery",
    "Jbeil",
    "Specialty coffee",
    4.5,
    2,
    "Fresh roast by the souk",
    34.1205,
    35.648,
    true,
  ],
  ["Jbeil Sweets", "Jbeil", "Dessert", 4.5, 1, "Warm knefeh", 34.122, 35.65],
  // Mountains & road trips
  [
    "Douma Old Souk breakfast",
    "Douma",
    "Breakfast",
    4.6,
    1,
    "Man2oush in a red-roof village",
    34.209,
    35.841,
  ],
  ["Douma village walk", "Douma", "Walk", 4.6, 1, "Ottoman souk and stone houses", 34.21, 35.842],
  [
    "Bchaaleh old olive trees",
    "Douma",
    "Scenic stop",
    4.5,
    1,
    "6,000-year-old olive trees",
    34.215,
    35.82,
  ],
  [
    "Tannourine Cedars trail",
    "Tannourine",
    "Hike",
    4.8,
    1,
    "Cedar forest, cool air",
    34.208,
    35.93,
  ],
  [
    "Baatara Gorge",
    "Tannourine",
    "Scenic stop",
    4.8,
    1,
    "Waterfall through 3 bridges",
    34.173,
    35.87,
  ],
  ["Tannourine river lunch", "Tannourine", "Lunch", 4.4, 2, "Grills by cold water", 34.2, 35.91],
  ["Qadisha Valley trail", "Qadisha", "Hike", 4.8, 1, "Monasteries in the cliffs", 34.245, 35.95],
  ["Ehden Horsh trail", "Ehden", "Hike", 4.7, 1, "Nature reserve, easy loop", 34.305, 35.99],
  ["Ehden Midan", "Ehden", "Lunch", 4.5, 2, "Kibbeh zghartawiyeh on the square", 34.292, 35.975],
  [
    "Chouwen Lake hike",
    "Jabal Moussa",
    "Hike",
    4.7,
    1,
    "Turquoise lake after the trail",
    34.048,
    35.76,
  ],
  [
    "Jabal Moussa reserve",
    "Jabal Moussa",
    "Hike",
    4.7,
    1,
    "UNESCO trails, big views",
    34.06,
    35.78,
  ],
  [
    "Faqra Club breakfast",
    "Kfardebian",
    "Breakfast",
    4.3,
    2,
    "Saj and labneh with a view",
    33.995,
    35.82,
  ],
  [
    "Faraya Mzaar viewpoint",
    "Kfardebian",
    "Scenic stop",
    4.6,
    1,
    "Top of the mountain",
    33.995,
    35.86,
  ],
  ["Jeita Grotto", "Jounieh", "Scenic stop", 4.8, 2, "Boat inside a cave", 33.943, 35.642],
  ["Chez Sami", "Jounieh", "Lunch", 4.5, 3, "Fish with feet almost in the sea", 33.987, 35.63],
  ["Babel Bay", "Jounieh", "Dinner", 4.4, 3, "Big Lebanese table by the marina", 33.99, 35.625],
  ["Jounieh Old Souk", "Jounieh", "Walk", 4.4, 1, "Stone souk, cafés, sea breeze", 33.98, 35.617],
  [
    "Kaslik coffee corner",
    "Jounieh",
    "Specialty coffee",
    4.4,
    2,
    "Flat white before the sea walk",
    33.978,
    35.62,
    true,
  ],
  ["Rafic Rahme sweets", "Jounieh", "Dessert", 4.5, 1, "Fresh knefeh and maamoul", 33.981, 35.618],
  ["Al Mina fish, Tripoli", "Tripoli", "Lunch", 4.5, 2, "Fresh catch at the port", 34.45, 35.82],
  ["Tripoli Old Souks", "Tripoli", "Walk", 4.6, 1, "Mamluk souks and soap khan", 34.435, 35.842],
  ["Rafaat Hallab", "Tripoli", "Dessert", 4.7, 1, "The famous Tripoli sweets", 34.437, 35.835],
  [
    "Abou Joseph breakfast",
    "Tripoli",
    "Breakfast",
    4.5,
    1,
    "Foul, fatteh and hot ka3ak",
    34.436,
    35.84,
  ],
  [
    "Tripoli ka3ak stand",
    "Tripoli",
    "Breakfast",
    4.4,
    1,
    "Ka3ak with za3tar by the clock tower",
    34.4365,
    35.838,
  ],
  [
    "Citadel of Raymond de Saint-Gilles",
    "Tripoli",
    "Walk",
    4.6,
    1,
    "Crusader castle over the city",
    34.433,
    35.844,
  ],
  ["Khan al-Saboun", "Tripoli", "Walk", 4.5, 1, "Old soap khan, handmade soap", 34.4355, 35.8425],
  ["Al Mina corniche", "Tripoli", "Sea view", 4.5, 1, "Sunset walk by the port", 34.452, 35.815],
  [
    "Palm Islands boat",
    "Tripoli",
    "Sea view",
    4.6,
    2,
    "Boat to the nature reserve islands",
    34.454,
    35.812,
  ],
  [
    "Mina roastery café",
    "Tripoli",
    "Specialty coffee",
    4.4,
    2,
    "Cold brew in an old stone house",
    34.451,
    35.818,
    true,
  ],
  [
    "Tripoli old house dinner",
    "Tripoli",
    "Dinner",
    4.5,
    2,
    "Mezze in a restored courtyard",
    34.448,
    35.82,
  ],
  ["Harissa", "Jounieh", "Sea view", 4.7, 1, "Téléférique over the bay", 33.98, 35.65],
  [
    "Broummana breakfast",
    "Broummana",
    "Breakfast",
    4.4,
    1,
    "Knefeh ka3ak, pine air",
    33.883,
    35.62,
  ],
  // Places to sleep (camping, glamping, guesthouse, hotel)
  [
    "Camping Chouwen",
    "Jabal Moussa",
    "Stay",
    4.4,
    1,
    "Camping: tents by the river",
    34.047,
    35.759,
  ],
  [
    "Tannourine cedar camp",
    "Tannourine",
    "Stay",
    4.5,
    1,
    "Camping: stars under cedars",
    34.207,
    35.929,
  ],
  [
    "Bubble glamping Ehden",
    "Ehden",
    "Stay",
    4.6,
    3,
    "Glamping: bubble dome, mountain sky",
    34.3,
    35.985,
  ],
  [
    "Kfardebian glamping pods",
    "Kfardebian",
    "Stay",
    4.5,
    3,
    "Glamping: wooden pods, fireplace",
    33.997,
    35.83,
  ],
  [
    "Douma guesthouse",
    "Douma",
    "Stay",
    4.7,
    2,
    "Guesthouse: old stone house, homemade breakfast",
    34.2095,
    35.8415,
  ],
  [
    "Beit Douma",
    "Douma",
    "Stay",
    4.8,
    3,
    "Guesthouse: restored 19th-century home",
    34.2085,
    35.8405,
  ],
  [
    "Batroun seaside guesthouse",
    "Batroun",
    "Stay",
    4.5,
    2,
    "Guesthouse: walk to the souk",
    34.2565,
    35.6585,
  ],
  [
    "Byblos harbour hotel",
    "Jbeil",
    "Stay",
    4.4,
    3,
    "Hotel: rooms over the old port",
    34.1212,
    35.6442,
  ],
  [
    "Beirut boutique hotel",
    "Beirut",
    "Stay",
    4.5,
    3,
    "Hotel: Gemmayzeh, walk to dinner",
    33.896,
    35.518,
  ],
  ["Ehden family hotel", "Ehden", "Stay", 4.3, 2, "Hotel: quiet, near the Midan", 34.2925, 35.9755],
  [
    "Beirut Souk el Tayeb",
    "Beirut",
    "Breakfast",
    4.6,
    1,
    "Saturday farmers market",
    33.901,
    35.504,
  ],
];

export const DUR: Record<Category, number> = {
  Breakfast: 60,
  Stay: 600,
  Hike: 150,
  "Scenic stop": 45,
  Brunch: 90,
  Lunch: 120,
  Dinner: 120,
  "Specialty coffee": 45,
  Dessert: 30,
  "Sea view": 60,
  Walk: 60,
};

export const PLACES: Place[] = rows.map(
  ([name, area, cat, rating, price, reason, lat, lng, isNew]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    area,
    cat,
    rating,
    price,
    reason,
    lat,
    lng,
    isNew: !!isNew,
    mins: DUR[cat],
  }),
);
export const AREAS = [...new Set(rows.map((r) => r[1]))];
export const CATEGORIES = Object.keys(DUR) as Category[];
// Rough centres for areas users can pick even if we have few spots there
export const AREA_CENTER: Record<string, [number, number]> = {
  Broummana: [33.883, 35.62],
  Jounieh: [33.98, 35.62],
  Tripoli: [34.44, 35.84],
};
export function kmBetween(a: [number, number], b: [number, number]) {
  const R = 6371,
    t = Math.PI / 180;
  return (
    2 *
    R *
    Math.asin(
      Math.sqrt(
        Math.sin(((b[0] - a[0]) * t) / 2) ** 2 +
          Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(((b[1] - a[1]) * t) / 2) ** 2,
      ),
    )
  );
}
// Live places fetched from Google, registered at runtime.
// In the browser the registry belongs to one visitor. On the server it is shared by every visitor,
// so only places that came straight from Google go in there (registerGooglePlaces). Places sent by a
// browser (saved reels, share links) stay inside that one request and never reach other visitors.
const LIVE = new Map<string, Place>();
function addPlaces(list: Place[]) {
  if (LIVE.size > 3000) LIVE.clear();
  for (const p of list) LIVE.set(p.id, { ...LIVE.get(p.id), ...p });
}
export function registerPlaces(list: Place[]) {
  if (typeof window === "undefined") return;
  addPlaces(list);
}
export const registerGooglePlaces = addPlaces;
export const byId = (id: string) => LIVE.get(id) ?? PLACES.find((p) => p.id === id);
export const allPlaces = () => [...LIVE.values(), ...PLACES];

export function driveMins(a: Pick<Place, "lat" | "lng">, b: Pick<Place, "lat" | "lng">) {
  const R = 6371,
    t = Math.PI / 180;
  const d =
    2 *
    R *
    Math.asin(
      Math.sqrt(
        Math.sin(((b.lat - a.lat) * t) / 2) ** 2 +
          Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lng - a.lng) * t) / 2) ** 2,
      ),
    );
  return Math.max(3, Math.round((d * 1.3) / 0.7)); // ~42 km/h on roads
}

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24,
    mm = m % 60;
  const hh = h % 12 || 12;
  return `${hh}${mm ? ":" + String(mm).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
