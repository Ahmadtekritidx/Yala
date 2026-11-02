// One door for every AI call: Claude, through the official Anthropic SDK.
// Model, effort and the output schema live here only.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

export const PLANNER_MODEL = "claude-opus-5-5";

export const aiConfigured = () => !!process.env["ANTHROPIC_API_KEY"];

const client = () => new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"], timeout: 60_000, maxRetries: 1 });

// The shape the planner must return. Enforced by Claude's structured output, then checked again by our code.
export const PlanOut = z.object({
  plans: z.array(z.object({
    title: z.string(),
    vibe: z.string(),
    stops: z.array(z.object({ placeId: z.string(), reason: z.string(), time: z.string() })),
  })),
});
export type PlanOutT = z.infer<typeof PlanOut>;

export type AiResult<T> = { ok: true; data: T } | { ok: false; kind: "credits" | "busy" | "key" | "refused" | "other"; error: string };

export async function askJSON<T>(system: string, user: string, schema: z.ZodType<T>, effort: "low" | "medium" | "high" = "medium"): Promise<AiResult<T>> {
  if (!aiConfigured()) return { ok: false, kind: "key", error: "Missing secret: ANTHROPIC_API_KEY" };
  try {
    const res = await client().beta.messages.parse({
      model: PLANNER_MODEL,
      max_tokens: 16000,
      // If Claude declines for a policy reason, Anthropic re-runs the request on its recommended fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
    });
    if (res.stop_reason === "refusal") return { ok: false, kind: "refused", error: res.stop_details?.explanation ?? "declined" };
    if (res.stop_reason === "max_tokens") return { ok: false, kind: "other", error: "answer cut off (max_tokens)" };
    if (!res.parsed_output) return { ok: false, kind: "other", error: "answer did not match the schema" };
    return { ok: true, data: res.parsed_output as T };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, kind: "key", error: "ANTHROPIC_API_KEY was rejected" };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, kind: "busy", error: e.message };
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return { ok: false, kind: "credits", error: e.message };
    if (e instanceof Anthropic.APIError) return { ok: false, kind: e.status === 529 ? "busy" : "other", error: `${e.status} ${e.message}`.slice(0, 300) };
    return { ok: false, kind: "other", error: String(e).slice(0, 300) };
  }
}

// Tiny live call for the /status page.
export async function aiStatus() {
  const r = await askJSON("Reply with the JSON asked for.", 'Return {"ok": true}.', z.object({ ok: z.boolean() }), "low");
  return { model: PLANNER_MODEL, ok: r.ok, error: r.ok ? "" : r.error };
}
