// "Want to go" list: places saved from reels. Stored on this device for now.
import { registerPlaces, type Place } from "./places";
import { saveClip } from "./media";

export type Saved = {
  place: Place;
  url?: string | undefined;
  dish?: string | undefined;
  at: number;
};
const KEY = "yala.saved.v1";

export function loadSaved(): Saved[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Saved[];
    registerPlaces(list.map((s) => s.place).filter((p) => p.live));
    return list;
  } catch {
    return [];
  }
}
function write(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked */
  }
}
export function addSaved(s: Omit<Saved, "at">): Saved[] {
  if (s.place.live) registerPlaces([s.place]);
  if (s.url) saveClip(s.place.id, s.url);
  const list = [
    { ...s, at: Date.now() },
    ...loadSaved().filter((x) => x.place.id !== s.place.id),
  ].slice(0, 40);
  write(list);
  return list;
}
export function removeSaved(id: string): Saved[] {
  const list = loadSaved().filter((x) => x.place.id !== id);
  write(list);
  return list;
}
export const savedIds = () => new Set(loadSaved().map((s) => s.place.id));
