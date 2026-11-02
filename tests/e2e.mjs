import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const B = "http://127.0.0.1:5173";
const res = []; const ok = (n, c, d = "") => { res.push([c ? "PASS" : "FAIL", n, d]); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const vis = (l, t = 15000) => l.first().waitFor({ timeout: t }).then(() => true).catch(() => false);
const shot = (n) => page.screenshot({ path: `${process.env.SHOTS || "/tmp"}/${n}.png`, fullPage: true });

// 1. Home
await page.goto(B + "/"); await page.waitForLoadState("networkidle");
ok("home loads", await page.getByText("What are we doing").isVisible());
ok("profile link on home", await page.getByRole("link", { name: "Profile" }).isVisible());
await shot("01-home");

// 2. Profile
await page.getByRole("link", { name: "Set your preferences" }).click();
await page.waitForURL("**/profile");
await page.fill("#name", "Ahmad");
for (const l of ["Batroun", "Small group (4)", "$$ Mid", "Packed (3 to 4 stops)", "45 min", "Vegetarian", "Something new", "Hike"]) await page.getByRole("button", { name: l, exact: true }).click();
await shot("02-profile");
await page.getByRole("button", { name: "Save preferences" }).click();
await page.waitForURL(B + "/");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("yalla:profile")));
ok("profile saved", saved?.name === "Ahmad" && saved.people === "4" && saved.budget === 2 && saved.diet.includes("Vegetarian") && saved.avoid.includes("Hike"), JSON.stringify(saved));
ok("home greets by name", await page.getByRole("link", { name: "Hi Ahmad" }).isVisible());
ok("home shows profile summary", await page.getByText("4 people · $$ max").isVisible());
ok("home area preselected", (await page.getByRole("button", { name: "Batroun", exact: true }).getAttribute("aria-pressed")) === "true");
await shot("03-home-profile");

// 3. Generate plans
await page.fill("input[placeholder^='Or type']", "Italian lunch then coffee");
await page.getByRole("button", { name: "Give me 3 plans" }).click();
await page.waitForURL("**/plans**");
const url = new URL(page.url());
ok("profile passed to plans", url.searchParams.get("people").replaceAll('"', "") === "4" && url.searchParams.get("budget").replaceAll('"', "") === "2" && url.searchParams.get("drive").replaceAll('"', "") === "45" && url.searchParams.get("pace") === "Packed" && url.searchParams.get("avoid") === "Hike", url.search);
await page.waitForSelector("article", { timeout: 20000 }).catch(() => {});
const n = await page.locator("article").count();
ok("3 plans render", n === 3, `got ${n}; error: ${await page.locator("text=Ya jama3a").count()}`);
ok("live Google places shown", (await page.getByText("live on Google").count()) > 0);
ok("opening hours shown", (await page.getByText(/^Open Saturday:/).count()) > 0);
ok("no stop scheduled while closed", (await page.getByText(/Closed at this time/).count()) === 0);
await shot("04-plans");

