// End-to-end money flow in the real UI on a fresh, empty Kopri:
// members + deposits → custom-schedule loan → partial installment payment →
// write-off → year-end page. Checks the derived numbers in localStorage.
// Run with the dev server up:  npm run dev  (then)  npm run test:flow
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
  userDataDir: freshProfileDir("kopri-flow-profile"),
});
const page = await browser.newPage();

await page.evaluateOnNewDocument(() => localStorage.setItem("kopri:session:v1", JSON.stringify({ role: "admin" })));
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const clickButton = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].reverse().find((x) => x.innerText.trim().includes(t) && !x.disabled);
    if (!b) throw new Error(`button not found: ${t}`);
    b.click();
  }, text);

// Set a field inside the open modal by its label (React-friendly).
const setField = (label, value) =>
  page.evaluate(
    (label, value) => {
      const modal = [...document.querySelectorAll(".modal")].pop() || document;
      const group = [...modal.querySelectorAll(".form-group")].find((g) => g.querySelector("label")?.innerText.trim().startsWith(label));
      if (!group) throw new Error(`field not found: ${label}`);
      const el = group.querySelector("input, select");
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    },
    label,
    value
  );

const setSelectByText = (label, optionText) =>
  page.evaluate(
    (label, optionText) => {
      const modal = [...document.querySelectorAll(".modal")].pop() || document;
      const group = [...modal.querySelectorAll(".form-group")].find((g) => g.querySelector("label")?.innerText.trim().startsWith(label));
      const el = group.querySelector("select");
      const opt = [...el.options].find((o) => o.text.includes(optionText));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, opt.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    label,
    optionText
  );

const book = () =>
  page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("kopri:state:v2"));
    return root.kopris.find((k) => k.id === root.activeKopriId);
  });
const bodyText = () => page.evaluate(() => document.body.innerText);

