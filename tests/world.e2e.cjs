const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ok = (n, c) => console.log(c ? "PASS" : "FAIL", n);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 24.7, longitude: 46.7 },
    permissions: ["geolocation"],
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Lebanon.*change/ }).click();
  await p.getByPlaceholder(/Search any city/).fill("Riyadh");
  await p.getByRole("button", { name: "Riyadh, Saudi Arabia" }).first().waitFor({ timeout: 5000 });
  await p.getByRole("button", { name: "Riyadh, Saudi Arabia" }).first().click();
  ok(
    "city chosen",
    (await p.getByRole("button", { name: /Riyadh, Saudi Arabia.*change/ }).count()) === 1,
  );
  ok(
    "Lebanese chips hidden",
    (await p.getByRole("button", { name: "Batroun", exact: true }).count()) === 0,
  );
  ok("Friday weekend", (await p.getByRole("button", { name: "Friday" }).count()) === 1);
  ok(
    "no Douma quick chip",
    (await p.getByRole("button", { name: "Douma road trip" }).count()) === 0,
  );
  await p.screenshot({ path: "/tmp/claude-0/riyadh-home.png" });
  await p.getByRole("button", { name: "Give me 3 plans" }).click();
  await p.waitForSelector("article", { timeout: 30000 });
  const txt = await p.locator("main").innerText();
  ok("plans are in Riyadh", /Riyadh/.test(txt) && !/Lebanon|Beirut|Batroun/.test(txt));
  await p.screenshot({ path: "/tmp/claude-0/riyadh-plans.png" });
  // remembered after reload + use my location
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  ok(
    "city remembered",
    (await p.getByRole("button", { name: /Riyadh, Saudi Arabia.*change/ }).count()) === 1,
  );
  await p.getByRole("button", { name: /change/ }).click();
  await p.getByRole("button", { name: "Lebanon", exact: true }).click();
  ok(
    "back to Lebanon chips",
    (await p.getByRole("button", { name: "Batroun", exact: true }).count()) === 1,
  );
  await p.getByRole("button", { name: /change/ }).click();
  await p.getByRole("button", { name: /Use my location/ }).click();
  await p
    .getByRole("button", { name: /Riyadh, Saudi Arabia.*change/ })
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  ok(
    "use my location",
    (await p.getByRole("button", { name: /Riyadh, Saudi Arabia.*change/ }).count()) === 1,
  );
  // profile page
  await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
  ok(
    "profile home city",
    (await p.getByText("Home city").count()) === 1 &&
      (await p.getByRole("button", { name: /Riyadh, Saudi Arabia.*change/ }).count()) === 1,
  );
  await p.getByRole("button", { name: /change/ }).click();
  await p.getByPlaceholder(/Search any city/).fill("Dubai");
  await p.getByRole("button", { name: "Dubai, United Arab Emirates" }).click();
  await p.getByRole("button", { name: /Save/ }).last().click();
  await p.waitForURL(BASE + "/");
  ok(
    "profile city used on home",
    (await p.getByRole("button", { name: /Dubai.*change/ }).count()) === 1,
  );
  await p.getByRole("button", { name: "Give me 3 plans" }).waitFor();
  ok(
    "UAE weekend Sat/Sun",
    (await p.getByRole("button", { name: "Sunday", exact: true }).count()) === 1,
  );
  ok("no browser errors", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
