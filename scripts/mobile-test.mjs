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

  // Forms open as bottom sheets: the Save/Add footer must be on screen and
  // date/month pickers must stay inside the form (iPhone: Add Member had no
  // reachable Add button and its date fields stuck out).
  const checkSheet = async (path, buttonText) => {
    await go(path);
    await page.evaluate((t) => [...document.querySelectorAll(".content button")].find((b) => b.innerText.trim() === t).click(), buttonText);
    await sleep(400);
    const r = await page.evaluate(() => {
      const m = document.querySelector(".modal");
      if (!m) return null;
      const body = m.querySelector(".modal-body").getBoundingClientRect();
      const btns = [...m.querySelectorAll(".modal-foot button")].map((b) => b.getBoundingClientRect());
      const dates = [...m.querySelectorAll('input[type="date"], input[type="month"]')].map((i) => i.getBoundingClientRect());
      return {
        vh: innerHeight,
        top: m.getBoundingClientRect().top,
        footBottom: Math.max(...btns.map((b) => b.bottom)),
        nBtns: btns.length,
        datesInside: dates.every((d) => d.left >= body.left - 0.5 && d.right <= body.right + 0.5),
        nDates: dates.length,
        noSideways: m.querySelector(".modal-body").scrollWidth <= m.querySelector(".modal-body").clientWidth,
      };
    });
    const label = `${path} "${buttonText}" sheet`;
    if (!r) return ok(`${label} opens`, false);
    ok(`${label}: Save/Cancel buttons on screen`, r.nBtns > 0 && r.footBottom <= r.vh && r.top >= 0, JSON.stringify(r));
    ok(`${label}: date fields stay inside the form`, r.nDates > 0 && r.datesInside && r.noSideways, JSON.stringify(r));
    // iPhone: visible area is shorter than 100vh (toolbars, keyboard). The
    // sheet must follow the visible area that <Modal> reads from visualViewport.
    const covered = await page.evaluate(() => {
      const visible = innerHeight - 150;
      document.querySelector(".modal-overlay").style.setProperty("--vvh", `${visible}px`);
      const btns = [...document.querySelectorAll(".modal-foot button")].map((b) => b.getBoundingClientRect());
      return { visible, footBottom: Math.max(...btns.map((b) => b.bottom)), top: document.querySelector(".modal").getBoundingClientRect().top };
    });
    ok(`${label}: buttons stay above a 150px browser toolbar`, covered.footBottom <= covered.visible && covered.top >= 0, JSON.stringify(covered));
    await page.keyboard.press("Escape");
    await sleep(200);
  };
  await checkSheet("/members", "Add member");
  await checkSheet("/loans", "Create loan");
  await checkSheet("/ledger", "Record transaction");
  // Short screen (browser bars showing, or keyboard up): footer still visible
  await page.setViewport({ width: 360, height: 520, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await checkSheet("/members", "Add member");
  await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  // Toasts use the screen width instead of wrapping into a narrow column
  await go("/year-end");
  const canAllocate = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".content button")].find((x) => x.innerText.includes("Save allocation") && !x.disabled);
    if (b) b.click();
    return !!b;
  });
  ok("Year End has an allocation to save (for the toast check)", canAllocate);
  if (canAllocate) {
    await sleep(250);
    await page.evaluate(() => [...document.querySelectorAll(".modal-foot button")].pop().click());
    await sleep(300);
    const t = await page.$eval(".toast", (n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, h: r.height, vw: innerWidth }; });
    ok("toast is on screen and not squeezed", t.left >= 0 && t.right <= t.vw && t.right - t.left > t.vw * 0.6, JSON.stringify(t));
  }


  // Kopri menu → Manage Kopris: the sheet stays inside the screen and every
  // row's Switch / Rename / Reset / Delete is reachable with a finger.
  await go("/");
  await page.click(".kopri-switch-btn");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll(".kopri-switch-menu button")].find((b) => b.innerText.includes("New Kopri")).click());
  await sleep(300);
  await page.type(".modal input", "Second Kopri");
  await page.evaluate(() => [...document.querySelectorAll(".modal-foot button")].pop().click());
  await sleep(300);
  await page.click(".kopri-switch-btn");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll(".kopri-switch-menu button")].find((b) => b.innerText.includes("Manage")).click());
  await sleep(300);
  const manage = await page.evaluate(() => {
    const m = document.querySelector(".modal").getBoundingClientRect();
    const btns = [...document.querySelectorAll(".modal .kopri-row button")].map((b) => b.getBoundingClientRect());
    return {
      vw: innerWidth,
      left: m.left,
      right: m.right,
      offscreen: btns.filter((b) => b.right > innerWidth || b.left < 0).length,
      tiny: btns.filter((b) => b.height < 36 || b.width < 36).length,
    };
  });
  ok("Manage Kopris fits the screen", manage.left >= 0 && manage.right <= manage.vw, JSON.stringify(manage));
  ok("Manage Kopris buttons are on screen and finger-sized", manage.offscreen === 0 && manage.tiny === 0, JSON.stringify(manage));

  // Stacked popups: closing the top one keeps the page locked and Escape
  // closes one popup at a time.
  await page.evaluate(() => document.querySelector('.modal button[title="Delete Kopri"]').click());
  await sleep(250);
  ok("Delete opens on top of Manage Kopris", (await page.$$(".modal")).length === 2);
  await page.keyboard.press("Escape");
  await sleep(200);
  const afterEsc = await page.evaluate(() => ({ modals: document.querySelectorAll(".modal").length, locked: getComputedStyle(document.body).overflow === "hidden" }));
  ok("Escape closes only the top popup and the page stays locked", afterEsc.modals === 1 && afterEsc.locked, JSON.stringify(afterEsc));
  await page.keyboard.press("Escape");
  await sleep(200);
  ok("page unlocks once the last popup closes", await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden"));

  // Kopri menu closes when tapping elsewhere (iPhone sends no mousedown for plain content)
  await page.click(".kopri-switch-btn");
  await sleep(200);
  await page.touchscreen.tap(180, 500);
  await sleep(200);
  ok("Kopri menu closes on a tap outside", !(await page.$(".kopri-switch-menu")));

  ok("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}

if (failures) {
  console.log(`\n${failures} MOBILE TEST(S) FAILED`);
  process.exit(1);
}
console.log("\nALL MOBILE TESTS PASSED");
