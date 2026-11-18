import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rateLimit } from "./limit.server";
import { logEvents } from "./log.server";
import { EVENT_NAMES } from "./track";

// Product events from the browser (plan shown, picked, stop swapped...). Small and validated,
// so the log can't be filled with junk: known names only, a few short props, a few events per call.
const Prop = z.union([z.string().max(300), z.number(), z.boolean(), z.null()]);
const Batch = z.object({
  device: z.string().uuid(),
  events: z
    .array(
      z.object({
        name: z.enum(EVENT_NAMES),
        runId: z.string().uuid().optional(),
        props: z.record(z.string().max(40), Prop).default({}),
      }),
    )
    .min(1)
    .max(20),
});

export const trackEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Batch.parse(d))
  .handler(async ({ data }) => {
    if (await rateLimit("track", 600, 3600e3)) return { ok: false };
    await logEvents(
      data.events.map((e) => ({
        name: e.name,
        run_id: e.runId ?? null,
        device_id: data.device,
        props: Object.fromEntries(Object.entries(e.props).slice(0, 12)),
      })),
    );
    return { ok: true };
  });
