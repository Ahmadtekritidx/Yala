// Shared store client (src/lib/store.server.ts) and cost estimates (src/lib/pricing.ts),
// with a fake database: no network, no keys. Run: node --experimental-strip-types tests/store.test.ts
import { costUsd } from "../src/lib/pricing.ts";

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  if (!ok) failures++;
};

// Opus 5.5: $4 in, $20 out per million tokens.
check(
  "cost: 1M in + 100k out on Opus 5.5 = $6",
  costUsd("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e5 }) === 6,
);
check(
  "cost: cache reads at a tenth",
  costUsd("claude-opus-5-5", { cache_read_input_tokens: 1e6 }) === 0.4,
);
check("cost: unknown model is null", costUsd("some-model", { input_tokens: 10 }) === null);

const calls: { url: string; init: RequestInit }[] = [];
let reply: () => Response = () => new Response("[]", { status: 200 });
globalThis.fetch = (async (url: string, init: RequestInit) => {
  calls.push({ url: String(url), init });
  return reply();
}) as typeof fetch;

const store = await import("../src/lib/store.server.ts");

check("off without secrets", !store.storeConfigured());
check(
  "insert is a no-op when off",
  (await store.insertRows("events", [{ a: 1 }])) === false && calls.length === 0,
);
check("kv read is undefined when off", (await store.kvGet("x")) === undefined);

process.env["SUPABASE_URL"] = "https://db.example.supabase.co/";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service-key";
check("on with both secrets", store.storeConfigured());

reply = () => new Response(null, { status: 201 });
check("insert succeeds", await store.insertRows("events", [{ name: "plans_shown" }]));
const ins = calls.at(-1)!;
const headers = ins.init.headers as Record<string, string>;
check(
  "insert goes to the table over REST",
  ins.url === "https://db.example.supabase.co/rest/v1/events",
);
check(
  "insert sends the key in both headers",
  headers["apikey"] === "service-key" && headers["Authorization"] === "Bearer service-key",
);
check("insert asks for no body back", headers["Prefer"] === "return=minimal");

reply = () => new Response("3", { status: 200 });
check(
  "rpc returns the function's answer",
  (await store.rpc<number>("hit_rate_limit", { p_key: "k" })) === 3,
);
check("rpc calls /rpc/<name>", calls.at(-1)!.url.endsWith("/rest/v1/rpc/hit_rate_limit"));

reply = () => new Response(JSON.stringify([{ value: null }]), { status: 200 });
check("kv read returns a cached null as null (not a miss)", (await store.kvGet("ig:x")) === null);
check("kv read filters expired rows", /expires_at=gt\./.test(calls.at(-1)!.url));

reply = () => new Response("[]", { status: 200 });
check("kv miss is undefined", (await store.kvGet("ig:y")) === undefined);

reply = () => new Response("boom", { status: 500 });
check(
  "a failed insert returns false and does not throw",
  (await store.insertRows("events", [{}])) === false,
);
check("the failure is kept for /status", store.storeStatus().lastError.includes("500"));
check(
  "a failed rpc is undefined (callers fall back to memory)",
  (await store.rpc("hit_rate_limit", {})) === undefined,
);

check("sha256 is hex", /^[0-9a-f]{64}$/.test(await store.sha256("1.2.3.4")));

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("all store tests pass");
