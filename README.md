# Yalla

Say what you feel like doing this weekend, get 3 ready plans in 5 seconds, share with your friends.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
- [Roadmap](roadmap.md)
- [AI at Yalla](docs/ai/README.md): how we build AI features (playbook), a review of the current AI, and the data / recommendations plan

## Logging and shared limits

Every Claude call and every meaningful user action is recorded, so we can measure quality and cost (the numbers in [PRD section 4](docs/PRD.md#4-success-metrics)) and build the AI exam from real requests.

| Log        | What one row is                                                                                     | Written by                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ai_calls` | One Claude call: feature, model, tokens, estimated cost, time, success, the structured answer       | `src/lib/ai.server.ts` (every call goes through `askJSON`)                     |
| `events`   | One product event: plans generated / shown / picked, stop swapped / removed / added, plan shared... | server: `src/lib/plans.functions.ts`; browser: `track()` in `src/lib/track.ts` |

The same database also holds the **rate limits** and the **Google search and Instagram caches**, so they are shared by every server instance and survive restarts.

**Turn it on (once):**

1. Create a Postgres database on Supabase (or Lovable Cloud, which is Supabase).
2. Run [`supabase/migrations/20261113000000_logging_and_shared_state.sql`](supabase/migrations/20261113000000_logging_and_shared_state.sql) in its SQL editor. It creates the tables, the rate-limit function and two views, `plan_runs` and `daily_metrics`, and locks them so the public key can't read them. Then run [`supabase/migrations/20261118000000_daily_spend.sql`](supabase/migrations/20261118000000_daily_spend.sql) for the daily spending cap.
3. Add two **server** secrets where the app is hosted: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key to the browser.
4. Open `/status`: the "Database for logs, limits and cache" row should be green.

Until then the app works as before: log rows go to the server log as one JSON line each (`{"log":"ai_calls",...}`), and limits and caches stay in each server's memory.

**Read the numbers:** `select * from daily_metrics;` for the PRD metrics per day, `select * from plan_runs order by created_at desc limit 50;` for single requests with their cost and what the user did.

## Planner switches

Day-out plans are composed as described in [docs/ai/compose-plans.md](docs/ai/compose-plans.md): code builds valid routes, Claude Sonnet 5.5 chooses 3, Claude Haiku 5.5 writes the words, code checks. Trips use the earlier single-call planner.

| Server variable                                      | Default         | What it does                                                                                                                                                    |
| ---------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YALLA_AI_OFF`                                       | off             | `1` stops every AI call at once; day-out plans keep working with plain text (the emergency off switch)                                                          |
| `YALLA_FREE_PER_DAY`                                 | `2`             | Free plans per browser per day. `0` turns the free limits off (tests)                                                                                           |
| `YALLA_FREE_PER_MONTH`                               | `5`             | Free plans per browser per 30 days                                                                                                                              |
| `YALLA_DAILY_CAP_USD`                                | `20`            | Daily AI spend cap (needs the database). Alerts at 50% and 80% are a `spend_alert` event and a server log line; at 100% plans use plain text until midnight UTC |
| `YALLA_CHOOSE_TIMEOUT_MS` / `YALLA_WRITE_TIMEOUT_MS` | `6000` / `9000` | Time limits for the two AI requests before the plain-text fallback                                                                                              |

The exam for this feature: `evals/compose/` (see Step 9 in the doc).

**Privacy:** no names, accounts or raw IPs are stored (rate limits use a hash of the IP). The browser gets a random device id. The text people type is kept for building the AI exam.

## Tests and the AI exam

```sh
npm test          # unit tests (opening hours, Swap/Add rules, page states, exam marker, database client)
npm run eval      # the parser exam: scores request understanding against evals/parser.golden.json
npm run typecheck
npm run lint
```

`npm run eval` prints the pass rate per check and per language, lists every failed item, and fails if the score drops below the floor in `evals/baseline.json`. Today it scores the keyword matching the app uses now (the baseline the AI parser must beat). After an improvement, raise the floor with `npm run eval -- --update-baseline`. Browser tests: [tests/README.md](tests/README.md). All of these run on every push and pull request (`.github/workflows/ci.yml`).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8bdca3a2-4a9a-4972-96e8-d74cac6d850a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
