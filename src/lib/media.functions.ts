import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Expands short share links (vm.tiktok.com, youtu.be redirects, etc.) to the full URL.
const SHORT = /^(vm|vt)\.tiktok\.com$|^tiktok\.com$|^www\.tiktok\.com$/;
export const expandLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const host = new URL(data.url).hostname;
    if (!SHORT.test(host)) return { url: data.url };
    try {
      const res = await fetch(data.url, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0" },
      });
      return { url: res.url || data.url };
    } catch {
      return { url: data.url };
    }
  });
