import { aiConfigured, askJSON } from "./ai.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { allPlaces, CATEGORIES, kmBetween, type Category, type Place } from "./places";
import { findPlace } from "./live.server";
import { isLebanon } from "./city";
import { rateLimit } from "./limit.server";

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
  .handler(async ({ data }) => ({
    url: (await rateLimit("expand", 60, 3600e3)) ? data.url : await expand(data.url),
  }));

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
    // Instagram: captions need a login, so the user types the place name instead.
  } catch {
    /* best effort */
  }
  return "";
}

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
    z
      .object({
        url: z.string().url().max(500),
        hint: z.string().max(120).default(""),
        city: z
          .object({
            name: z.string().max(80),
            country: z.string().max(80),
            cc: z.string().length(2),
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ReelResult> => {
    if (!aiConfigured()) return { error: "AI not configured" };
    if (await rateLimit("reel", 30, 3600e3))
      return { error: "Too many links this hour. Try again later." };

    const url = await expand(data.url);
    const text = await caption(url);
    if (!text.trim() && !data.hint.trim()) {
      return {
        error: url.includes("instagram.com")
          ? "Instagram hides captions. Type the place name below."
          : "Couldn't read this post. Type the place name below.",
      };
    }

    // Only places around where the user is planning, capped: the server's place list grows while it runs,
    // and every name here is paid for in the prompt. Hand-picked places first, then the newest live ones.
    const abroad = data.city && !isLebanon(data.city) ? data.city : undefined;
    const center: [number, number] = abroad ? [abroad.lat, abroad.lng] : [33.89, 35.5];
    const nearby = allPlaces().filter(
      (p) => p.cat !== "Stay" && kmBetween(center, [p.lat, p.lng]) <= (abroad ? 80 : 150),
    );
    const known = [...nearby.filter((p) => !p.live), ...nearby.filter((p) => p.live).reverse()]
      .slice(0, 200)
      .map((p) => ({ id: p.id, name: p.name, area: p.area }));
    const ai = await askJSON(
      `You find the ONE real place (anywhere in the world; the user is planning around ${data.city ? `${data.city.name}, ${data.city.country}` : "Lebanon"}) that a social video is about. Reply ONLY JSON: {"placeId":string|null,"name":string|null,"area":string|null,"category":one of ${JSON.stringify(CATEGORIES)}|null,"dish":string|null}. placeId only if it clearly matches a known place. name = the venue's real name (not the creator). area = town or city, plus country if it is not obvious. dish = the one thing to order or do, max 5 words, or null. If no specific place, all null.`,
      `Link: ${url}\nCaption: ${text || "(none)"}\nUser hint: ${data.hint || "(none)"}\nKnown places: ${JSON.stringify(known)}`,
      Out,
      "low",
      { feature: "reel", promptVersion: "reel-v1", input: (data.hint || text).slice(0, 300) },
    );
    if (!ai.ok) {
      console.error("readReel", ai.kind, ai.error);
      return { error: "Couldn't find a place in this post. Add the name and try again." };
    }
    const out = ai.data;

    const dish = out.dish ?? undefined;
    const match =
      out.placeId && known.some((k) => k.id === out.placeId)
        ? allPlaces().find((p) => p.id === out.placeId)
        : undefined;
    if (match) return { place: match, url, dish };
    if (!out.name)
      return { error: "Couldn't find a place in this post. Add the name and try again." };
    const cat = (CATEGORIES as string[]).includes(out.category ?? "")
      ? (out.category as Category)
      : "Lunch";
    const found = await findPlace(out.name, out.area ?? "", cat, data.city).catch(() => null);
    if (!found) return { error: `Found "${out.name}" but couldn't locate it on Maps.` };
    return { place: found, url, dish };
  });
