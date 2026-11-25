# The quality judge: AI judge, human graders, one dashboard

**Why:** the code checks (part A) tell us a plan is _valid_. They can't tell us it is _good_: does "chill" feel chill, is the text warm, are the 3 plans really different? This system answers that question on every exam run, with numbers we can trust.

**How:** three graders score the same plans, and Langfuse shows them side by side.

```
  Exam tests (evals/compose/tests.json)
          │  plans from saved runs (free) or the live app (paid)
          ▼
  npm run judge ─────────────────────────────────────────────┐
     ├─ Code checks   A1-A12, C1-C2   exact, free            │
     ├─ AI judge      B1-B7, C3-C5    Opus, one question/call│
     └─ (optional) add each test to the human queue          │
          ▼                                                  │
  LANGFUSE (the admin dashboard)  ◄──────────────────────────┘
     • one trace per test: request in, readable plans out
     • scores from code, the AI judge and people, same names
     • human queue "Plan quality (humans)" for Ahmad and Youssef
     • experiments: compare runs (prompt, model, planner version)
          ▼
  npm run judge:agree   →  does the judge grade like our people?
```

The judge only counts on its own **after calibration** shows it agrees with people. Until then, people's grades are the truth.

---

## One-time setup (about 15 minutes)

1. **Langfuse account.** Sign up at Langfuse Cloud. Our project is in the **US region** (`us.cloud.langfuse.com`); the code defaults to EU (`cloud.langfuse.com`), so always set `LANGFUSE_BASE_URL`. Free tier is enough to start.
2. **Project.** Create a project called `yalla`. In _Settings → API keys_, create a key pair.
3. **Invite graders.** _Settings → Members_: invite Youssef. Annotation is available to members.
4. **Keys on your computer** (never in code, never in git). In your shell, or a local `.env` you don't commit:

   ```bash
   export LANGFUSE_PUBLIC_KEY=pk-lf-...
   export LANGFUSE_SECRET_KEY=sk-lf-...
   export LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
   export YALLA_JUDGE_API_KEY=sk-ant-... # the judge's key (ANTHROPIC_API_KEY also works locally)
   ```

5. **Create everything in Langfuse:**

   ```bash
   npm install
   npm run judge:setup
   ```

   This creates the score configs (the rubric questions with their 1/3/5 anchors, plus the code scores), the human queue, and the two datasets (`compose-plans` with the 22 tests, `parser` with the 32 parser items). Safe to re-run: it never deletes, and re-syncs the datasets after you edit the test files.

6. **Dashboards:** `npm run judge:dashboard` creates the Langfuse dashboard (`--replace` rebuilds it). For the admin page in the app, see "Dashboards" below.

---

## Every exam

**Key check first.** If `YALLA_JUDGE_API_KEY` was copied from a screen that hides keys (`sk-ant-•••`), every judge call fails. `npm run judge` now stops before spending anything when the key holds such characters, and prints a loud warning when judge calls fail for any other reason.

| Command                                                 | What it does                                                           | Cost                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `npm run judge -- --source saved`                       | Grades the latest saved answers (from `run-live.ts`) with code + judge | Judge only, about $2 to $4 per run |
| `npm run judge -- --source live --confirm`              | Asks the live app for new plans first, then grades                     | Plus up to ~80 cents per test      |
| `npm run judge -- --source saved --offline`             | Same, without Langfuse: prints and saves locally                       | Judge only                         |
| `npm run judge -- --source saved --no-judge`            | Code checks only                                                       | Free                               |
| `npm run judge -- --source saved --ids 1,9,15`          | Only some tests                                                        |                                    |
| `npm run judge -- --source live --confirm --name "..."` | Labels the run in the dashboard, e.g. "Write on Sonnet"                |                                    |
| `npm run judge -- --source saved --queue`               | Also adds every graded test to the human queue                         |                                    |

Every run prints the result and saves `evals/compose/runs/<time>-judge/judgments.json` (not committed). In Langfuse: _Datasets → compose-plans → Experiments_ shows each run with its scores; click a test to see the plans and every score with its reason.

**Passing grade** (`evals/compose/rubric.ts`, `PASS`): instant fails 0 · quality average at least 4 · no test below 3 · code checks 100%.

---

## Human grading

