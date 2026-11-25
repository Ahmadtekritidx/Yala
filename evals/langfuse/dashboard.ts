// Creates the Langfuse dashboard "Yalla plan quality" (docs/ai/judge.md).
//
//   npm run judge:dashboard              # create it (does nothing if it already exists)
//   npm run judge:dashboard -- --replace # delete it and its widgets, then create it again
//
// Langfuse score charts can group by day, score name and grader (source), not by run. One exam
// run a day is the normal rhythm, so "by day" reads as "by run". The admin page in the app
// (/admin) shows the exact per-run table.
import { pathToFileURL } from "node:url";
import { connect, CODE_SCORES, RUN_SCORES } from "./client.ts";
import { RUBRIC } from "../compose/rubric.ts";

export const DASHBOARD_NAME = "Yalla plan quality";

type Filter = { column: string; operator: string; type: string; value?: unknown; key?: string };
const named = (...names: string[]): Filter =>
  names.length === 1
    ? { column: "name", operator: "=", type: "string", value: names[0] }
    : { column: "name", operator: "any of", type: "stringOptions", value: names };
const byJudge: Filter = { column: "source", operator: "=", type: "string", value: "API" };
const scaleNames = RUBRIC.filter((q) => q.kind === "scale").map((q) => q.name);
const flagNames = RUBRIC.filter((q) => q.kind === "flag").map((q) => q.name);

type Widget = {
  name: string;
  description: string;
  view: "scores-numeric" | "scores-boolean";
  dimensions: { field: string }[];
  metrics: { measure: string; agg: "avg" | "sum" | "count" }[];
  filters: Filter[];
  chartType: "NUMBER" | "VERTICAL_BAR" | "PIVOT_TABLE";
  w: number;
  h: number;
};

const day = [{ field: "timestampDay" }];
// Grader: API = the AI judge (and code), ANNOTATION = Ahmad and Youssef in the queue.
const questionAndGrader = [{ field: "name" }, { field: "source" }];

export const WIDGETS: Widget[] = [
  {
    name: "Quality avg",
    description: "AI judge average of the 1 to 5 questions, all tests. Target 4 or more.",
    view: "scores-numeric",
    dimensions: [],
    metrics: [{ measure: "value", agg: "avg" }],
    filters: [named(CODE_SCORES.quality), byJudge],
    chartType: "NUMBER",
    w: 4,
    h: 4,
  },
  {
    name: "Instant fails (code)",
    description: "Closed or invented places found by the program (C1, C2). Must be 0.",
    view: "scores-numeric",
    dimensions: [],
    metrics: [{ measure: "value", agg: "sum" }],
    filters: [named(CODE_SCORES.instantFails)],
    chartType: "NUMBER",
    w: 4,
    h: 4,
  },
  {
    name: "Checks passed",
    description: "Share of the A1 to A12 Yes/No checks passed, all tests. Target 100%.",
    view: "scores-numeric",
    dimensions: [],
    metrics: [{ measure: "value", agg: "avg" }],
    filters: [named(CODE_SCORES.checks)],
    chartType: "NUMBER",
    w: 4,
    h: 4,
  },
  {
    name: "Quality avg by day",
    description: "AI judge quality average per day (one exam run a day reads as per run).",
    view: "scores-numeric",
    dimensions: day,
    metrics: [{ measure: "value", agg: "avg" }],
    filters: [named(CODE_SCORES.quality), byJudge],
    chartType: "VERTICAL_BAR",
    w: 6,
    h: 6,
  },
  {
    name: "Checks passed by day",
    description: "Share of Yes/No checks passed per day.",
    view: "scores-numeric",
    dimensions: day,
    metrics: [{ measure: "value", agg: "avg" }],
    filters: [named(CODE_SCORES.checks)],
    chartType: "VERTICAL_BAR",
    w: 6,
    h: 6,
  },
  {
    name: "Score per question: judge vs people",
    description:
      "Average 1 to 5 grade per rubric question. Source API = AI judge, ANNOTATION = people. A gap of more than 1 means the judge can't be trusted on that question yet.",
    view: "scores-numeric",
    dimensions: questionAndGrader,
    metrics: [
      { measure: "value", agg: "avg" },
      { measure: "count", agg: "count" },
    ],
    filters: [named(...scaleNames)],
    chartType: "PIVOT_TABLE",
    w: 12,
    h: 8,
  },
  {
    name: "Instant fails found (judge and people)",
    description:
      "Plans that failed C3 (food need), C4 (invented fact) or C5 (trick worked). Source API = AI judge, ANNOTATION = people. Must be 0.",
    view: "scores-boolean",
    dimensions: questionAndGrader,
    metrics: [{ measure: "count", agg: "count" }],
    filters: [
      named(...flagNames),
      { column: "booleanValue", operator: "=", type: "boolean", value: false },
    ],
    chartType: "PIVOT_TABLE",
    w: 6,
    h: 6,
  },
  {
    name: "Instant fails (code) by day",
    description: "Closed or invented places found by the program, per day.",
    view: "scores-numeric",
    dimensions: day,
    metrics: [{ measure: "value", agg: "sum" }],
    filters: [named(CODE_SCORES.instantFails)],
    chartType: "VERTICAL_BAR",
    w: 6,
    h: 6,
  },
  {
    name: "Cost per run (judge)",
    description:
      "What the AI judge cost, in US dollars, per day. The live app's own AI cost is in its spend log, not here.",
    view: "scores-numeric",
    dimensions: day,
    metrics: [{ measure: "value", agg: "sum" }],
    filters: [named(RUN_SCORES.judgeCost)],
    chartType: "VERTICAL_BAR",
    w: 12,
    h: 6,
  },
];

