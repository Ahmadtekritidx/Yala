import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminKeyMatches, adminMissing, langfuseLinks, qualityReport } from "./admin.server";
import { rateLimit } from "./limit.server";

// The admin quality page (/admin). Exam data only: test requests we wrote, no customer data.
export const adminQuality = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const missing = adminMissing();
    if (missing.length) return { status: "not-set-up" as const, missing };
    // Every request counts, so a blocked visitor can't keep guessing. Plenty for two admins.
    const wait = await rateLimit("admin", 60, 3600e3);
    if (wait > 0) return { status: "slow-down" as const, minutes: wait };
    if (!adminKeyMatches(data.key)) return { status: "wrong-key" as const };
    try {
      return { status: "ok" as const, report: await qualityReport(), links: langfuseLinks() };
    } catch (e) {
      return { status: "langfuse-error" as const, error: String(e).slice(0, 200) };
    }
  });