Ahmad and Youssef grade in Langfuse: _Annotation queues → Plan quality (humans)_. Each item shows the request and the 3 plans; the form shows every rubric question with its description.

Three rules make human grades worth something:

1. **Alone.** Don't discuss a plan before both have graded it.
2. **Blind.** Grade before looking at the AI judge's scores. For calibration runs, use `--hold-judge` (below) so the judge's scores are not in Langfuse yet.
3. **By the rubric, not by feeling.** Read the 5/3/1 description for each question. If the description doesn't fit the plan, write a comment: that is a rubric problem, and the most useful thing you can find.

Questions that don't apply to a test (B5 without saved places, B7 without visitors, C3 without food needs, C5 without a trick) can be left empty.

---

## Calibrate: can we trust the judge?

Do this once now, and again whenever the rubric or the judge prompt changes.

1. **Run blind:**

   ```bash
   npm run judge -- --source saved --hold-judge --queue
   ```

   The judge grades, but its scores stay on your computer. Every test goes to the human queue.

   The console shows code checks only: the person running it may be a grader. If judge calls failed (wrong key, outage), re-ask only those questions on the **same plans and traces**, so people's grades still line up:

   ```bash
   npm run judge:rejudge -- evals/compose/runs/<time>-judge/
   ```

   It prints counts, never scores, and keeps a copy of the previous file.

2. **People grade** the whole queue, alone (about 1 to 2 minutes per test).
3. **Compare:**

   ```bash
   npm run judge:agree -- --push evals/compose/runs/<time>-judge/
   ```

   `--push` sends the held judge scores to Langfuse, then prints, per question:

   | Column        | Meaning                                                    |
   | ------------- | ---------------------------------------------------------- |
   | judge~people  | Share of tests where the judge is within 1 of people       |
   | bias          | Judge minus people on average. + means the judge is kinder |
   | people~people | Ahmad vs Youssef. If this is low, the question is unclear  |
   | verdict       | trusted · FIX RUBRIC · need more pairs                     |

4. **The bar** (`CALIBRATION` in `evals/compose/agreement.ts`): at least 5 graded tests per question; within 1 point of people at least 80% of the time; for instant fails, at least 80% the same verdict and **never** a missed real fail.
5. **Fix and repeat.** Read the "biggest disagreements" list. Usually the fix is a sharper anchor in `evals/compose/rubric.ts` (bump `RUBRIC_VERSION`), sometimes the judge prompt in `judge.ts` (bump `JUDGE_PROMPT_VERSION`). Re-run step 1 and compare again.

When every question is trusted, the judge grades exam runs alone. Keep people spot-checking about 10% of tests each week; any new disagreement becomes a rubric fix or a new test.

---

## Dashboards

**Langfuse dashboard "Yalla plan quality"** (`npm run judge:dashboard`): quality avg, instant fails, checks passed, score per question (judge vs people, by grader), judge cost. Langfuse score charts group by day, score name and grader, not by run; with one exam run a day, by day reads as by run. Run-level scores have their own names (`Run - judge cost (USD)`, `Run - tests below 3`; Langfuse refuses colons in score names) so a chart never adds them to the per-test scores.

**Admin page in the app: `/admin`.** The same numbers, exactly per run: a table of runs, and judge vs people per question for any run, with gaps over 1 point in red. Every score `npm run judge` writes carries the run's name (`metadata.run`); people's grades join their run through the trace. Runs from before this have no name and show as "Unnamed run" with their date; the calibration run gets its name when its judge scores are pushed.

The page asks for an admin key. On the server (Vercel project settings, Environment Variables), set:

| Setting               | Value                                          |
| --------------------- | ---------------------------------------------- |
| `YALLA_ADMIN_KEY`     | A long random secret, shared with Youssef only |
| `LANGFUSE_PUBLIC_KEY` | Same as on your computer                       |
| `LANGFUSE_SECRET_KEY` | Same as on your computer                       |
| `LANGFUSE_BASE_URL`   | `https://us.cloud.langfuse.com`                |

Without them the page says which are missing. 60 requests an hour per visitor; the key is remembered on that device after the first time, until "Sign out". Exam data only, as below.

Note: Langfuse Cloud removed its v3 APIs on November 19, 2026 (for example `GET /api/public/datasets/<name>/runs`). The page reads `GET /api/public/v3/scores`, which is current.

