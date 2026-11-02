// One door for every AI call: provider, model and request shape live here only.
// OpenAI directly when OPENAI_API_KEY is set; the Lovable gateway otherwise, so the app keeps working.
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Pin the model here (or override with the OPENAI_MODEL secret without a code change).
const DEFAULT_MODEL = "gpt-6-astra";

export function aiConfig() {
  const openai = process.env["OPENAI_API_KEY"];
  if (openai) return { provider: "openai" as const, url: OPENAI_URL, key: openai, model: process.env["OPENAI_MODEL"] || DEFAULT_MODEL };
  const lovable = process.env["LOVABLE_API_KEY"];
  if (lovable) return { provider: "lovable" as const, url: LOVABLE_URL, key: lovable, model: `openai/${DEFAULT_MODEL}` };
  return null;
}

export type AiResult = { ok: true; content: string } | { ok: false; status: number; error: string };

// Ask for a JSON object back. Returns the raw JSON text for the caller to validate.
export async function chatJSON(system: string, user: string, effort: "low" | "medium" | "high" = "medium"): Promise<AiResult> {
  const cfg = aiConfig();
  if (!cfg) return { ok: false, status: 0, error: "No AI key: set OPENAI_API_KEY" };
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
    reasoning_effort: effort,
  };
  const call = () => fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let res = await call();
  // Models without reasoning reject reasoning_effort: retry once without it
  if (res.status === 400) {
    const text = await res.text();
    if (!/reasoning_effort/i.test(text)) return { ok: false, status: 400, error: text.slice(0, 300) };
    delete body["reasoning_effort"];
    res = await call();
  }
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  return content ? { ok: true, content } : { ok: false, status: 200, error: "Empty AI answer" };
}

// Tiny live call for the /status page.
export async function aiStatus() {
  const cfg = aiConfig();
  if (!cfg) return { provider: "none", model: "", ok: false, error: "Missing secret: OPENAI_API_KEY" };
  const r = await chatJSON("Reply with JSON only.", 'Return {"ok":true}', "low").catch((e) => ({ ok: false as const, status: 0, error: String(e) }));
  return { provider: cfg.provider, model: cfg.model, ok: r.ok, error: r.ok ? "" : `${r.status} ${r.error}` };
}
