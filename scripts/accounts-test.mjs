// Accounts tree check: the tree's totals match the dashboard, nodes expand and
// collapse, tapping a node opens its details and transactions, sub-accounts
// drill down, and the page fits a phone screen.
// Needs the dev server running (npm run dev). Set SHOTS=<dir> to save screenshots.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { findChrome, freshProfileDir } from "./chrome.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const SHOTS = process.env.SHOTS || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-accounts-profile"),
});

const rowAmount = (page, id) => page.$eval(`.acct-row[data-node="${id}"] .acct-amount`, (n) => n.innerText.trim());
const rowExists = async (page, id) => !!(await page.$(`.acct-row[data-node="${id}"]`));

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // ------------------------------------------------------------ desktop
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: SHOTS ? 2 : 1 });
  await page.goto(`${BASE}/overview`, { waitUntil: "networkidle0" });
  await sleep(600);
  const poolAssets = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".stat-card")].find((c) => c.innerText.includes("Total kopri money"));
    return card.querySelector(".stat-value").innerText.trim();
  });
  ok("dashboard links to the accounts tree", !!(await page.$('a[href="/accounts"].acct-dash-link')));

  await page.goto(`${BASE}/accounts`, { waitUntil: "networkidle0" });
  await sleep(500);
  ok("the five top-level groups show", (await Promise.all(["assets", "funds", "income", "expenses", "shared"].map((id) => rowExists(page, id)))).every(Boolean));
  ok("assets total equals the overview's total kopri money", (await rowAmount(page, "assets")) === poolAssets, `${await rowAmount(page, "assets")} vs ${poolAssets}`);
  ok("members' funds equal assets (balanced)", (await rowAmount(page, "funds")) === (await rowAmount(page, "assets")));
  ok("top groups start open, sub-accounts closed", (await rowExists(page, "cash-bank")) && !(await rowExists(page, "cash")));

  await page.click('.acct-row[data-node="cash-bank"] .acct-toggle');
  await sleep(150);
  ok("expanding Assets > Cash & Bank shows cash and bank", (await rowExists(page, "cash")) && (await rowExists(page, "bank")));
  await page.click('.acct-row[data-node="loans"] .acct-toggle');
  await sleep(150);
  const loanRows = await page.$$eval('.acct-row[data-node^="loan-"]', (r) => r.length);
  ok("expanding Loans lists one row per open loan", loanRows > 0, `${loanRows} rows`);
  await shot(page, "accounts-desktop");

  // open a loan's detail
  const firstLoan = await page.$eval('.acct-row[data-node^="loan-"]', (r) => r.dataset.node);
  await page.click(`.acct-row[data-node="${firstLoan}"] .acct-main`);
  await sleep(300);
  let modal = await page.$eval(".modal", (m) => m.innerText);
  ok("tapping a loan opens its details", modal.includes("Principal lent") && /transactions/i.test(modal));
  ok("loan details list its transactions", (await page.$$(".acct-txn")).length > 0);
  ok("loan details link to the loan page", !!(await page.$(`.modal a[href="/loans/${firstLoan.slice(5)}"]`)));
  await shot(page, "accounts-loan-detail");
  await page.click(".acct-crumbs button");
  await sleep(200);
  modal = await page.$eval(".modal-title", (m) => m.innerText);
  ok("breadcrumb goes back up to the parent account", modal === "Assets", modal);
  await page.click(".acct-kid");
  await sleep(200);
  ok("tapping a sub-account drills down", (await page.$eval(".modal-title", (m) => m.innerText)) === "Cash & Bank");
  await page.keyboard.press("Escape");
  await sleep(150);

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Expand all").click());
  await sleep(150);
  ok("expand all opens every level", await rowExists(page, "member-balances") && (await page.$$('.acct-row[data-node^="member-m"]')).length > 0);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Collapse all").click());
  await sleep(150);
  ok("collapse all closes everything", !(await rowExists(page, "cash-bank")));

  // period switch changes income but not balances
  const fyIncome = await rowAmount(page, "income");
  const assetsBefore = await rowAmount(page, "assets");
  await page.evaluate(() => [...document.querySelectorAll(".tab")].find((b) => b.innerText.trim() === "All time").click());
  await sleep(200);
  const allIncome = await rowAmount(page, "income");
  ok("all-time income is at least this year's", Number(allIncome.replace(/[^\d.]/g, "")) >= Number(fyIncome.replace(/[^\d.]/g, "")), `${allIncome} vs ${fyIncome}`);
  ok("balances don't change with the period", (await rowAmount(page, "assets")) === assetsBefore);

  // --------------------------------------------------------------- phone
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 3 : 1 });
  await page.goto(`${BASE}/accounts`, { waitUntil: "networkidle0" });
  await sleep(500);
  await page.click('.acct-row[data-node="loans"] .acct-toggle');
  await page.click('.acct-row[data-node="member-balances"] .acct-toggle');
  await sleep(200);
  for (const w of [390, 360]) {
    await page.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 3 : 1 });
    await sleep(150);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(`accounts tree fits a ${w}px phone`, sw <= cw, `page is ${sw}px wide`);
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 3 : 1 });
  await sleep(150);
  await page.evaluate(() => document.querySelector('.acct-row[data-node="assets"]').scrollIntoView({ block: "start" }));
  await shot(page, "accounts-phone");
  const toggleSize = await page.$eval('.acct-row[data-node="assets"] .acct-toggle', (b) => b.getBoundingClientRect().height);
  ok("expand buttons are big enough to tap", toggleSize >= 36, `${toggleSize}px`);
  await page.click('.acct-row[data-node="surplus"] .acct-main');
  await sleep(300);
  modal = await page.$eval(".modal", (m) => m.innerText);
  ok("surplus details explain where it comes from", modal.includes("Interest received"));
  const [msw, mcw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok("details sheet fits the phone", msw <= mcw);
  await shot(page, "accounts-phone-detail");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.click(".tabbar button:last-child");
  await sleep(300);
  ok("Accounts is reachable from the phone's More menu", !!(await page.$('.sheet a[href="/accounts"]')));

  ok("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll accounts checks passed");
process.exit(failures ? 1 : 0);
