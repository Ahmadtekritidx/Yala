// The one door to Langfuse for the exam tools (docs/ai/judge.md).
// Keys come from the environment, never from code:
//   LANGFUSE_PUBLIC_KEY=pk-lf-...  LANGFUSE_SECRET_KEY=sk-lf-...
//   LANGFUSE_BASE_URL=https://cloud.langfuse.com   (EU region, the default here)
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { RUBRIC, type Question } from "../compose/rubric.ts";

export const DATASET_COMPOSE = "compose-plans";
export const DATASET_PARSER = "parser";
export const QUEUE_HUMANS = "Plan quality (humans)";

// Scores the program writes (not graded by people), shown next to the rubric in the dashboard.
export const CODE_SCORES = {
  checks: "A checks passed",
  instantFails: "Instant fails (code)",
  quality: "Quality avg",
} as const;

export function langfuseConfigured() {
  return !!(process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"]);
}

export function requireLangfuse() {
  if (!langfuseConfigured()) {
    console.error(
      "Langfuse keys missing. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL for the US region). See docs/ai/judge.md.",
    );
    process.exit(2);
  }
  process.env["LANGFUSE_BASE_URL"] ??= "https://cloud.langfuse.com";
}

// Langfuse client plus tracing, so every experiment item becomes a trace. Call `close()` before exit.
export function connect() {
  requireLangfuse();
  const processor = new LangfuseSpanProcessor();
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();
  const langfuse = new LangfuseClient();
  return {
    langfuse,
    async close() {
      await langfuse.flush();
      await processor.forceFlush();
      await provider.shutdown();
    },
  };
}

type Api = LangfuseClient["api"];

// Score config for one rubric question: 1 to 5 numbers, or a yes/no flag (1 = clean).
function configFor(q: Question) {
  if (q.kind === "scale")
    return {
      name: q.name,
      dataType: "NUMERIC" as const,
      minValue: 1,
      maxValue: 5,
      description: `${q.question}\n5: ${q.anchors[5]}\n3: ${q.anchors[3]}\n1: ${q.anchors[1]}`,
    };
  return {
    name: q.name,
    dataType: "BOOLEAN" as const,
    description: `${q.question}\nFalse (instant fail) when: ${q.failsWhen}\nTrue when: ${q.cleanWhen}`,
  };
}

const codeConfigs = [
  {
    name: CODE_SCORES.checks,
    dataType: "NUMERIC" as const,
    minValue: 0,
    maxValue: 1,
    description: "Share of Yes/No checks (A1 to A12) passed by a program. Target 1.",
  },
  {
    name: CODE_SCORES.instantFails,
    dataType: "NUMERIC" as const,
    minValue: 0,
    description: "Instant fails a program found (C1, C2). Must be 0.",
  },
  {
    name: CODE_SCORES.quality,
    dataType: "NUMERIC" as const,
    minValue: 1,
    maxValue: 5,
    description: "Average of the 1 to 5 rubric questions for one test. Target 4, none below 3.",
  },
];

async function allConfigs(api: Api) {
  const out: { id: string; name: string; isArchived: boolean }[] = [];
  for (let page = 1; ; page++) {
    const r = await api.scoreConfigs.get({ page, limit: 100 });
    out.push(...r.data);
    if (page >= r.meta.totalPages) return out;
  }
}

// Creates any missing score config. Returns name -> config id.
export async function ensureScoreConfigs(api: Api, log = console.log) {
  const existing = new Map(
    (await allConfigs(api)).filter((c) => !c.isArchived).map((c) => [c.name, c.id]),
  );
  for (const body of [...RUBRIC.map(configFor), ...codeConfigs]) {
    if (existing.has(body.name)) continue;
    const c = await api.scoreConfigs.create(body);
    existing.set(c.name, c.id);
    log(`  created score config "${c.name}"`);
  }
  return existing;
}

// The human grading queue, with every rubric question. Returns its id.
export async function ensureQueue(api: Api, configIds: Map<string, string>, log = console.log) {
  for (let page = 1; ; page++) {
    const r = await api.annotationQueues.listQueues({ page, limit: 100 });
    const found = r.data.find((q) => q.name === QUEUE_HUMANS);
    if (found) return found.id;
    if (page >= r.meta.totalPages) break;
  }
  const q = await api.annotationQueues.createQueue({
    name: QUEUE_HUMANS,
    description:
      "Grade each plan set alone, BEFORE looking at the AI judge's scores. Rubric: docs/ai/judge.md.",
    scoreConfigIds: RUBRIC.map((r) => configIds.get(r.name)).filter((x): x is string => !!x),
  });
  log(`  created annotation queue "${q.name}"`);
  return q.id;
}

export async function ensureDataset(api: Api, name: string, description: string, metadata: object) {
  try {
    return await api.datasets.get(name);
  } catch {
    return api.datasets.create({ name, description, metadata });
  }
}
