import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cityNear, searchCityList, searchStayList } from "./live.server";
import { rateLimit } from "./limit.server";

// Each lookup is a paid Google call. Generous for typing in a picker, a wall for scripts.
const overLimit = async () => (await rateLimit("lookup", 300, 3600e3)) > 0;

export const searchCities = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => ({
    cities: (await overLimit()) ? [] : await searchCityList(data.q).catch(() => []),
  }));

export const cityFromLocation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d),
  )
  .handler(async ({ data }) => ({
    city: (await overLimit()) ? null : await cityNear(data.lat, data.lng).catch(() => null),
  }));

export const searchStays = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().min(2).max(100),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => ({
    stays: (await overLimit())
      ? []
      : await searchStayList(
          data.q,
          data.lat !== undefined && data.lng !== undefined
            ? { lat: data.lat, lng: data.lng }
            : undefined,
        ).catch(() => []),
  }));
