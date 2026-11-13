// The exam runner. Scores a request parser against the golden set and fails the build on a regression.
//
//   node --experimental-strip-types evals/run.ts                    # score today's keyword parser
//   node --experimental-strip-types evals/run.ts --parser keyword   # same, explicit
//   node --experimental-strip-types evals/run.ts --update-baseline  # accept the current score as the new floor
//
// Writes evals/results/<parser>.json (every item, every check) and prints a summary.
// Exits with 1 when the pass rate drops below the floor in evals/baseline.json or hard fails go up.
// To add the AI parser later: add an entry to PARSERS that returns an Intent for a sentence.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { keywordIntent, type Intent } from "../src/lib/intent.ts";
import { scoreItem, summarize, CHECKS, type GoldenItem, type Summary } from "./score.ts";

const PARSERS: Record<string, (q: string) => Promise<Intent> | Intent> = {
  keyword: keywordIntent,
};

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const parserName = arg("parser") ?? "keyword";
const parse = PARSERS[parserName];
if (!parse) {
  console.error(`Unknown parser "${parserName}". Known: ${Object.keys(PARSERS).join(", ")}`);
  process.exit(2);
}

const root = new URL("..", import.meta.url);
const golden = JSON.parse(readFileSync(new URL("evals/parser.golden.json", root), "utf8")) as {
  feature: string;
  items: GoldenItem[];
};

const scores = [];
for (const item of golden.items) {
  let got: unknown;
  try {
    got = await parse(item.input);
  } catch (e) {
    got = { error: String(e) };
  }
  scores.push(scoreItem(item, got));
}
const summary = summarize(parserName, scores);

mkdirSync(new URL("evals/results/", root), { recursive: true });
writeFileSync(
  new URL(`evals/results/${parserName}.json`, root),
  JSON.stringify({ summary, items: scores }, null, 2) + "\n",
);

// Report
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
console.log(`\n${golden.feature}, parser "${parserName}"`);
console.log(
  `Pass rate: ${summary.passed}/${summary.items} = ${summary.passRate}%   Hard fails: ${summary.hardFails}\n`,
);
console.log("By check (items where the check applies):");
for (const c of CHECKS) {
  const r = summary.byCheck[c];
  console.log(
    `  ${c.padEnd(12)} ${String(r.passed).padStart(3)}/${String(r.tested).padEnd(3)} ${pct(r.passed, r.tested)}`,
  );
}
console.log("\nBy tag:");
for (const [t, r] of Object.entries(summary.byTag).sort())
  console.log(
    `  ${t.padEnd(13)} ${String(r.passed).padStart(3)}/${String(r.items).padEnd(3)} ${pct(r.passed, r.items)}`,
  );
const failed = scores.filter((s) => !s.pass);
if (failed.length) {
  console.log(`\nFailed items (${failed.length}):`);
  for (const s of failed) {
    const why = [
      ...CHECKS.filter((c) => s.checks[c] === "fail"),
      ...s.hardFails.map((h) => `HARD:${h}`),
    ].join(", ");
    console.log(`  #${String(s.id).padEnd(3)} ${s.input.slice(0, 48).padEnd(48)}  ${why}`);
  }
}

// Regression gate
const baselineUrl = new URL("evals/baseline.json", root);
const baseline = JSON.parse(readFileSync(baselineUrl, "utf8")) as Record<
  string,
  Pick<Summary, "passRate" | "hardFails" | "items">
>;
if (process.argv.includes("--update-baseline")) {
  baseline[parserName] = {
    passRate: summary.passRate,
    hardFails: summary.hardFails,
    items: summary.items,
  };
  writeFileSync(baselineUrl, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `\nBaseline for "${parserName}" set to ${summary.passRate}% / ${summary.hardFails} hard fails.`,
  );
} else {
  const floor = baseline[parserName];
  if (!floor)
    console.log(`\nNo baseline for "${parserName}" yet. Run with --update-baseline to set one.`);
  else if (summary.passRate < floor.passRate || summary.hardFails > floor.hardFails) {
    console.error(
      `\nREGRESSION: ${summary.passRate}% / ${summary.hardFails} hard fails, floor is ${floor.passRate}% / ${floor.hardFails}.`,
    );
    process.exit(1);
  } else
    console.log(`\nOK against the floor (${floor.passRate}% / ${floor.hardFails} hard fails).`);
}
