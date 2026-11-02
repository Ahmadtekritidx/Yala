import { aiConfigured, askJSON } from "./ai.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod/v4";
import { allPlaces, CATEGORIES, type Category, type Place } from "./places";
import { findPlace } from "./live.server";

const SHORT = /^(vm|vt)\.tiktok\.com$|^(www\.)?tiktok\.com$|^youtu\.be$/;
async function expand(url: string) {
  if (!SHORT.test(new URL(url).hostname)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

// Expands short share links (vm.tiktok.com) to the full URL.
export const expandLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => ({ url: await expand(data.url) }));

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

// Public caption text, no API keys: TikTok and YouTube oEmbed, Instagram page meta tags.
async function caption(url: string): Promise<string> {
  const host = new URL(url).hostname;
  const get = (u: string, ua = "Mozilla/5.0") =>
    fetch(u, { headers: { "user-agent": ua }, signal: AbortSignal.timeout(7000) });
  try {
    if (host.includes("tiktok.com")) {
      const j = (await (
        await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
      ).json()) as { title?: string; author_name?: string };
      return `${j.title ?? ""} (by ${j.author_name ?? "?"})`;
    }
    if (host.includes("youtu")) {
      const j = (await (
        await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
      ).json()) as { title?: string; author_name?: string };
      return `${j.title ?? ""} (by ${j.author_name ?? "?"})`;
    }
    if (host.includes("instagram.com")) {
      const html = await (await get(url, "facebookexternalhit/1.1")).text();
      const meta = [
        ...html.matchAll(
          /<meta[^>]+(?:property|name)="(og:title|og:description|description)"[^>]+content="([^"]*)"/g,
        ),
      ].map((m) => decode(m[2]!));
      return meta.join(" | ").slice(0, 1500);
    }
  } catch {
    /* best effort */
  }
  return "";
}

const hits = new Map<string, number[]>();
const Out = z.object({
  placeId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  dish: z.string().nullable().optional(),
});

export type ReelResult =
  { place: Place; url: string; dish?: string | undefined } | { error: string };

export const readReel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().url().max(500), hint: z.string().max(120).default("") }).parse(d),
  )
  .handler(async ({ data }): Promise<ReelResult> => {
    if (!aiConfigured()) return { error: "AI not configured" };
    const ip = (
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0] ||
      "anon"
    ).trim();
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600e3);
    if (recent.length >= 30) return { error: "Too many links this hour. Try again later." };
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();

    const url = await expand(data.url);
    const text = await caption(url);
    if (!text.trim() && !data.hint.trim())
      return { error: "Couldn't read this post. Type the place name and try again." };

    const known = allPlaces()
      .filter((p) => p.cat !== "Stay")
      .map((p) => ({ id: p.id, name: p.name, area: p.area }));
    const ai = await askJSON(`You find the ONE real place in Lebanon that a social video is about. Reply ONLY JSON: {"placeId":string|null,"name":string|null,"area":string|null,"category":one of ${JSON.stringify(CATEGORIES)}|null,"dish":string|null}. placeId only if it clearly matches a known place. name = the venue's real name (not the creator). area = town. dish = the one thing to order or do, max 5 words, or null. If no specific place, all null.`, `Link: ${url}\nCaption: ${text || "(none)"}\nUser hint: ${data.hint || "(none)"}\nKnown places: ${JSON.stringify(known)}`, Out, "low");
    if (!ai.ok) {
      console.error("readReel", ai.kind, ai.error);
      return { error: "Couldn't find a place in this post. Add the name and try again." };
    }
    const out = ai.data;

    const dish = out.dish ?? undefined;
    const match = out.placeId ? allPlaces().find((p) => p.id === out.placeId) : undefined;
    if (match) return { place: match, url, dish };
    if (!out.name)
      return { error: "Couldn't find a place in this post. Add the name and try again." };
    const cat = (CATEGORIES as string[]).includes(out.category ?? "")
      ? (out.category as Category)
      : "Lunch";
    const found = await findPlace(out.name, out.area ?? "", cat).catch(() => null);
    if (!found) return { error: `Found "${out.name}" but couldn't locate it on Maps.` };
    return { place: found, url, dish };
  });
