// Phone layout check: every screen fits a 360px phone with no sideways page
// scroll, the bottom tab bar reaches every page (via "More"), detail pages get
// a back button, and the PWA bits (manifest, icons) are wired up.
// Needs the dev server running (npm run dev).
import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
};

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-mobile-profile"),
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const go = async (path) => {
    await page.goto(BASE + path, { waitUntil: "networkidle0" });
    await sleep(400);
  };

  await go("/");
  ok("manifest is linked", await page.$eval('link[rel="manifest"]', (l) => !!l.href));
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  ok("manifest is standalone with 192 and 512 icons", manifest.display === "standalone" && ["192x192", "512x512"].every((s) => manifest.icons.some((i) => i.sizes === s)));
  ok("apple touch icon is linked", !!(await page.$('link[rel="apple-touch-icon"]')));
  ok("tab bar is visible on phones", await page.$eval(".tabbar", (n) => getComputedStyle(n).display !== "none"));
  ok("sidebar is hidden on phones", await page.$eval(".sidebar", (n) => getComputedStyle(n).display === "none"));

  await go("/loans");
  const loanHref = await page.$eval('a[href^="/loans/"]', (a) => a.getAttribute("href"));
  await go("/members");
  const memberHref = await page.$eval('a[href^="/members/"]', (a) => a.getAttribute("href"));

  for (const path of ["/", "/members", "/deposits", "/loans", "/ledger", "/cash-bank", "/year-end", "/reports", "/rules", loanHref, memberHref]) {
    await go(path);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(`${path} fits a 360px screen`, sw <= cw, `page is ${sw}px wide`);
  }

  await go(loanHref);
  ok("detail page shows a back button", !!(await page.$(".topbar-back")));
  await page.click(".topbar-back");
  await sleep(400);
  ok("back button returns to the list", new URL(page.url()).pathname === "/loans", page.url());

  await go("/");
  await page.click(".tabbar button");
  await sleep(300);
  ok("More opens a sheet", !!(await page.$(".sheet")));
  await page.evaluate(() => [...document.querySelectorAll(".sheet-row")].find((a) => a.innerText.includes("Year End")).click());
  await sleep(400);
  ok("More → Year End navigates and closes the sheet", new URL(page.url()).pathname === "/year-end" && !(await page.$(".sheet")));

  ok("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}

if (failures) {
  console.log(`\n${failures} MOBILE TEST(S) FAILED`);
  process.exit(1);
}
console.log("\nALL MOBILE TESTS PASSED");
