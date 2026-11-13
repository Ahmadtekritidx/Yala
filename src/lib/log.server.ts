// The two logs every later step depends on (see docs/ai/data-and-recommendations.md):
//   ai_calls: one row per Claude call (what went in, what came out, model, time, tokens, cost)
//   events:   one row per product event (plans shown, picked, swapped, removed, shared...)
// Rows go to the shared store when it is configured, otherwise to the server log as one JSON line,
// so nothing is silently lost while the database is not connected yet.
import { insertRows, storeConfigured } from "./store.server";

export type AiCallRow = {
  run_id: string | null;
  feature: string;
  model: string;
  effort: string;
  prompt_version: string | null;
  prompt_hash: string;
  prompt_chars: number;
  input_text: string | null;
  ok: boolean;
  error_kind: string | null;
  error: string | null;
  stop_reason: string | null;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  output: unknown;
};

export type EventRow = {
  name: string;
  run_id: string | null;
  device_id: string | null;
  props: Record<string, unknown>;
};

async function write(table: "ai_calls" | "events", rows: object[]) {
  if (!rows.length) return;
  if (storeConfigured() && (await insertRows(table, rows))) return;
  for (const r of rows)
    console.log(JSON.stringify({ log: table, at: new Date().toISOString(), ...r }));
}

export const logAiCall = (row: AiCallRow) => write("ai_calls", [row]);
export const logEvents = (rows: EventRow[]) => write("events", rows);