// 4. Remove + undo, add, swap
const first = page.locator("article").first();
const before = await first.locator("ol > li").count();
await first.getByRole("button", { name: "Remove" }).first().click();
ok("remove a stop", (await first.locator("ol > li").count()) === before - 1);
await page.getByRole("button", { name: "Undo" }).click();
ok("undo remove", (await first.locator("ol > li").count()) === before);
await first.getByRole("button", { name: "+ add a stop" }).click();
await first.getByRole("button", { name: "Dessert", exact: true }).click();
const afterAdd = await first.locator("ol > li").count();
ok("add a stop", afterAdd === before + 1 || (await page.getByText(/No dessert spot/).count()) > 0, `${before} -> ${afterAdd}`);
const times = await first.locator("ol > li p.font-display").allInnerTexts();
const mins = times.map((t) => { const m = t.match(/(\d+)(?::(\d+))?(am|pm)/); let h = +m[1] % 12; if (m[3] === "pm") h += 12; return h * 60 + +(m[2] || 0); });
ok("times always increase after edits", mins.every((v, i) => i === 0 || v > mins[i - 1]), times.join(" "));
const name0 = await first.locator("ol > li").first().locator('p[class="font-bold"]').first().innerText();
await first.getByRole("button", { name: "Swap" }).first().click();
const alt = page.locator("div.fixed button.block").first();
if (await alt.count()) { await alt.click(); const name1 = await first.locator("ol > li").first().locator('p[class="font-bold"]').first().innerText(); ok("swap a stop", name1 !== name0, `${name0} -> ${name1}`); }
else { ok("swap sheet opens", await page.getByText(/This one's a keeper/).isVisible()); await page.mouse.click(10, 10); }
const edited = await first.locator("ol > li p.font-bold").allInnerTexts();

// 5. Shuffle twice (old 1-per-hour limit broke this)
await page.getByRole("button", { name: "Shuffle all" }).click();
await page.waitForTimeout(300); await page.waitForSelector("article", { timeout: 20000 }).catch(() => {});
ok("shuffle works", (await page.locator("article").count()) === 3, (await page.locator("main").innerText()).slice(0, 200));
await page.getByRole("button", { name: "Shuffle all" }).click();
await page.waitForTimeout(300); await page.waitForSelector("article", { timeout: 20000 }).catch(() => {});
ok("shuffle again works", (await page.locator("article").count()) === 3);

// 6. Edit, pick, share page, edit plan returns the same edited plans
const p0 = page.locator("article").first();
await p0.getByRole("button", { name: "Remove" }).last().click();
const keep = await p0.locator('ol > li p[class="font-bold"]').allInnerTexts();
await p0.getByRole("button", { name: "Pick this plan" }).click();
await page.waitForURL("**/p/**");
ok("share page loads", await vis(page.getByRole("link", { name: "Open full route in Maps" })));
await vis(page.locator("ol > li"));
ok("share page has all stops", (await page.locator("ol > li").count()) === keep.length);
ok("WhatsApp link has the plan url", (await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).includes(encodeURIComponent("/p/")));
await shot("05-share");
const shareUrl = page.url();
await page.getByRole("button", { name: "Edit plan" }).click();
await page.waitForURL("**/plans**"); await page.waitForSelector("article", { timeout: 20000 }).catch(() => {});
const back = await page.locator("article").first().locator('ol > li p[class="font-bold"]').allInnerTexts();
ok("edit plan keeps the edited plans", JSON.stringify(back) === JSON.stringify(keep), `${keep} vs ${back}`);

// 7. Share link on a fresh device
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage(); await p2.goto(shareUrl); await p2.waitForLoadState("networkidle"); await vis(p2.locator("ol > li"));
ok("shared link opens on another device", (await p2.locator("ol > li").count()) === keep.length);
await p2.goto(B + "/p/garbage"); ok("broken link handled", await p2.getByText("This plan got lost").isVisible());

// 8. Loved plans + recent
await page.goto(B + "/"); await page.waitForLoadState("networkidle");
ok("recent plans list", (await page.locator("section:has-text('Recent plans') li").count()) >= 1);
await page.getByRole("button", { name: /Batroun slow Sunday/ }).click(); await page.waitForURL("**/p/**"); await vis(page.locator("ol > li"));
ok("loved plan opens", (await page.locator("ol > li").count()) === 4);

// 9. Quick buttons, status page, profile reset
await page.goto(B + "/"); await page.getByRole("button", { name: "Sunday hike" }).click(); await page.waitForURL("**/plans**");
await vis(page.locator("article"), 20000);
ok("quick button gives plans", (await page.locator("article").count()) >= 1, (await page.locator("main").innerText()).slice(0, 160));
ok("avoid Hike respected", (await page.locator("article").getByText(/^Hike$/).count()) === 0);
await page.goto(B + "/status"); await vis(page.getByText(/coffee shops in Beirut|returned no places|Missing/));
ok("status page runs live search", (await page.getByText(/coffee shops in Beirut/).count()) === 1, (await page.locator("main").innerText()).slice(0, 300));
await shot("06-status");
await page.goto(B + "/profile"); await page.waitForLoadState("networkidle"); await vis(page.locator("#name[value='Ahmad']")); await page.getByRole("button", { name: "Reset" }).click(); await page.waitForTimeout(300);
ok("profile reset", (await page.evaluate(() => JSON.parse(localStorage.getItem("yalla:profile")).name)) === "");

ok("no browser errors", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
for (const r of res) console.log(r.join("  "));
console.log(`${res.filter((r) => r[0] === "PASS").length}/${res.length} passed`);
