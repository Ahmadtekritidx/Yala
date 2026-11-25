// One-time (and safe to re-run) Langfuse setup for the exam. See docs/ai/judge.md.
//   npm run judge:setup
// Creates what is missing, never deletes:
//   - score configs: the rubric questions (B1 to B7, C3 to C5) and the program's scores
//   - the human grading queue "Plan quality (humans)"
//   - datasets "compose-plans" (evals/compose/tests.json) and "parser" (evals/parser.golden.json),
//     re-synced on every run, so editing a test file and re-running updates them
import { readFileSync } from "node:fs";
import { loadCards } from "../compose/answers.ts";
import { RUBRIC_VERSION } from "../compose/rubric.ts";
import {
  DATASET_COMPOSE,
  DATASET_PARSER,
  connect,
  ensureDataset,
  ensureQueue,
  ensureScoreConfigs,
} from "./client.ts";

const { langfuse, close } = connect();
const api = langfuse.api;

console.log("Score configs");
const configs = await ensureScoreConfigs(api);
console.log(`  ${configs.size} in the project`);

console.log("Human grading queue");
await ensureQueue(api, configs);

console.log(`Dataset ${DATASET_COMPOSE}`);
const { version, cards } = loadCards();
await ensureDataset(
  api,
  DATASET_COMPOSE,
  "Compose plans exam: one card per test (evals/compose/tests.json)",
  {
    testsVersion: version,
    rubricVersion: RUBRIC_VERSION,
  },
);
for (const c of cards)
  await api.datasetItems.create({
    datasetName: DATASET_COMPOSE,
    id: `compose-${c.id}`,
    input: c,
    metadata: {
      testId: c.id,
      kind: c.kind,
      status: c.status,
      about: c.about,
      testsVersion: version,
    },
    // Tests waiting for data we don't have yet stay in the file but out of experiments.
    status: c.status === "ready" ? "ACTIVE" : "ARCHIVED",
  });
console.log(`  ${cards.length} items (${cards.filter((c) => c.status === "ready").length} ready)`);

console.log(`Dataset ${DATASET_PARSER}`);
const parser = JSON.parse(
  readFileSync(new URL("../parser.golden.json", import.meta.url), "utf8"),
) as {
  feature: string;
  version: number;
  schema: string;
  items: { id: number; tags: string[]; input: string; ideal: unknown }[];
};
await ensureDataset(api, DATASET_PARSER, `${parser.feature} (evals/parser.golden.json)`, {
  version: parser.version,
  schema: parser.schema,
});
for (const it of parser.items)
  await api.datasetItems.create({
    datasetName: DATASET_PARSER,
    id: `parser-${it.id}`,
    input: { text: it.input },
    expectedOutput: it.ideal,
    metadata: { testId: it.id, tags: it.tags, version: parser.version },
  });
console.log(`  ${parser.items.length} items`);

await close();
console.log("\nDone. Next: npm run judge -- --source saved   (see docs/ai/judge.md)");
