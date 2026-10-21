// Unpaid interest at year end, in the real UI: a loan set to "decide at year
// end" with interest left unpaid in the last financial year. Pick "Add to
// principal" on the Year End page, save, and check the ledger and loan page.
// Run with the dev server up:  npm run dev  (then)  npm run test:year-end-interest
import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";
import { buildSchedule, financialYearOf, financialYearBounds } from "../src/lib/calculations.js";
import { createBook } from "../src/state/kopriStore.js";
import { addMonthsISO, todayISO } from "../src/lib/format.js";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || detail === "" ? "" : `  (${detail})`}`);
  if (!cond) failures++;
};

// Last financial year, and a 12-month loan that started early in it.
const lastFY = financialYearOf(todayISO()) - 1;
const { yearStart, yearEndDate } = financialYearBounds(lastFY);
const startDate = addMonthsISO(yearStart, 1);
const loan = {
  id: "lyei", memberId: "mb", principal: 60000, rate: 2, rateUnit: "monthly", interestMethod: "reducing_balance",
  interestCollection: "monthly", principalRepayment: "monthly", startDate, tenureMonths: 12, gracePeriodDays: 5,
  lateRule: "grace_only", unpaidInterestRule: "manual", status: "active", guarantorIds: [], referredById: "ma",
};
const schedule = buildSchedule(loan);
let n = 0;
const ev = (o) => ({ id: `ev${++n}`, account: "cash", reference: "", description: "", createdAt: `2000-01-01T00:00:${String(n).padStart(2, "0")}Z`, ...o });
const events = [
  ev({ date: yearStart, type: "MEMBER_CONTRIBUTION", memberId: "ma", amount: 100000, lumpSum: true }),
  ev({ date: startDate, type: "LOAN_DISBURSEMENT", memberId: "mb", loanId: "lyei", amount: 60000 }),
];
// First three installments paid in full, the rest due by year end left unpaid.
for (const i of schedule.slice(0, 3)) {
  events.push(ev({ date: i.dueDate, type: "PRINCIPAL_PAYMENT", memberId: "mb", loanId: "lyei", installmentIndex: i.index, amount: i.principalDue }));
  events.push(ev({ date: i.dueDate, type: "INTEREST_PAYMENT", memberId: "mb", loanId: "lyei", installmentIndex: i.index, amount: i.interestDue }));
}
const expectedUnpaid = Math.round(schedule.filter((i) => i.index >= 3 && i.dueDate <= yearEndDate).reduce((a, i) => a + i.interestDue, 0) * 100) / 100;
const book = {
  ...createBook({ name: "Interest Kopri" }),
  members: [
    { id: "ma", name: "Asha Depositor", status: "active", role: "depositor", joinedAt: yearStart, monthlyDeposit: 0 },
    { id: "mb", name: "Bosco Borrower", status: "active", role: "borrower", joinedAt: yearStart },
  ],
  loans: [loan],
  events,
};
const root = { version: 2, settings: { theme: "light" }, activeKopriId: book.id, kopris: [book] };

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-ye-interest-profile"),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const bodyText = () => page.evaluate(() => document.body.innerText);
const clickButton = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].reverse().find((x) => x.innerText.trim() === t && !x.disabled);
    if (!b) throw new Error(`button not found: ${t}`);
    b.click();
  }, text);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("kopri:state:v2")).kopris[0]);

try {
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.evaluate((r) => localStorage.setItem("kopri:state:v2", JSON.stringify(r)), root);
  await page.goto(`${BASE}/year-end`, { waitUntil: "networkidle0" });
  await sleep(300);
  await page.select("select", String(lastFY));
  await sleep(300);

  let text = await bodyText();
  const amountText = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expectedUnpaid);
  ok("year end lists the loan's unpaid interest", text.includes("Unpaid Interest at Year End") && text.includes(amountText), amountText);
  ok("manual loan shows a choice, defaulting to carry forward", text.includes("Decide at year end") && text.includes("Stays on the overdue installments"));

  await page.select('select[aria-label^="Unpaid interest action"]', "capitalize");
  await sleep(200);
  text = await bodyText();
  ok("choosing 'Add to principal' explains the effect", text.includes("Added to principal; bears interest from next period"));

  await clickButton("Save allocation");
  await sleep(250);
  text = await page.evaluate(() => [...document.querySelectorAll(".modal")].pop().innerText);
  ok("save dialog mentions the interest treatment", /unpaid interest on 1 loan/.test(text));
  await clickButton("Save allocation");
  await sleep(400);

  const b = await stored();
  const cap = b.events.filter((e) => e.type === "INTEREST_CAPITALIZED");
  ok("one capitalization entry recorded on the year-end date", cap.length === 1 && cap[0].amount === expectedUnpaid && cap[0].date === yearEndDate, JSON.stringify(cap));
  text = await bodyText();
  ok("year end shows it as applied", text.includes("Applied when the allocation was saved"));

  await page.goto(`${BASE}/loans/lyei`, { waitUntil: "networkidle0" });
  await sleep(300);
  text = await bodyText();
  ok("loan page shows the capitalized interest", text.includes("added to principal") && text.includes("settled at year end"));

  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle0" });
  await sleep(300);
  text = await bodyText();
  ok("ledger lists the non-cash entry", text.includes("Interest capitalized"));

  ok("no console/page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} YEAR-END INTEREST TEST(S) FAILED` : "\nALL YEAR-END INTEREST TESTS PASSED");
process.exit(failures ? 1 : 0);