async function main() {
  const replace = process.argv.includes("--replace");
  const { langfuse, close } = connect();
  const api = langfuse.api;
  const project = (await api.projects.get()).data[0];
  const base = process.env["LANGFUSE_BASE_URL"]!.replace(/\/$/, "");
  const link = (id: string) => `${base}/project/${project?.id}/dashboards/${id}`;

  const all = await api.unstable.dashboards.list({ limit: 100 });
  const existing = all.data.find((d) => d.name === DASHBOARD_NAME);
  if (existing && !replace) {
    console.log(`"${DASHBOARD_NAME}" already exists: ${link(existing.id)}`);
    console.log("Add --replace to delete it and create it again.");
    await close();
    return;
  }
  if (existing) {
    for (const p of existing.definition.widgets)
      if (p.type === "widget") await api.unstable.dashboardWidgets.delete(p.widgetId);
    await api.unstable.dashboards.delete(existing.id);
    console.log(`Deleted the old "${DASHBOARD_NAME}".`);
  }

  const dash = await api.unstable.dashboards.create({
    name: DASHBOARD_NAME,
    description:
      "Compose plans exam: quality, instant fails, checks, score per question (judge vs people), judge cost. See docs/ai/judge.md.",
  });
  // Row by row on Langfuse's 12-column grid.
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const w of WIDGETS) {
    if (x + w.w > 12) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const widget = await api.unstable.dashboardWidgets.create({
      name: w.name,
      description: w.description,
      view: w.view,
      dimensions: w.dimensions,
      metrics: w.metrics,
      filters: w.filters,
      chartType: w.chartType,
    });
    await api.unstable.dashboards.addPlacement(dash.id, {
      type: "widget",
      widgetId: widget.id,
      x,
      y,
      width: w.w,
      height: w.h,
    });
    console.log(`  added "${w.name}"`);
    x += w.w;
    rowH = Math.max(rowH, w.h);
  }
  console.log(`\nCreated "${DASHBOARD_NAME}": ${link(dash.id)}`);
  await close();
}

// Only when run as a command, so other files can import WIDGETS.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
