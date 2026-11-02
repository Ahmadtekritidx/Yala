// Where the user is planning. Lebanon keeps the hand-picked places; any other city runs on live Google Places.
export type City = { name: string; country: string; cc: string; lat: number; lng: number };

export const LEBANON: City = {
  name: "Lebanon",
  country: "Lebanon",
  cc: "LB",
  lat: 33.8938,
  lng: 35.5018,
};
export const isLebanon = (c: City | null | undefined) => !c || c.cc === "LB";

// Countries whose weekend is Friday + Saturday.
const FRI_SAT = new Set([
  "SA",
  "KW",
  "QA",
  "BH",
  "OM",
  "JO",
  "EG",
  "IQ",
  "KW",
  "YE",
  "DZ",
  "LY",
  "SD",
]);
export const weekendDays = (c: City | null | undefined): [string, string] =>
  c && FRI_SAT.has(c.cc) ? ["Friday", "Saturday"] : ["Saturday", "Sunday"];

export const encodeCity = (c: City) =>
  [c.name, c.country, c.cc, c.lat.toFixed(4), c.lng.toFixed(4)].join("|");
export function decodeCity(s: string | undefined | null): City | null {
  const [name, country, cc, lat, lng] = (s ?? "").split("|");
  if (!name || !country || !cc || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)))
    return null;
  return { name, country, cc: cc.toUpperCase(), lat: Number(lat), lng: Number(lng) };
}

const KEY = "yalla:city";
export function loadCity(): City {
  try {
    return decodeCity(localStorage.getItem(KEY)) ?? LEBANON;
  } catch {
    return LEBANON;
  }
}
export function saveCity(c: City) {
  try {
    localStorage.setItem(KEY, encodeCity(c));
  } catch {
    /* storage blocked */
  }
}
export const cityLabel = (c: City) => (c.name === c.country ? c.name : `${c.name}, ${c.country}`);