try {
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);

  // Fresh empty Kopri
  await page.click('button[title="Switch Kopri / manage accounts"]');
  await sleep(250);
  await clickButton("New Kopri");
  await sleep(250);
  await page.type("input[placeholder*='Mapusa']", "Flow Kopri");
  await clickButton("Create Kopri");
  await sleep(500);

  // Members with opening deposits
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle0" });
  for (const [name, amt] of [["Asha Flow", "50000"], ["Bosco Flow", "30000"]]) {
    await clickButton("Add member");
    await sleep(250);
    await setField("Full name", name);
    await setField("Opening deposit", amt);
    await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").click());
    await sleep(300);
  }
  let b = await book();
  ok("two members with deposits", b.members.length === 2 && b.events.filter((e) => e.type === "MEMBER_CONTRIBUTION").length === 2);
  ok("opening deposits are one-off, not monthly", b.events.filter((e) => e.type === "MEMBER_CONTRIBUTION").every((e) => e.lumpSum));
  ok("new members are depositors on the Kopri's monthly amount", b.members.every((m) => m.role === "depositor" && m.monthlyDeposit === 5000));

  // Monthly deposit grid: this month is unpaid for both; pay Asha's from the grid
  await page.goto(`${BASE}/deposits`, { waitUntil: "networkidle0" });
  await sleep(300);
  let text0 = await bodyText();
  ok("deposits page lists both members", text0.includes("Monthly Deposits") && text0.includes("Asha Flow") && text0.includes("Bosco Flow"));
  const cellCount = await page.$$eval(".dg-cell.dg-due, .dg-cell.dg-late, .dg-cell.dg-upcoming", (els) => els.filter((e) => !e.closest(".dg-legend")).length);
  ok("this month shows as unpaid for both", cellCount === 2, cellCount);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".deposit-grid tbody tr")].find((r) => r.innerText.includes("Asha Flow"));
    row.querySelector(".dg-cell").click();
  });
  await sleep(300);
  await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").click());
  await sleep(300);
  b = await book();
  const asha = b.members.find((m) => m.name === "Asha Flow");
  const monthly = b.events.find((e) => e.type === "MEMBER_CONTRIBUTION" && e.memberId === asha.id && !e.lumpSum);
  const thisMonth = new Date().toISOString().slice(0, 7);
  ok("grid payment is tagged to this month", monthly && monthly.amount === 5000 && monthly.depositMonth === thisMonth, JSON.stringify(monthly));
  // Paid today: on time before the deadline day, "paid late" after it.
  const paidCells = await page.$$eval(".deposit-grid .dg-paid, .deposit-grid .dg-paid_late", (els) => els.length);
  ok("Asha's month shows as paid", paidCells === 1, paidCells);

  // A borrower who is not a member
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle0" });
  await clickButton("Add borrower");
  await sleep(250);
  await setField("Full name", "Carlos Outsider");
  await setField("Address", "Margao");
  await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").click());
  await sleep(300);
  b = await book();
  const carlos = b.members.find((m) => m.name === "Carlos Outsider");
  ok("borrower profile saved without deposits", carlos && carlos.role === "borrower" && carlos.address === "Margao" && carlos.monthlyDeposit === 0);
  const bosco = b.members.find((m) => m.name === "Bosco Flow");

  // Loan with a custom principal schedule
  await page.goto(`${BASE}/loans`, { waitUntil: "networkidle0" });
  await clickButton("Create loan");
  await sleep(300);
  await setSelectByText("Borrower", "Bosco Flow");
  await sleep(150);
  let noRefDisabled = await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").disabled);
  ok("can't create a loan without a referral", noRefDisabled);
  const refOptions = await page.evaluate(() => {
    const group = [...document.querySelectorAll(".modal .form-group")].find((g) => g.querySelector("label")?.innerText.startsWith("Referred by"));
    return [...group.querySelectorAll("option")].map((o) => o.text);
  });
  ok("referrers are depositors other than the borrower", refOptions.includes("Asha Flow") && !refOptions.includes("Bosco Flow") && !refOptions.includes("Carlos Outsider"), refOptions.join());
  await setSelectByText("Referred by", "Asha Flow");
  await setField("Principal (₹)", "12000");
  await setField("Interest rate", "2");
  await setField("Tenure (months)", "3");
  await setField("Interest method", "reducing_balance");
  await setField("Principal repayment", "custom");
  await sleep(250);
  const customCells = await page.$$(".custom-schedule input");
  ok("custom schedule shows one input per month", customCells.length === 3, customCells.length);
  const createDisabledWhenWrong = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".custom-schedule input")];
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(cells[0], "2000");
    set(cells[1], "0");
    set(cells[2], "9000");
    return true;
  });
  await sleep(150);
  const disabled = await page.evaluate(() => document.querySelector(".modal-foot button.btn-primary").disabled);
  ok("can't create when custom amounts don't add up", createDisabledWhenWrong && disabled);
  await page.evaluate(() => {
    const el = document.querySelectorAll(".custom-schedule input")[2];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "10000");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(150);
  await clickButton("Create loan & disburse");
  await sleep(400);
  b = await book();
  const loan = b.loans[0];
  const disb = b.events.find((e) => e.type === "LOAN_DISBURSEMENT");
  ok("loan saved with custom schedule", loan && loan.customPrincipalSchedule?.join() === "2000,0,10000");
  ok("disbursement is linked to the loan", disb && disb.loanId === loan.id && disb.amount === 12000);
  ok("loan records who referred it", loan.referredById === asha.id);

  // Partial payment on installment 1: interest first
  await page.goto(`${BASE}/loans/${loan.id}`, { waitUntil: "networkidle0" });
  await sleep(300);
  let text = await bodyText();
  ok("loan page shows the custom principal amounts", text.includes("10,000") && text.includes("2,000"));
  await clickButton("Record repayment");
  await sleep(300);
  await setField("Amount", "500");
  await sleep(100);
  await clickButton("Record payment");
  await sleep(400);
  b = await book();
  const pays = b.events.filter((e) => e.loanId === loan.id && e.installmentIndex === 0);
  const interest = pays.find((e) => e.type === "INTEREST_PAYMENT");
  const principal = pays.find((e) => e.type === "PRINCIPAL_PAYMENT");
  ok("₹500 split as ₹240 interest + ₹260 principal", interest?.amount === 240 && principal?.amount === 260, JSON.stringify(pays.map((p) => [p.type, p.amount])));

  // Write off the rest
  await clickButton("Write off");
  await sleep(250);
  await page.evaluate(() => [...document.querySelectorAll(".modal-foot button")].find((x) => x.innerText.trim() === "Write off").click());
  await sleep(400);
  b = await book();
  const wo = b.events.find((e) => e.type === "LOAN_WRITE_OFF");
  ok("write-off recorded for remaining principal", wo && wo.amount === 11740 && wo.loanId === loan.id, wo?.amount);
  text = await bodyText();
  ok("loan shows as defaulted", text.includes("Defaulted"));

  // Cash: 80000 deposits − 12000 loan + 500 repaid; write-off moves no cash
  await page.goto(`${BASE}/cash-bank`, { waitUntil: "networkidle0" });
  await sleep(300);
  text = await bodyText();
  ok("cash on hand = ₹73,500 (incl. Asha's ₹5,000 monthly deposit)", text.includes("₹73,500"));
  ok("out in loans = ₹0 after write-off", /Out in loans\s*₹0/.test(text));

  // Year-end page renders with this year's loss (interest 240 − write-off 11740)
  await page.goto(`${BASE}/year-end`, { waitUntil: "networkidle0" });
  await sleep(300);
  text = await bodyText();
  ok("year-end shows the write-off as bad debt", text.includes("11,740"));

  ok("no console/page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} FLOW TEST(S) FAILED` : "\nALL FLOW TESTS PASSED");
process.exit(failures ? 1 : 0);
