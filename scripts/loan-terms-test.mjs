// Per-EMI late fees, payment history and early close on the loan page, on a
// phone and on desktop. Needs the dev server running (npm run dev).
// SHOTS=dir saves screenshots.
import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const SHOTS = process.env.SHOTS || "";
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
  userDataDir: freshProfileDir("kopri-loanterms-profile"),
});

const clickText = async (page, selector, text) => {
  const done = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((n) => n.textContent.trim().startsWith(t) && n.offsetParent !== null);
      if (el) el.click();
      return !!el;
    },
    selector,
    text
  );
  await sleep(350);
  return done;
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

try {
  for (const [label, viewport] of [
    ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop", { width: 1280, height: 900, deviceScaleFactor: 1 }],
  ]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewport(viewport);
    await page.goto(BASE + "/loans", { waitUntil: "networkidle0" });
    // Pick a loan that can still be closed early.
    const ids = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('a[href*="/loans/"]')].map((a) => a.getAttribute("href").split("/loans/")[1])),
    ]);
    let opened = false;
    for (const id of ids) {
      await page.goto(`${BASE}/loans/${id}`, { waitUntil: "networkidle0" });
      await sleep(300);
      if (await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Close early"))) {
        opened = true;
        break;
      }
    }
    ok(`${label}: found an open loan with a Close early button`, opened);
    if (!opened) continue;

    ok(`${label}: payment history card is shown`, (await bodyText(page)).includes("Payments recorded"));
    ok(`${label}: no sideways page scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    // Waive the late fee on EMI #1
    ok(`${label}: Late fee… opens`, await clickText(page, "button.link-btn", "Late fee"));
    ok(`${label}: late fee popup has three choices`, (await page.$$(".choice-row")).length === 3);
    await shot(page, `${label}-late-fee-popup`);
    await page.evaluate(() => [...document.querySelectorAll(".choice-row")][2].click());
    await clickText(page, ".modal button", "Save");
    ok(`${label}: EMI shows late fee waived`, (await bodyText(page)).includes("Late fee waived"));

    // Early close
    ok(`${label}: Close early opens`, await clickText(page, "button", "Close early"));
    const modalText = await page.evaluate(() => document.querySelector(".modal")?.innerText || "");
    ok(`${label}: payoff shows principal and interest`, modalText.includes("Principal still out") && modalText.includes("Interest worked out"));
    await shot(page, `${label}-close-early`);
    await clickText(page, ".modal button", "Record payoff");
    await sleep(300);
    const after = await bodyText(page);
    ok(`${label}: loan shows Closed early`, after.includes("Closed early on"));
    ok(`${label}: payoff entries appear in payment history`, after.includes("early closure"));
    await shot(page, `${label}-closed`);
    if (label === "phone") {
      await page.evaluate(() => [...document.querySelectorAll(".card")].find((c) => c.innerText.includes("Payments recorded"))?.scrollIntoView());
      await sleep(200);
      await shot(page, `${label}-payments`);
    }

    // Undo
    ok(`${label}: Undo early close offered`, await clickText(page, "button", "Undo early close"));
    await clickText(page, ".modal button", "Undo early close");
    const reopened = await bodyText(page);
    ok(`${label}: loan opens again after undo`, !reopened.includes("Closed early on") && reopened.includes("Close early"));
    // Pay an overdue EMI and change the late fee by hand
    const paidOverdue = await page.evaluate(() => {
      const row = [...document.querySelectorAll("table.data tbody tr")].find((r) => /\d+d late/.test(r.innerText));
      const btn = row && [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pay");
      if (btn) btn.click();
      return !!btn;
    });
    if (paidOverdue) {
      await sleep(400);
      const input = await page.$('input[aria-label="Late fee to collect"]');
      ok(`${label}: late fee amount is editable when paying an overdue EMI`, !!input);
      if (input) {
        await input.focus();
        const len = await input.evaluate((el) => el.value.length);
        for (let k = 0; k < len; k++) await page.keyboard.press("Backspace");
        await input.type("37");
        await clickText(page, ".modal button", "Record payment");
        const hist = await bodyText(page);
        ok(`${label}: edited late fee is recorded`, hist.includes("₹37.00") && hist.includes("set by hand"));
      }
    } else {
      console.log(`SKIP  ${label}: no overdue EMI on this loan`);
    }
    ok(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} LOAN TERMS UI TEST(S) FAILED` : "\nALL LOAN TERMS UI TESTS PASSED");
process.exit(failures ? 1 : 0);
