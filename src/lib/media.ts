// Short videos per place. Works with no Meta / TikTok API keys:
// we only use public embed URLs and search deep links.
import type { Place } from "./places";

export type Platform = "tiktok" | "youtube" | "instagram";
export type Clip = { url: string; platform: Platform; id: string; embed: string };

// Curated clips per place id. Add real public links here (TikTok, YouTube Shorts, Instagram reels).
export const CURATED: Record<string, string[]> = {};

export function parseClip(raw: string): Clip | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const path = u.pathname;
  if (host.endsWith("tiktok.com")) {
    const id = path.match(/\/video\/(\d+)/)?.[1];
    return id
      ? { url: raw, platform: "tiktok", id, embed: `https://www.tiktok.com/embed/v2/${id}` }
      : null;
  }
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id =
      host === "youtu.be"
        ? path.slice(1)
        : (path.match(/\/(?:shorts|embed)\/([\w-]{6,})/)?.[1] ?? u.searchParams.get("v"));
    return id
      ? {
          url: raw,
          platform: "youtube",
          id,
          embed: `https://www.youtube.com/embed/${id}?playsinline=1`,
        }
      : null;
  }
  if (host.endsWith("instagram.com")) {
    const m = path.match(/\/(reel|reels|p|tv)\/([\w-]+)/);
    if (!m) return null;
    const kind = m[1] === "reels" ? "reel" : m[1];
    return {
      url: raw,
      platform: "instagram",
      id: m[2]!,
      embed: `https://www.instagram.com/${kind}/${m[2]}/embed`,
    };
  }
  return null;
}

const KEY = "yala.clips.v1";
type Store = Record<string, string[]>;
function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}
export function savedClips(placeId: string): string[] {
  return read()[placeId] ?? [];
}
export function saveClip(placeId: string, url: string) {
  try {
    const s = read();
    s[placeId] = [url, ...(s[placeId] ?? []).filter((x) => x !== url)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: clip still shows this session */
  }
}
export function removeClip(placeId: string, url: string) {
  try {
    const s = read();
    s[placeId] = (s[placeId] ?? []).filter((x) => x !== url);
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clipsFor(placeId: string, extra: string[] = []): Clip[] {
  const seen = new Set<string>();
  return [...extra, ...(CURATED[placeId] ?? [])]
    .map(parseClip)
    .filter((c): c is Clip => !!c && !seen.has(c.platform + c.id) && !!seen.add(c.platform + c.id));
}

export function searchLinks(p: Pick<Place, "name" | "area">) {
  const q = encodeURIComponent(`${p.name} ${p.area}`);
  return [
    { label: "TikTok", href: `https://www.tiktok.com/search/video?q=${q}` },
    { label: "Reels", href: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { label: "Shorts", href: `https://www.youtube.com/results?search_query=${q}+shorts` },
  ];
}
