// Istanbul for 3 days (one plan per day, no repeats, one share link), then back home for a Lebanon weekend.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";
let fails = 0;
const ok = (n, c) => {
  console.log(c ? "PASS" : "FAIL", n);
  if (!c) fails++;
};
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /change/ }).click();
  await p.getByRole("button", { name: "Istanbul, Türkiye" }).click();
  await p.getByRole("button", { name: "A trip (several days)" }).click();
  await p.locator("#trip-start").fill("2026-11-09"); // a Monday
  await p.getByRole("button", { name: "3 days", exact: true }).click();
  await p.getByLabel("Where are you staying?").fill("Sultanahmet");
  await p.getByRole("button", { name: /Sultanahmet Hotel/ }).click();
  ok("hotel picked", (await p.getByText("Sultanahmet Hotel").count()) === 1);
  if (process.env.SHOT_DIR) await p.screenshot({ path: process.env.SHOT_DIR + "/trip-home.png" });
  await p.getByRole("button", { name: "Plan my 3 days" }).click();
  await p.waitForSelector("article", { timeout: 30000 });
  const cards = p.locator("article");
  ok("3 day plans", (await cards.count()) === 3);
  const all = await cards.allInnerTexts();
  ok(
    "days are dated Mon, Tue, Wed",
    /Monday/.test(all[0]) && /Tuesday/.test(all[1]) && /Wednesday/.test(all[2]),
  );
  const names = (await p.locator('article li p[class="font-bold"]').allInnerTexts()).map((t) =>
    t.replace("♥ your save", "").trim(),
  );
  ok("no place repeated across days", names.length > 6 && new Set(names).size === names.length);
  ok(
    "each day starts and ends at the hotel",
    all.every((t) => /From Sultanahmet Hotel/.test(t) && /back to Sultanahmet Hotel/.test(t)),
  );
  ok(
    "all in Istanbul",
    all.every((t) => /Istanbul/.test(t) && !/Beirut|Lebanon/.test(t)),
  );
  if (process.env.SHOT_DIR) await p.screenshot({ path: process.env.SHOT_DIR + "/trip-plans.png" });
  await cards.first().getByRole("button", { name: "Open the trip" }).click();
  await p.waitForURL(/\/p\//);
  await p.waitForLoadState("networkidle");
  await p.getByRole("tab").first().waitFor();
  ok(
    "shared trip shows the hotel",
    /Starts and ends at\s*Sultanahmet Hotel/i.test(await p.locator("main").innerText()),
  );
  ok("one link, three day tabs", (await p.getByRole("tab").count()) === 3);
  await p.getByRole("tab", { name: /Day 3/ }).click();
  ok("day 3 shows its date", /Wednesday/i.test(await p.locator("main").innerText()));
  // back home: Lebanon weekend in one tap from recent cities
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /change/ }).click();
  ok(
    "Istanbul in recent cities",
    (await p.getByRole("button", { name: /^Istanbul, Türkiye/ }).count()) === 1,
  );
  await p.getByRole("button", { name: "Lebanon", exact: true }).click();
  await p.getByRole("button", { name: "This weekend" }).click();
  await p.getByRole("button", { name: "Batroun", exact: true }).click();
  await p.getByRole("button", { name: "Give me 3 plans" }).click();
  await p.waitForSelector("article", { timeout: 30000 });
  ok("Lebanon weekend: 3 plans", (await p.locator("article").count()) === 3);
  ok("no browser errors", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
