// Starter inventory (demo data) until live Google Places is connected.
export type Category = "Breakfast" | "Stay" | "Hike" | "Scenic stop" | "Brunch" | "Lunch" | "Dinner" | "Specialty coffee" | "Dessert" | "Sea view" | "Walk";
export type Place = {
  id: string; name: string; area: string; cat: Category;
  rating: number; price: 1 | 2 | 3; reason: string; lat: number; lng: number;
  isNew?: boolean; mins: number;
  maps?: string | undefined; web?: string | undefined; insta?: string | undefined; reviews?: number | undefined; hours?: string | undefined; live?: boolean | undefined;
};

type Row = [string, string, Category, number, 1 | 2 | 3, string, number, number, boolean?];
const rows: Row[] = [
  ["Aaliya's Books", "Beirut", "Brunch", 4.6, 2, "Eggs between bookshelves", 33.8938, 35.5105],
  ["Tawlet", "Beirut", "Lunch", 4.5, 2, "Home cooks from every village", 33.8966, 35.5196],
  ["Em Sherif Café", "Beirut", "Lunch", 4.6, 3, "Mezze done properly", 33.8889, 35.5108],
  ["Liza", "Beirut", "Dinner", 4.5, 3, "Old mansion, big flavours", 33.8942, 35.5163],
  ["Baron", "Beirut", "Dinner", 4.6, 3, "Wood fire, smart plates", 33.8980, 35.5270],
  ["Kalei Coffee Co.", "Beirut", "Specialty coffee", 4.6, 2, "Garden cortado spot", 33.8962, 35.5231],
  ["Sip", "Beirut", "Specialty coffee", 4.5, 2, "Tiny bar, serious beans", 33.8950, 35.5175],
  ["Café Younes", "Beirut", "Specialty coffee", 4.5, 1, "Roasting since 1935", 33.8967, 35.4830],
  ["Hanna Mitri", "Beirut", "Dessert", 4.7, 1, "Legendary ashta ice cream", 33.8917, 35.5160],
  ["Bachir", "Beirut", "Dessert", 4.4, 1, "Pistachio ice cream classic", 33.8970, 35.4890],
  ["Raouche Rocks", "Beirut", "Sea view", 4.7, 1, "Pigeon Rocks at golden hour", 33.8906, 35.4695],
  ["Corniche Beirut", "Beirut", "Walk", 4.6, 1, "Seaside stroll with ka3ak", 33.9010, 35.4800],
  ["Sursock Museum", "Beirut", "Walk", 4.7, 1, "Art in a white palace", 33.8940, 35.5160, true],
  ["Chez Maguy", "Batroun", "Lunch", 4.6, 2, "Fish on the rocks", 34.2571, 35.6570],
  ["Jammal", "Batroun", "Dinner", 4.5, 3, "Seafood by the waves", 34.2600, 35.6560],
  ["Colonel Brewery", "Batroun", "Dinner", 4.5, 2, "Craft beer, big garden", 34.2640, 35.6650],
  ["Batroun Old Souk", "Batroun", "Walk", 4.6, 1, "Stone alleys and cats", 34.2555, 35.6590],
  ["Phoenician Wall", "Batroun", "Sea view", 4.7, 1, "Sunset on ancient stones", 34.2568, 35.6563],
  ["Hilmi Lemonade", "Batroun", "Dessert", 4.6, 1, "The famous lemonade", 34.2560, 35.6600],
  ["Batroun Coffee Lab", "Batroun", "Specialty coffee", 4.5, 2, "Good pour-over near the souk", 34.2580, 35.6610, true],
  ["Pierre & Friends", "Batroun", "Sea view", 4.4, 2, "Feet in the water", 34.2800, 35.6630],
  ["Byblos Sur Mer brunch", "Jbeil", "Brunch", 4.4, 3, "Brunch over the harbour", 34.1210, 35.6440],
  ["Pepe's Fishing Club", "Jbeil", "Lunch", 4.4, 3, "Fish right on the port", 34.1215, 35.6445],
  ["Bab el Mina", "Jbeil", "Dinner", 4.4, 2, "Port lights, grilled fish", 34.1213, 35.6450],
  ["Byblos Old Souk", "Jbeil", "Walk", 4.6, 1, "Fossils and old stone", 34.1200, 35.6470],
  ["Byblos Citadel", "Jbeil", "Walk", 4.6, 1, "7,000 years in one hour", 34.1195, 35.6460],
  ["Byblos Port", "Jbeil", "Sea view", 4.7, 1, "Sunset by the old harbour", 34.1217, 35.6440],
  ["Café Byblos Roastery", "Jbeil", "Specialty coffee", 4.5, 2, "Fresh roast by the souk", 34.1205, 35.6480, true],
  ["Jbeil Sweets", "Jbeil", "Dessert", 4.5, 1, "Warm knefeh", 34.1220, 35.6500],
  // Mountains & road trips
  ["Douma Old Souk breakfast", "Douma", "Breakfast", 4.6, 1, "Man2oush in a red-roof village", 34.2090, 35.8410],
  ["Douma village walk", "Douma", "Walk", 4.6, 1, "Ottoman souk and stone houses", 34.2100, 35.8420],
  ["Bchaaleh old olive trees", "Douma", "Scenic stop", 4.5, 1, "6,000-year-old olive trees", 34.2150, 35.8200],
  ["Tannourine Cedars trail", "Tannourine", "Hike", 4.8, 1, "Cedar forest, cool air", 34.2080, 35.9300],
  ["Baatara Gorge", "Tannourine", "Scenic stop", 4.8, 1, "Waterfall through 3 bridges", 34.1730, 35.8700],
  ["Tannourine river lunch", "Tannourine", "Lunch", 4.4, 2, "Grills by cold water", 34.2000, 35.9100],
  ["Qadisha Valley trail", "Qadisha", "Hike", 4.8, 1, "Monasteries in the cliffs", 34.2450, 35.9500],
  ["Ehden Horsh trail", "Ehden", "Hike", 4.7, 1, "Nature reserve, easy loop", 34.3050, 35.9900],
  ["Ehden Midan", "Ehden", "Lunch", 4.5, 2, "Kibbeh zghartawiyeh on the square", 34.2920, 35.9750],
  ["Chouwen Lake hike", "Jabal Moussa", "Hike", 4.7, 1, "Turquoise lake after the trail", 34.0480, 35.7600],
  ["Jabal Moussa reserve", "Jabal Moussa", "Hike", 4.7, 1, "UNESCO trails, big views", 34.0600, 35.7800],
  ["Faqra Club breakfast", "Kfardebian", "Breakfast", 4.3, 2, "Saj and labneh with a view", 33.9950, 35.8200],
  ["Faraya Mzaar viewpoint", "Kfardebian", "Scenic stop", 4.6, 1, "Top of the mountain", 33.9950, 35.8600],
  ["Jeita Grotto", "Jounieh", "Scenic stop", 4.8, 2, "Boat inside a cave", 33.9430, 35.6420],
  ["Chez Sami", "Jounieh", "Lunch", 4.5, 3, "Fish with feet almost in the sea", 33.9870, 35.6300],
  ["Babel Bay", "Jounieh", "Dinner", 4.4, 3, "Big Lebanese table by the marina", 33.9900, 35.6250],
  ["Jounieh Old Souk", "Jounieh", "Walk", 4.4, 1, "Stone souk, cafés, sea breeze", 33.9800, 35.6170],
  ["Kaslik coffee corner", "Jounieh", "Specialty coffee", 4.4, 2, "Flat white before the sea walk", 33.9780, 35.6200, true],
  ["Rafic Rahme sweets", "Jounieh", "Dessert", 4.5, 1, "Fresh knefeh and maamoul", 33.9810, 35.6180],
  ["Al Mina fish, Tripoli", "Tripoli", "Lunch", 4.5, 2, "Fresh catch at the port", 34.4500, 35.8200],
  ["Tripoli Old Souks", "Tripoli", "Walk", 4.6, 1, "Mamluk souks and soap khan", 34.4350, 35.8420],
  ["Rafaat Hallab", "Tripoli", "Dessert", 4.7, 1, "The famous Tripoli sweets", 34.4370, 35.8350],
  ["Abou Joseph breakfast", "Tripoli", "Breakfast", 4.5, 1, "Foul, fatteh and hot ka3ak", 34.4360, 35.8400],
  ["Tripoli ka3ak stand", "Tripoli", "Breakfast", 4.4, 1, "Ka3ak with za3tar by the clock tower", 34.4365, 35.8380],
  ["Citadel of Raymond de Saint-Gilles", "Tripoli", "Walk", 4.6, 1, "Crusader castle over the city", 34.4330, 35.8440],
  ["Khan al-Saboun", "Tripoli", "Walk", 4.5, 1, "Old soap khan, handmade soap", 34.4355, 35.8425],
  ["Al Mina corniche", "Tripoli", "Sea view", 4.5, 1, "Sunset walk by the port", 34.4520, 35.8150],
  ["Palm Islands boat", "Tripoli", "Sea view", 4.6, 2, "Boat to the nature reserve islands", 34.4540, 35.8120],
  ["Mina roastery café", "Tripoli", "Specialty coffee", 4.4, 2, "Cold brew in an old stone house", 34.4510, 35.8180, true],
  ["Tripoli old house dinner", "Tripoli", "Dinner", 4.5, 2, "Mezze in a restored courtyard", 34.4480, 35.8200],
  ["Harissa", "Jounieh", "Sea view", 4.7, 1, "Téléférique over the bay", 33.9800, 35.6500],
  ["Broummana breakfast", "Broummana", "Breakfast", 4.4, 1, "Knefeh ka3ak, pine air", 33.8830, 35.6200],
  // Places to sleep (camping, glamping, guesthouse, hotel)
  ["Camping Chouwen", "Jabal Moussa", "Stay", 4.4, 1, "Camping: tents by the river", 34.0470, 35.7590],
  ["Tannourine cedar camp", "Tannourine", "Stay", 4.5, 1, "Camping: stars under cedars", 34.2070, 35.9290],
  ["Bubble glamping Ehden", "Ehden", "Stay", 4.6, 3, "Glamping: bubble dome, mountain sky", 34.3000, 35.9850],
  ["Kfardebian glamping pods", "Kfardebian", "Stay", 4.5, 3, "Glamping: wooden pods, fireplace", 33.9970, 35.8300],
  ["Douma guesthouse", "Douma", "Stay", 4.7, 2, "Guesthouse: old stone house, homemade breakfast", 34.2095, 35.8415],
  ["Beit Douma", "Douma", "Stay", 4.8, 3, "Guesthouse: restored 19th-century home", 34.2085, 35.8405],
  ["Batroun seaside guesthouse", "Batroun", "Stay", 4.5, 2, "Guesthouse: walk to the souk", 34.2565, 35.6585],
  ["Byblos harbour hotel", "Jbeil", "Stay", 4.4, 3, "Hotel: rooms over the old port", 34.1212, 35.6442],
  ["Beirut boutique hotel", "Beirut", "Stay", 4.5, 3, "Hotel: Gemmayzeh, walk to dinner", 33.8960, 35.5180],
  ["Ehden family hotel", "Ehden", "Stay", 4.3, 2, "Hotel: quiet, near the Midan", 34.2925, 35.9755],
  ["Beirut Souk el Tayeb", "Beirut", "Breakfast", 4.6, 1, "Saturday farmers market", 33.9010, 35.5040],
];

