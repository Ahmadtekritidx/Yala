# Tests

Browser test of every flow (home, profile, plans, edit, shuffle, share, status) with Google Places and Claude simulated, so it runs without real keys. The mock fails if any Lovable service is called.

```bash
# 1. start the app with the fake Google + AI
ANTHROPIC_API_KEY=sk-ant-test GOOGLE_PLACES_API_KEY=g-test NODE_OPTIONS="--import ./tests/mock.mjs" npx vite dev --port 5173 --host 127.0.0.1
# 2. in another terminal (needs playwright installed)
node tests/e2e.mjs
# any city outside Lebanon (Riyadh, Dubai, use my location, profile home city)
node tests/world.e2e.cjs
# Istanbul 3-day trip, then a Lebanon weekend
node tests/trip.e2e.cjs
# opening-hours parser
bun tests/hours.test.ts
# the /plans page state machine (loading/failed/ready, edit mode, undo, stale answers)
node --experimental-strip-types tests/plans-state.test.ts
# Swap / Add candidates: open at that time, not avoided, within budget, matching the diet
node --experimental-strip-types tests/alternatives.test.ts
```

UI state that has more than two states lives in one explicit machine, not in loose `useState` flags:
the plans page in `src/lib/plans-state.ts` (a pure reducer, unit tested above), and the city and hotel
search boxes in `src/hooks/use-debounced-search.ts`. Add new states there, not as another flag.

Add `MOCK_GOOGLE_FAIL=1` to step 1 to simulate a broken Google key: plans must still appear (built-in places) and `/status` must show the error.

For the real Google check, open `/status` on the live app.
