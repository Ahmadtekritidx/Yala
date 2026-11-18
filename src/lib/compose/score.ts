// D1: score each candidate place (docs/ai/compose-plans.md, Step 2).
// A formula, not AI: rating adjusted for how many people rated it, distance from where the
// user wants to be, profile match, and a boost for places saved from reels.
// Price, closed places, avoided categories and diet are filters (see alternatives.ts), never scores.
import { kmBetween, type Place } from "../places.ts";

// A place's rating is pulled toward PRIOR_MEAN until it has well over PRIOR_WEIGHT reviews,
// so 4.8 from 40 reviews ranks below 4.5 from 900.
export const PRIOR_MEAN = 4.3;
export const PRIOR_WEIGHT = 100;
// Hand-picked places have no review count; they were chosen for quality, so count them as well reviewed.
const CURATED_REVIEWS = 300;

export function adjustedRating(p: Pick<Place, "rating" | "reviews" | "live">) {
  const n = p.reviews ?? (p.live ? 20 : CURATED_REVIEWS);
  return (n * p.rating + PRIOR_WEIGHT * PRIOR_MEAN) / (n + PRIOR_WEIGHT);
}

export type ScoreContext = {
  /** Where the user wants to be: area centres, the city, or their hotel. */
  centers: [number, number][];
  /** Profile likes and preferences, e.g. "Sea view", "Mountains", "Hidden gems", "Something new". */
  likes: string[];
  savedIds: Set<string>;
};

export const SAVED_BOOST = 1;

export function scorePlace(p: Place, ctx: ScoreContext): number {
  let s = adjustedRating(p);
  // Distance: free within 5 km of a centre, then a small cost per km, capped.
  if (ctx.centers.length) {
    const km = Math.min(...ctx.centers.map((c) => kmBetween(c, [p.lat, p.lng])));
    s -= Math.min(0.6, Math.max(0, km - 5) * 0.02);
  }
  const likes = ctx.likes.map((l) => l.toLowerCase());
  if (likes.includes("sea view") && p.cat === "Sea view") s += 0.2;
  if (likes.includes("mountains") && (p.cat === "Hike" || p.cat === "Scenic stop")) s += 0.2;
  if (likes.includes("hidden gems") && (p.reviews ?? CURATED_REVIEWS) < 300) s += 0.15;
  if (likes.includes("something new") && p.isNew) s += 0.25;
  if (ctx.savedIds.has(p.id)) s += SAVED_BOOST;
  return Math.round(s * 1000) / 1000;
}
