// Parse Google "weekdayDescriptions" for one day, e.g. "9:00 AM – 11:00 PM",
// "12:00 – 3:30 PM, 7:00 – 11:00 PM", "Open 24 hours", "Closed".
// Returns open ranges in minutes from midnight (end may pass 1440 for late nights),
// [] when closed, or null when unknown.
export function parseHours(h: string | undefined): [number, number][] | null {
  if (!h) return null;
  const s = h.replace(/[   ]/g, " ").trim();
  if (/closed/i.test(s)) return [];
  if (/24 hours/i.test(s)) return [[0, 1440]];
  const out: [number, number][] = [];
  for (const part of s.split(",")) {
    const m = part.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!m) continue;
    const endAp = m[6]?.toUpperCase();
    const startAp = m[3]?.toUpperCase() ?? endAp;
    const conv = (hh: string, mm: string | undefined, ap: string | undefined) => {
      let x = Number(hh) % 12;
      if (ap === "PM") x += 12;
      if (!ap && Number(hh) === 12) x = 12;
      return x * 60 + Number(mm ?? 0);
    };
    let a = conv(m[1]!, m[2], startAp);
    const b0 = conv(m[4]!, m[5], endAp);
    // "11:00 – 3:00 PM" with no start marker: the start is morning if it would otherwise come after the end
    if (!m[3] && endAp === "PM" && a > b0) a -= 720;
    const b = b0 <= a ? b0 + 1440 : b0;
    out.push([a, b]);
  }
  return out.length ? out : null;
}

// True when a visit starting at `start` for `mins` fits inside opening hours
// (we only require the first 45 minutes to fit, so a long lunch near closing is still allowed).
// Unknown hours count as open.
export function openAt(h: string | undefined, start: number, mins: number) {
  const r = parseHours(h);
  if (r === null) return true;
  const need = Math.min(mins, 45);
  return r.some(([a, b]) => start >= a && start + need <= b);
}

export const closedToday = (h: string | undefined) => parseHours(h)?.length === 0;
