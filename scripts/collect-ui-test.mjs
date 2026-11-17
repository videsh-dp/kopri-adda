// Collect screen (home): one tap records a payment, Undo takes it back,
// receipts and reminders open WhatsApp with the message ready, the screen
// fits a phone and the bottom bar is Collect / People / Loans / More.
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
  userDataDir: freshProfileDir("kopri-collect-profile"),
});
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true });
  // Capture WhatsApp links instead of opening them.
  await page.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(url);
      return null;
    };
  });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);

  const book = () =>
    page.evaluate(() => {
      const root = JSON.parse(localStorage.getItem("kopri:state:v2"));
      return root.kopris.find((k) => k.id === root.activeKopriId);
    });
  const rowKeys = () => page.$$eval(".collect-row", (rs) => rs.map((r) => r.dataset.key));

  const text = await page.evaluate(() => document.body.innerText);
  ok("home is the Collect screen", text.includes("To collect") && text.includes("Still to collect"));
  const tabs = await page.$$eval(".tabbar .tab-label", (els) => els.map((e) => e.innerText.trim()));
  ok("bottom bar is Collect, People, Loans, More", tabs.join() === "Collect,People,Loans,More", tabs.join());
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok("fits the phone, no sideways scroll", sw <= cw, `${sw} > ${cw}`);
  const before = await rowKeys();
  ok("demo has payments to collect", before.length > 0, before.length);
  await shot(page, "collect-phone");

  // One tap: Paid
  const firstKey = before[0];
  const eventsBefore = (await book()).events.length;
  await page.click(`.collect-row[data-key="${firstKey}"] .btn-paid`);
  await sleep(300);
  let b = await book();
  ok("tapping Paid records the payment", b.events.length > eventsBefore, `${b.events.length} vs ${eventsBefore}`);
  ok("the row leaves the list", !(await rowKeys()).includes(firstKey));
  ok("toast offers Undo and Send receipt", await page.evaluate(() => {
    const t = document.querySelector(".toast");
    return !!t && t.innerText.includes("Undo") && t.innerText.includes("Send receipt");
  }));
  await shot(page, "collect-paid-toast");

  // Undo
  await page.evaluate(() => [...document.querySelectorAll(".toast-btn")].find((x) => x.innerText === "Undo").click());
  await sleep(300);
  b = await book();
  ok("Undo removes exactly what was recorded", b.events.length === eventsBefore, `${b.events.length} vs ${eventsBefore}`);
  ok("the row is back", (await rowKeys()).includes(firstKey));

  // Pay again, then send the receipt
  await page.click(`.collect-row[data-key="${firstKey}"] .btn-paid`);
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll(".toast-btn")].find((x) => x.innerText === "Send receipt").click());
  await sleep(200);
  let opened = await page.evaluate(() => window.__opened.slice());
  ok("Send receipt opens WhatsApp with a receipt", opened.length === 1 && opened[0].startsWith("https://wa.me/") && decodeURIComponent(opened[0]).includes("Received"), opened[0]);

  // Reminder
  const second = (await rowKeys())[0];
  await page.click(`.collect-row[data-key="${second}"] .btn-wa`);
  await sleep(200);
  opened = await page.evaluate(() => window.__opened.slice());
  ok("Remind opens WhatsApp with a reminder", opened.length === 2 && decodeURIComponent(opened[1]).includes("reminder"), opened[1]);

  // Bank toggle is remembered and used
  await page.evaluate(() => [...document.querySelectorAll(".seg button")].find((x) => x.innerText.includes("Bank")).click());
  await sleep(100);
  const n0 = (await book()).events.length;
  await page.click(`.collect-row[data-key="${second}"] .btn-paid`);
  await sleep(300);
  b = await book();
  ok("payments go to the bank when Bank / UPI is picked", b.events.slice(n0).every((e) => e.account === "bank") && b.events.length > n0);

  // Different amount opens the full form
  const third = (await rowKeys())[0];
  await page.click(`.collect-row[data-key="${third}"] .btn-more`);
  await sleep(250);
  await page.evaluate(() => [...document.querySelectorAll(".menu-list button")][0].click());
  await sleep(300);
  const title = await page.evaluate(() => [...document.querySelectorAll(".modal-title")].pop()?.innerText);
  ok("'different amount' opens the payment form", /Record EMI payment|Deposit/.test(title || ""), title);

  // Overview moved under More > Manager tools
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.click(".tabbar button:last-child");
  await sleep(300);
  const sheet = await page.evaluate(() => document.querySelector(".sheet")?.innerText || "");
  ok("More lists Manager tools with Overview", /manager tools/i.test(sheet) && sheet.includes("Overview"));

  // Member statement: printable page + WhatsApp summary
  await page.goto(`${BASE}/members/m6/statement`, { waitUntil: "networkidle0" });
  await sleep(300);
  const st = await page.evaluate(() => document.body.innerText);
  ok("statement page shows deposits, loans and what is due", st.includes("Statement for Vijay Sawant") && st.includes("Deposits") && st.includes("Loans") && st.includes("Due now"));
  ok("statement has no app menus", !(await page.$(".tabbar")) || !(await page.$eval(".tabbar", (n) => n.offsetParent)));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Send on WhatsApp")).click());
  await sleep(150);
  const sent = await page.evaluate(() => window.__opened.pop());
  ok("statement goes to WhatsApp as a summary", sent && sent.includes("wa.me/919822567890") && decodeURIComponent(sent).includes("statement"), sent);
  const [ssw, scw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok("statement fits the phone", ssw <= scw);
  await shot(page, "statement-phone");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });

  // First-run setup guide on a brand-new kopri
  await page.keyboard.press("Escape");
  await page.click(".kopri-switch-btn");
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll(".kopri-switch-menu button")].find((b) => b.innerText.includes("New Kopri")).click());
  await sleep(300);
  await page.type(".modal input", "Guide Kopri");
  await page.evaluate(() => [...document.querySelectorAll(".modal-foot button")].pop().click());
  await sleep(500);
  const guideTitle = await page.evaluate(() => [...document.querySelectorAll(".modal-title")].pop()?.innerText);
  ok("a new kopri opens the setup guide", guideTitle === "Set up your kopri", guideTitle);
  const setIn = (label, value) =>
    page.evaluate(
      (label, value) => {
        const g = [...document.querySelectorAll(".modal .form-group")].find((x) => x.querySelector("label")?.textContent.trim().startsWith(label));
        const el = g.querySelector("input");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      label,
      value
    );
  const footClick = (t) => page.evaluate((t) => [...document.querySelectorAll(".modal-foot button")].find((b) => b.innerText.trim() === t).click(), t);
  await setIn("Monthly deposit per member", "750");
  await setIn("Late after day", "10");
  await footClick("Next");
  await sleep(150);
  await setIn("Usual loan interest", "1.5");
  await footClick("Next");
  await sleep(150);
  for (const [n, ph] of [["Rita Guide", "9822011111"], ["Sam Guide", ""]]) {
    await setIn("Name", n);
    await setIn("Mobile number", ph);
    await sleep(50);
    await page.evaluate(() => [...document.querySelectorAll(".modal-body button")].find((b) => b.innerText.startsWith("+ Add")).click());
    await sleep(150);
  }
  await footClick("Done");
  await sleep(300);
  b = await book();
  ok("setup saved the deposit rules", b.rules.defaultMonthlyDeposit === 750 && b.rules.depositDeadlineDay === 10 && b.rules.defaultInterestRate === 1.5 && b.rules.setupDone === true, JSON.stringify(b.rules));
  ok("setup added the members on that deposit", b.members.length === 2 && b.members.every((m) => m.monthlyDeposit === 750) && b.members[0].phone === "9822011111");
  ok("Collect now lists their deposits", (await rowKeys()).length === 2);
  await page.reload({ waitUntil: "networkidle0" });
  ok("guide does not open again", !(await page.$(".modal")));

  ok("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} COLLECT UI TEST(S) FAILED` : "\nALL COLLECT UI TESTS PASSED");
process.exit(failures ? 1 : 0);