export const DUR: Record<Category, number> = {
  Breakfast: 60, Stay: 600, Hike: 150, "Scenic stop": 45,
  Brunch: 90, Lunch: 120, Dinner: 120, "Specialty coffee": 45, Dessert: 30, "Sea view": 60, Walk: 60,
};

export const PLACES: Place[] = rows.map(([name, area, cat, rating, price, reason, lat, lng, isNew]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name, area, cat, rating, price, reason, lat, lng, isNew: !!isNew, mins: DUR[cat],
}));
export const AREAS = [...new Set(rows.map((r) => r[1]))];
export const CATEGORIES = Object.keys(DUR) as Category[];
// Rough centres for areas users can pick even if we have few spots there
export const AREA_CENTER: Record<string, [number, number]> = {
  Broummana: [33.883, 35.62], Jounieh: [33.98, 35.62], Tripoli: [34.44, 35.84],
};
export function kmBetween(a: [number, number], b: [number, number]) {
  const R = 6371, t = Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * t) / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(((b[1] - a[1]) * t) / 2) ** 2));
}
// Live places fetched from Google (registered at runtime on server and client)
const LIVE = new Map<string, Place>();
export function registerPlaces(list: Place[]) {
  if (LIVE.size > 3000) LIVE.clear();
  for (const p of list) LIVE.set(p.id, { ...LIVE.get(p.id), ...p });
}
export const byId = (id: string) => LIVE.get(id) ?? PLACES.find((p) => p.id === id);
export const allPlaces = () => [...LIVE.values(), ...PLACES];

export function driveMins(a: Place, b: Place) {
  const R = 6371, t = Math.PI / 180;
  const d = 2 * R * Math.asin(Math.sqrt(
    Math.sin(((b.lat - a.lat) * t) / 2) ** 2 +
    Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lng - a.lng) * t) / 2) ** 2));
  return Math.max(3, Math.round((d * 1.3) / 0.7)); // ~42 km/h on roads
}

export const toMin = (t: string) => { const [h = 0, m = 0] = t.split(":").map(Number); return h * 60 + m; };
export const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  const hh = h % 12 || 12;
  return `${hh}${mm ? ":" + String(mm).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
