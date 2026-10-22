import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";
const CHROME = findChrome();
const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-empty-profile"),
});

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const page = await browser.newPage();


await page.evaluateOnNewDocument(() => localStorage.setItem("kopri:session:v1", JSON.stringify({ role: "admin" })));
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle0" });
await sleep(600);
await page.click('button[title="Switch Kopri / manage accounts"]');
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("New Kopri")).click());
await sleep(300);
await page.type("input[placeholder*='Mapusa']", "Empty Test Kopri");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Create Kopri")).click());
await sleep(700);

const expectations = [
  ["/", "Total Pool Assets"],
  ["/members", "Members & Borrowers"],
  ["/deposits", "Monthly Deposits"],
  ["/loans", "Create loan"],
  ["/ledger", "Unified Ledger"],
  ["/cash-bank", "Cash & Bank"],
  ["/year-end", "Profit Waterfall"],
  ["/reports", "Reports"],
  ["/rules", "Kopri Rules"],
];

for (const [route, marker] of expectations) {
  await page.goto(BASE + route, { waitUntil: "networkidle0" });
  await sleep(500);
  const text = await page.evaluate(() => document.body.innerText);
  const renderable = text.includes(marker) && !text.includes("NaN") && !text.includes("undefined");
  ok(`route ${route} renders with “${marker}”`, renderable);
}

console.log("page errors:", errs.length ? errs.slice(0, 5) : "none");
ok("no page errors on empty Kopri", errs.length === 0);
await browser.close();
process.exit(failures === 0 ? 0 : 1);