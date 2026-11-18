// Local sunset by formula (NOAA solar position, accurate to a few minutes), so the planner
// no longer relies on a fixed table for Lebanon or asks the AI to guess sunset abroad.

const rad = Math.PI / 180;

/** Sunset in minutes after midnight UTC for a date and place. */
export function sunsetUtcMinutes(lat: number, lng: number, date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start) / 864e5) + 1;
  const g = ((2 * Math.PI) / 365) * (day - 1);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const cosHa =
    Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) -
    Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / rad;
  return 720 - 4 * (lng - ha) - eqTime;
}

/** Minutes between UTC and local time in a time zone on a date (e.g. 120 for Beirut in winter). */
export function zoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
  );
  return Math.round((local - date.getTime()) / 60000);
}

/**
 * Local sunset in minutes from midnight. Lebanon uses its real time zone; elsewhere the offset
 * is estimated from longitude (good to within an hour), which is enough to place a sunset stop.
 */
export function localSunset(lat: number, lng: number, date: Date, timeZone?: string): number {
  const offset = timeZone ? zoneOffsetMinutes(timeZone, date) : Math.round(lng / 15) * 60;
  return Math.round(sunsetUtcMinutes(lat, lng, date) + offset);
}
