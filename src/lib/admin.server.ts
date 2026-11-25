// Admin: who may see the quality report, and where its scores come from (Langfuse).
// Server only. Needs YALLA_ADMIN_KEY plus the Langfuse keys (docs/ai/judge.md, "Admin page").
import { createHash, timingSafeEqual } from "node:crypto";
import { buildReport, type QualityReport, type RawScore } from "./quality-report";

const env = (k: string) => process.env[k]?.trim() || undefined;
const langfuseBase = () =>
  (env("LANGFUSE_BASE_URL") ?? "https://cloud.langfuse.com").replace(/\/$/, "");

// Server settings still missing (names only, never values).
export function adminMissing() {
  return ["YALLA_ADMIN_KEY", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"].filter((k) => !env(k));
}

// Same time whatever the guess, so the key can't be found one character at a time.
export function adminKeyMatches(given: string) {
  const want = env("YALLA_ADMIN_KEY");
  if (!want) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(want));
}

type V3Score = {
  name: string;
  value?: number | boolean | null;
  source: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
  subject?: { kind: string; id: string; traceId?: string } | null;
};

const MAX_PAGES = 50; // 5,000 scores: about 25 exam runs with people's grades
const DAYS = 180;

async function fetchScores(): Promise<RawScore[]> {
  const auth = Buffer.from(`${env("LANGFUSE_PUBLIC_KEY")}:${env("LANGFUSE_SECRET_KEY")}`).toString(
    "base64",
  );
  const from = new Date(Date.now() - DAYS * 864e5).toISOString();
  const out: RawScore[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      limit: "100",
      fields: "details,subject",
      fromTimestamp: from,
      ...(cursor ? { cursor } : {}),
    });
    const res = await fetch(`${langfuseBase()}/api/public/v3/scores?${q}`, {
      headers: { authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Langfuse answered ${res.status}`);
    const body = (await res.json()) as { data: V3Score[]; meta: { cursor?: string } };
    for (const s of body.data) {
      const subject = s.subject;
      const traceId = subject?.kind === "trace" ? subject.id : (subject?.traceId ?? undefined);
      const run = s.metadata?.["run"];
      out.push({
        name: s.name,
        value: s.value ?? null,
        source: s.source,
        timestamp: s.timestamp,
        ...(traceId ? { traceId } : {}),
        ...(typeof run === "string" ? { run } : {}),
      });
    }
    cursor = body.meta.cursor;
    if (!cursor) break;
  }
  return out;
}

// One minute cache: the page is opened by two people, Langfuse is slow to page through.
let cached: { at: number; v: Promise<QualityReport> } | null = null;

export function qualityReport() {
  if (!cached || Date.now() - cached.at > 60_000) {
    const v = fetchScores().then(buildReport);
    cached = { at: Date.now(), v };
    v.catch(() => (cached = null));
  }
  return cached.v;
}

export const langfuseLinks = () => ({ langfuse: langfuseBase() });
