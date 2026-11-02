import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cityNear, searchCityList, searchStayList } from "./live.server";

export const searchCities = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => ({ cities: await searchCityList(data.q).catch(() => []) }));

export const cityFromLocation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d),
  )
  .handler(async ({ data }) => ({ city: await cityNear(data.lat, data.lng).catch(() => null) }));

export const searchStays = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(100), lat: z.number().optional(), lng: z.number().optional() }).parse(d))
  .handler(async ({ data }) => ({
    stays: await searchStayList(data.q, data.lat !== undefined && data.lng !== undefined ? { lat: data.lat, lng: data.lng } : undefined).catch(() => []),
  }));
