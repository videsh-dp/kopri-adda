// Login, manager accounts and the phone layout, end to end in headless Chrome.
// Run with the dev server up:  npm run dev  (then)  npm run test:auth
import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || detail === "" ? "" : `  (${detail})`}`);
  if (!cond) failures++;
};

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-auth-profile"),
});
const errors = [];
let page;
// Headless Chrome stops delivering key events to a tab after some login/logout
// sequences, so each login continues on a fresh tab (the session is in localStorage).
const openPage = async () => {
  const next = await browser.newPage();
  await next.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  next.on("pageerror", (e) => errors.push(String(e)));
  next.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const old = page;
  page = next;
  for (const p of await browser.pages()) if (p !== next) await p.close().catch(() => {});
  void old;
};
await openPage();

const text = () => page.evaluate(() => document.body.innerText);
const clickText = (t, sel = "button, a") =>
  page.evaluate(
    (t, sel) => {
      const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).find((e) => e.innerText.trim().includes(t));
      if (!el) throw new Error("no clickable: " + t);
      el.click();
    },
    t,
    sel
  );
const go = async (path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await sleep(300);
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const fill = async (sel, value) => {
  await page.focus(sel);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(sel, value);
};
const login = async (u, p) => {
  await fill('input[autocomplete="username"]', u);
  await fill('input[type="password"]', p);
  await clickText("Sign in");
  await sleep(500);
  if (!(await text()).includes("Sign in to continue")) {
    await openPage();
    await go("/");
  }
};
const logout = async () => {
  await clickText("More");
  await sleep(200);
  await clickText("Log out");
  await sleep(400);
};

try {
  // --- login gate
  await go("/");
  ok("fresh visit shows the login screen", (await text()).includes("Sign in to continue"));
  await go("/members");
  ok("deep link is gated too", (await text()).includes("Sign in to continue"));
  await login("shediv", "wrong");
  ok("wrong password is refused", (await text()).includes("Wrong username or password"));
  await login("shediv", "shediv");
  await go("/");
  ok("super admin signs in to the demo Kopri", (await text()).includes("Total Pool Assets"));
  await page.reload({ waitUntil: "networkidle0" });
  ok("session survives a reload", (await text()).includes("Total Pool Assets"));

  // --- phone layout: no sideways scroll on any page, navigation reachable
  const routes = ["/", "/members", "/deposits", "/loans", "/ledger", "/cash-bank", "/year-end", "/reports", "/rules", "/managers"];
  for (const r of routes) {
    await go(r);
    const o = await overflow();
    ok(`no horizontal page scroll at 390px: ${r}`, o <= 1, `${o}px over`);
  }
  await go("/");
  const navBox = await page.evaluate(() => {
    const n = document.querySelector(".mobile-nav").getBoundingClientRect();
    return { top: n.top, bottom: n.bottom, w: n.width, h: window.innerHeight, count: document.querySelectorAll(".mobile-nav > *").length };
  });
  ok("bottom nav is pinned to the bottom, 5 slots", Math.abs(navBox.bottom - navBox.h) < 2 && navBox.count === 5, JSON.stringify(navBox));
  await clickText("More");
  await sleep(250);
  const sheet = await text();
  ok("More sheet lists every page", ["Cash & Bank", "Year End", "Reports", "Kopri Rules", "Ledger", "Managers"].every((t) => sheet.includes(t)));
  await clickText("Reports", ".more-item");
  await sleep(500);
  ok("tapping a page in the sheet navigates and closes it", page.url().endsWith("/reports") && !(await page.$(".more-sheet")));
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/reports.png` : undefined, fullPage: false }).catch(() => {});

  // --- add a manager
  await go("/managers");
  await clickText("Add manager");
  await page.waitForSelector(".modal input");
  await sleep(300);
  const inputs = await page.$$(".modal input");
  await inputs[0].type("Anthony Fernandes");
  await inputs[1].type("Mapusa Welfare Kopri");
  await inputs[2].type("anthony");
  await inputs[3].type("secret1");
  await clickText("Create manager & Kopri");
  await sleep(500);
  ok("manager appears in the list", (await text()).includes("anthony") && (await text()).includes("Mapusa Welfare Kopri"));
  const modalOverflow = await overflow();
  ok("no sideways scroll after the dialog", modalOverflow <= 1);

  // --- manager logs in: own fresh Kopri, no admin tools
  await logout();
  ok("log out returns to login", (await text()).includes("Sign in to continue"));
  await login("anthony", "wrong");
  ok("manager with wrong password is refused", (await text()).includes("Wrong username or password"));
  await login("anthony", "secret1");
  let t = await text();
  ok("manager lands on their own Kopri", t.includes("Dashboard"));
  await go("/members");
  t = await text();
  ok("manager's Kopri starts fresh (no demo members)", !t.includes("Anita Fernandes") && /No members/i.test(t), t.slice(0, 200));
  await clickText("More");
  await sleep(200);
  ok("manager sees no Managers page or Kopri switcher", !(await text()).includes("Managers") && !(await page.$('button[title="Switch Kopri / manage accounts"]')));
  await clickText("Dashboard", ".more-item");
  await sleep(300);
  await go("/managers");
  ok("manager can't open /managers", !page.url().endsWith("/managers"));
  await go("/rules");
  t = await text();
  ok("manager has no demo-reset / wipe-all buttons", !t.includes("Reset this Kopri to demo data") && !t.includes("Clear demo data & start fresh") && t.includes("Clear this Kopri's data"));

  // add a member as the manager, then check the admin can't see it in the demo Kopri
  await go("/members");
  await clickText("Add member");
  await sleep(300);
  await page.waitForSelector(".modal input");
  await sleep(300);
  await fill(".modal input", "Manager Only Member");
  await clickText("Add", ".modal-foot button");
  await sleep(500);
  ok("manager can add a member", (await text()).includes("Manager Only Member"), (await text()).slice(0, 300));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kopri:state:v2")));
  const demoBook = stored.kopris.find((k) => k.name === "Sunrise Kopri");
  ok("member went to the manager's Kopri, not the demo one", !demoBook.members.some((m) => m.name === "Manager Only Member"));

  // --- admin: clear demo data keeps the manager's Kopri
  await logout();
  await login("shediv", "shediv");
  await go("/managers");
  await clickText("Clear demo data & start fresh");
  await sleep(300);
  await clickText("Clear demo data", ".modal-foot button");
  await sleep(500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("kopri:state:v2")));
  ok("demo Kopri is gone", !after.kopris.some((k) => k.name === "Sunrise Kopri"));
  const mk = after.kopris.find((k) => k.name === "Mapusa Welfare Kopri");
  ok("manager's Kopri and member survive", !!mk && mk.members.some((m) => m.name === "Manager Only Member") && after.managers.length === 1);
  await go("/");
  t = await text();
  ok("admin now starts on an empty Kopri", t.includes("My Kopri") || /No members|0 members/i.test(t) || !t.includes("Sunrise"));

  ok("no console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
}
console.log(failures === 0 ? "\nALL AUTH/MOBILE TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
