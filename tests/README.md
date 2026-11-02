# Tests

Browser test of every flow (home, profile, plans, edit, shuffle, share, status) with Google Places and Claude simulated, so it runs without real keys. The mock fails if any Lovable service is called.

```bash
# 1. start the app with the fake Google + AI
ANTHROPIC_API_KEY=sk-ant-test GOOGLE_PLACES_API_KEY=g-test NODE_OPTIONS="--import ./tests/mock.mjs" npx vite dev --port 5173 --host 127.0.0.1
# 2. in another terminal (needs playwright installed)
node tests/e2e.mjs
# any city outside Lebanon (Riyadh, Dubai, use my location, profile home city)
node tests/world.e2e.cjs
# opening-hours parser
bun tests/hours.test.ts
```

Add `MOCK_GOOGLE_FAIL=1` to step 1 to simulate a broken Google key: plans must still appear (built-in places) and `/status` must show the error.

For the real Google check, open `/status` on the live app.
