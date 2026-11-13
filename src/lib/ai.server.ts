// One door for every AI call: Claude, through the official Anthropic SDK.
// Model, effort and the output schema live here only.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { logAiCall } from "./log.server";
import { costUsd } from "./pricing";
import { sha256 } from "./store.server";

export const PLANNER_MODEL = "claude-opus-5-5";

export const aiConfigured = () => !!process.env["ANTHROPIC_API_KEY"];

const client = () =>
  new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"], timeout: 60_000, maxRetries: 1 });

// The shape the planner must return. Enforced by Claude's structured output, then checked again by our code.
export const PlanOut = z.object({
  plans: z.array(
    z.object({
      title: z.string(),
      vibe: z.string(),
      stops: z.array(z.object({ placeId: z.string(), reason: z.string(), time: z.string() })),
    }),
  ),
});
export type PlanOutT = z.infer<typeof PlanOut>;

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "credits" | "busy" | "key" | "refused" | "other"; error: string };

// What the call is for, so the AI-call log can be read per feature and joined to user events.
export type CallMeta = {
  feature: string; // "plans", "reel", "status"...
  runId?: string; // joins this call to the product events of the same request
  promptVersion?: string; // bump when the prompt changes, so results can be compared per version
  input?: string; // the user's own words, kept for building eval items (not the full prompt)
};

export async function askJSON<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  effort: "low" | "medium" | "high" = "medium",
  meta: CallMeta = { feature: "other" },
): Promise<AiResult<T>> {
  if (!aiConfigured())
    return { ok: false, kind: "key", error: "Missing secret: ANTHROPIC_API_KEY" };
  const started = Date.now();
  const result = await callClaude(system, user, schema, effort);
  const { res } = result;
  const model = res?.model ?? PLANNER_MODEL;
  const out = result.out;
  await logAiCall({
    run_id: meta.runId ?? null,
    feature: meta.feature,
    model,
    effort,
    prompt_version: meta.promptVersion ?? null,
    prompt_hash: await sha256(system + "\n" + user),
    prompt_chars: system.length + user.length,
    input_text: meta.input?.slice(0, 500) ?? null,
    ok: out.ok,
    error_kind: out.ok ? null : out.kind,
    error: out.ok ? null : out.error.slice(0, 300),
    stop_reason: res?.stop_reason ?? null,
    latency_ms: Date.now() - started,
    input_tokens: res?.usage.input_tokens ?? null,
    output_tokens: res?.usage.output_tokens ?? null,
    cache_read_tokens: res?.usage.cache_read_input_tokens ?? null,
    cache_write_tokens: res?.usage.cache_creation_input_tokens ?? null,
    cost_usd: res ? costUsd(model, res.usage) : null,
    output: out.ok ? out.data : null,
  }).catch(() => {});
  return out;
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

async function callClaude<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  effort: "low" | "medium" | "high",
): Promise<{
  res?: { model: string; stop_reason: string | null; usage: Usage };
  out: AiResult<T>;
}> {
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
    const meta = { model: res.model, stop_reason: res.stop_reason, usage: res.usage };
    if (res.stop_reason === "refusal")
      return {
        res: meta,
        out: { ok: false, kind: "refused", error: res.stop_details?.explanation ?? "declined" },
      };
    if (res.stop_reason === "max_tokens")
      return { res: meta, out: { ok: false, kind: "other", error: "answer cut off (max_tokens)" } };
    if (!res.parsed_output)
      return {
        res: meta,
        out: { ok: false, kind: "other", error: "answer did not match the schema" },
      };
    return { res: meta, out: { ok: true, data: res.parsed_output as T } };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return { out: { ok: false, kind: "key", error: "ANTHROPIC_API_KEY was rejected" } };
    if (e instanceof Anthropic.RateLimitError)
      return { out: { ok: false, kind: "busy", error: e.message } };
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message))
      return { out: { ok: false, kind: "credits", error: e.message } };
    if (e instanceof Anthropic.APIError)
      return {
        out: {
          ok: false,
          kind: e.status === 529 ? "busy" : "other",
          error: `${e.status} ${e.message}`.slice(0, 300),
        },
      };
    return { out: { ok: false, kind: "other", error: String(e).slice(0, 300) } };
  }
}

// Tiny live call for the /status page.
export async function aiStatus() {
  const r = await askJSON(
    "Reply with the JSON asked for.",
    'Return {"ok": true}.',
    z.object({ ok: z.boolean() }),
    "low",
    { feature: "status" },
  );
  return { model: PLANNER_MODEL, ok: r.ok, error: r.ok ? "" : r.error };
}