## The rubric

Source of truth: `evals/compose/rubric.ts`. The judge's prompt and the Langfuse score configs are both generated from it, so they can't drift apart.

| Code | Question                                           | Type   | Applies to              |
| ---- | -------------------------------------------------- | ------ | ----------------------- |
| B1   | Fits the request (chill feels chill)               | 1 to 5 | every test              |
| B2   | Fits the group and budget                          | 1 to 5 | every test              |
| B3   | The plans are really different                     | 1 to 5 | every test              |
| B4   | Text short, warm, local                            | 1 to 5 | every test              |
| B5   | Mentions why a saved place was saved               | 1 to 5 | tests with saved places |
| B6   | Uses the best places available                     | 1 to 5 | every test              |
| B7   | Must-see icons for visitors                        | 1 to 5 | requests about visitors |
| C3   | No food need broken (vegan, no alcohol...)         | yes/no | tests with food needs   |
| C4   | No invented fact, no place named that isn't a stop | yes/no | every test              |
| C5   | A trick in the request changed nothing             | yes/no | requests with a trick   |

Scores from the program, next to them: **A checks passed** (0 to 1), **Instant fails (code)** (C1 closed place, C2 place that doesn't exist), **Quality avg** (per test).

### How the judge judges

- **Model:** Opus 5.5, medium effort, a stronger model than the planner (Sonnet chooses, Haiku writes). Change with `YALLA_JUDGE_MODEL` / `YALLA_JUDGE_EFFORT` and re-calibrate.
- **One question per call,** reason first, then the score, as JSON checked by Zod. A malformed answer leaves the question ungraded; it is never guessed.
- **Sees:** the request as understood, the user's own words (marked as data), the plans with each stop's facts (name, type, area, price, rating, note), saved places. For B6 only, the strongest places that were available but not used.
- **Never sees:** the answer key (`mustInclude`, drive limits), the code checks, other graders' scores.

---

## Privacy

Today only **exam data** goes to Langfuse: test requests we wrote and frozen place data. No customer requests, no names, no device ids. Sending real customer traffic is a later, separate step (below) that first needs privacy-policy wording and a retention limit.

---

## Files

| File                           | What it is                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| `evals/compose/rubric.ts`      | The questions, anchors, which tests they apply to, the passing grade     |
| `evals/compose/judge.ts`       | The AI judge: what it sees, one call per question, scores and cost       |
| `evals/compose/experiment.ts`  | `npm run judge`: plans → code checks → judge → Langfuse experiment       |
| `evals/compose/agreement.ts`   | `npm run judge:agree`: judge vs people, per question                     |
| `evals/compose/answers.ts`     | Plans from the live app or saved runs (shared with run-live and regrade) |
| `evals/langfuse/client.ts`     | The one door to Langfuse: keys, score configs, queue, datasets           |
| `evals/langfuse/setup.ts`      | `npm run judge:setup`                                                    |
| `evals/compose/judgments.ts`   | Reading and summarizing a run's judgments.json (rejudge, agree)          |
| `evals/compose/rejudge.ts`     | `npm run judge:rejudge`: re-ask failed judge questions of a held run     |
| `evals/langfuse/dashboard.ts`  | `npm run judge:dashboard`: the Langfuse dashboard                        |
| `src/routes/admin.tsx`         | The admin page `/admin` (with `src/lib/admin.*.ts`, `quality-report.ts`) |
| `tests/compose-judge.test.ts`  | The judge's plumbing, with a fake AI (part of `npm test`)                |
| `tests/quality-report.test.ts` | The admin report's grouping by run (part of `npm test`)                  |

Langfuse packages are dev dependencies: they are not in the app bundle.

---

## Next phases

| Phase | What                                                                                                                                                                                    | Needs                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Now   | Setup, first blind calibration, fix the rubric until trusted                                                                                                                            | Langfuse keys, Ahmad and Youssef's time |
| 6     | Trace a sample of real plan requests from the app; the judge grades them daily                                                                                                          | Privacy wording, retention limit        |
| 7     | Real requests that went wrong (swapped, removed, regenerated, low score) go to a weekly review queue; the good ones are frozen, cleaned of personal details and added to the golden set | Phase 6                                 |
