// The kopri manager's whole workflow in the real UI, on a fresh empty Kopri:
// rules → members and a non-member borrower → monthly deposits (late, fee) →
// referred loan → every pay mode with late fees → year end with the
// manager's share paid out. Checks the saved data in localStorage.
// Run with the dev server up:  npm run dev  (then)  npm run test:manager
import puppeteer from "puppeteer-core";
import { findChrome, freshProfileDir } from "./chrome.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || detail === "" ? "" : `  (${detail})`}`);
  if (!cond) failures++;
};

const ymAgo = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const thisMonth = ymAgo(0);
const todayDay = new Date().getDate();

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  userDataDir: freshProfileDir("kopri-manager-profile"),
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const clickButton = (text, scope = "") =>
  page.evaluate(
    (t, scope) => {
      const root = scope ? [...document.querySelectorAll(scope)].pop() : document;
      const b = [...root.querySelectorAll("button")].reverse().find((x) => x.innerText.trim().includes(t) && !x.disabled);
      if (!b) throw new Error(`button not found: ${t}`);
      b.click();
    },
    text,
    scope
  );
const primary = () => page.evaluate(() => [...document.querySelectorAll(".modal-foot button.btn-primary")].pop().click());

// Set a field in the open modal (or the page) by its label, React-friendly.
const setField = (label, value, inPage = false) =>
  page.evaluate(
    (label, value, inPage) => {
      const root = inPage ? document : [...document.querySelectorAll(".modal")].pop() || document;
      const group = [...root.querySelectorAll(".form-group")].find((g) => g.querySelector("label")?.innerText.trim().startsWith(label));
      if (!group) throw new Error(`field not found: ${label}`);
      const el = group.querySelector("input, select");
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      if (el.tagName !== "SELECT") el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    label,
    value,
    inPage
  );
const setSelectByText = (label, optionText) =>
  page.evaluate(
    (label, optionText) => {
      const modal = [...document.querySelectorAll(".modal")].pop() || document;
      const group = [...modal.querySelectorAll(".form-group")].find((g) => g.querySelector("label")?.innerText.trim().startsWith(label));
      const el = group.querySelector("select");
      const opt = [...el.options].find((o) => o.text.includes(optionText));
      if (!opt) throw new Error(`option not found: ${optionText}`);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, opt.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    label,
    optionText
  );
// Click a button inside the table row whose text includes `rowText`.
const clickInRow = (rowText, buttonText) =>
  page.evaluate(
    (rowText, buttonText) => {
      const row = [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(rowText));
      if (!row) throw new Error(`row not found: ${rowText}`);
      const b = [...row.querySelectorAll("button")].find((x) => x.innerText.trim().includes(buttonText));
      if (!b) throw new Error(`button ${buttonText} not in row ${rowText}`);
      b.click();
    },
    rowText,
    buttonText
  );
const book = () =>
  page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem("kopri:state:v2"));
    return root.kopris.find((k) => k.id === root.activeKopriId);
  });
const bodyText = () => page.evaluate(() => document.body.innerText);
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await sleep(300);
};

try {
  await go("/");
  await page.click('button[title="Switch Kopri / manage accounts"]');
  await sleep(250);
  await clickButton("New Kopri");
  await sleep(250);
  await page.type("input[placeholder*='Mapusa']", "Manager Kopri");
  await clickButton("Create Kopri");
  await sleep(500);

  // ------------------------------------------------------------ Rules
  await go("/rules");
  await setField("Late fee on deposits", "fixed", true);
  await sleep(100);
  await setField("Late fee per month", "50", true);
  await setField("Manager's charges", "10", true);
  await setField("Reserve rate", "5", true);
  await setField("Deadline day", "15", true);
  await clickButton("Save rules");
  await sleep(300);
  let b = await book();
  ok("rules saved: deposit late fee ₹50, manager 10%, reserve 5%", b.rules.depositLateFeeType === "fixed" && b.rules.depositLateFeeFixed === 50 && b.rules.managerChargesRate === 10 && b.rules.reserveRate === 5);
  ok("referral rule is on by default", b.rules.requireReferral === true);

  // ------------------------------------------------------------ Members
  await go("/members");
  for (const [name, role, start] of [["Asha Mgr", "depositor", ymAgo(2)], ["Bosco Mgr", "both", thisMonth]]) {
    await clickButton("Add member");
    await sleep(250);
    await setField("Full name", name);
    await setField("Role", role);
    await sleep(100);
    await setField("Monthly deposit", "1000");
    await setField("Deposits start from", start);
    await setField("Address", "Panjim");
    await setField("Nominee", "Spouse");
    await primary();
    await sleep(300);
  }
  b = await book();
  const asha = b.members.find((m) => m.name === "Asha Mgr");
  const bosco = b.members.find((m) => m.name === "Bosco Mgr");
  ok("depositor profile saved with deposit plan and details", asha && asha.monthlyDeposit === 1000 && asha.depositStartMonth === ymAgo(2) && asha.nominee === "Spouse" && asha.address === "Panjim");
  ok("member who also borrows saved as 'both'", bosco && bosco.role === "both");

  // ------------------------------------------------------------ Deposits
  await go("/deposits");
  let text = await bodyText();
  // Two past months are late; this month too once the 15th has gone by.
  const lateNow = todayDay > 15 ? 3 : 2;
  ok(`Asha shows ${lateNow} late months on the deposits page`, text.includes(`Asha Mgr (${lateNow} months, ₹${lateNow},000)`), text.match(/Late deposits:[^\n]*/)?.[0]);
  ok("late months are red cells", (await page.$$eval(".deposit-grid .dg-late", (els) => els.length)) >= 2);
  await go("/");
  text = await bodyText();
  ok("dashboard warns that a member is behind on deposits", text.includes("behind on monthly deposits"));

  // Pay Asha's oldest month on her page; it is paid late so a fee is due.
  await go(`/members/${asha.id}`);
  const oldestLabel = new Date(Number(ymAgo(2).slice(0, 4)), Number(ymAgo(2).slice(5)) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  await clickInRow(oldestLabel, "Pay");
  await sleep(300);
  await primary();
  await sleep(300);
  b = await book();
  const dep = b.events.find((e) => e.type === "MEMBER_CONTRIBUTION" && e.memberId === asha.id);
  ok("deposit is tagged to the month it pays", dep && dep.depositMonth === ymAgo(2) && dep.amount === 1000, JSON.stringify(dep));
  text = await bodyText();
  ok("that month now shows 'Paid late' with a ₹50 fee to collect", text.includes("Paid late") && text.includes("Collect fee"));
  await clickInRow(oldestLabel, "Collect fee");
  await sleep(300);
  await primary();
  await sleep(300);
  b = await book();
  const fee = b.events.find((e) => e.type === "LATE_FEE" && e.memberId === asha.id);
  ok("deposit late fee booked for that month, not on a loan", fee && fee.amount === 50 && fee.depositMonth === ymAgo(2) && !fee.loanId);

  // Edit a profile: change the monthly amount.
  await go(`/members/${bosco.id}`);
  await clickButton("Edit profile");
  await sleep(250);
  await setField("Monthly deposit", "2000");
  await setField("Occupation", "Carpenter");
  await primary();
  await sleep(300);
  b = await book();
  const bosco2 = b.members.find((m) => m.id === bosco.id);
  ok("profile edit saved", bosco2.monthlyDeposit === 2000 && bosco2.occupation === "Carpenter");
  text = await bodyText();
  ok("member page shows the new monthly amount", text.includes("₹2,000/month"));

  // ------------------------------------------------------------ Loan
  // Start 3 months back so two installments are overdue.
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  start.setDate(start.getDate() - 1);
  const startISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  await go("/loans");
  await clickButton("Create loan");
  await sleep(300);
  await clickButton("+ New", ".modal");
  await sleep(300);
  await setField("Full name", "Carlos Mgr");
  await setField("ID proof", "PAN ABCDE1234F");
  await primary();
  await sleep(300);
  b = await book();
  const carlos = b.members.find((m) => m.name === "Carlos Mgr");
  ok("new borrower added from inside the loan form", carlos && carlos.role === "borrower" && carlos.idProof === "PAN ABCDE1234F");
  const picked = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".modal .form-group")].find((x) => x.querySelector("label")?.innerText.startsWith("Borrower"));
    const s = g.querySelector("select");
    return s.options[s.selectedIndex].text;
  });
  ok("the new borrower is picked in the loan form", picked.includes("Carlos Mgr"), picked);
  await setField("Principal (₹)", "12000");
  await setField("Interest rate", "2");
  await setField("Interest method", "flat");
  await setField("Tenure (months)", "12");
  await setField("Start date", startISO);
  await setField("Late payment rule", "fixed_penalty");
  await sleep(100);
  await setField("Late fee per overdue installment", "100");
  let disabled = await page.evaluate(() => [...document.querySelectorAll(".modal-foot button.btn-primary")].pop().disabled);
  ok("loan blocked until a member refers it", disabled);
  await setSelectByText("Referred by", "Asha Mgr");
  await sleep(100);
  await clickButton("Create loan & disburse");
  await sleep(400);
  b = await book();
  const loan = b.loans[0];
  ok("loan saved with referral and its own late fee", loan && loan.memberId === carlos.id && loan.referredById === asha.id && loan.lateFixedPenalty === 100);

  await go(`/loans/${loan.id}`);
  text = await bodyText();
  ok("loan page shows ₹200 late fees built up (2 overdue × ₹100)", /Late fees due\s*₹200/.test(text), text.match(/Late fees due[^\n]*\n[^\n]*/)?.[0]);
  ok("loan page names the referrer", text.includes("Referred this loan") && text.includes("Asha Mgr"));
  await go("/");
  text = await bodyText();
  ok("dashboard shows late fees built up", text.includes("₹200 late fees"));

  // Installment 1: interest only, with its late fee.
  await go(`/loans/${loan.id}`);
  const payInst = async (n) => {
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll("tbody tr")].find((r) => r.querySelector("td")?.innerText.trim() === String(n));
      [...row.querySelectorAll("button")].find((x) => x.innerText.trim() === "Pay").click();
    }, n);
    await sleep(300);
  };
  await payInst(1);
  await clickButton("Interest only", ".modal");
  await sleep(150);
  await primary();
  await sleep(300);
  b = await book();
  let ev1 = b.events.filter((e) => e.loanId === loan.id && e.installmentIndex === 0);
  ok("interest only: ₹240 interest + ₹100 late fee", ev1.length === 2 && ev1.some((e) => e.type === "INTEREST_PAYMENT" && e.amount === 240) && ev1.some((e) => e.type === "LATE_FEE" && e.amount === 100), JSON.stringify(ev1.map((e) => [e.type, e.amount])));

  // Installment 1 again: principal only — late fee must not be charged twice.
  await payInst(1);
  text = await page.evaluate(() => [...document.querySelectorAll(".modal")].pop().innerText);
  ok("pay screen shows the late fee already collected", text.includes("already collected"));
  await clickButton("Principal only", ".modal");
  await sleep(150);
  await primary();
  await sleep(300);
  b = await book();
  ev1 = b.events.filter((e) => e.loanId === loan.id && e.installmentIndex === 0);
  ok("principal only: ₹1,000, no second late fee", ev1.filter((e) => e.type === "PRINCIPAL_PAYMENT" && e.amount === 1000).length === 1 && ev1.filter((e) => e.type === "LATE_FEE").length === 1);

  // Installment 2: partial ₹500 as principal + interest.
  await payInst(2);
  await setField("Amount", "500");
  await sleep(100);
  await primary();
  await sleep(300);
  b = await book();
  const ev2 = b.events.filter((e) => e.loanId === loan.id && e.installmentIndex === 1);
  ok("partial ₹500: ₹240 interest + ₹260 principal (+ late fee)", ev2.some((e) => e.type === "INTEREST_PAYMENT" && e.amount === 240) && ev2.some((e) => e.type === "PRINCIPAL_PAYMENT" && e.amount === 260) && ev2.some((e) => e.type === "LATE_FEE" && e.amount === 100), JSON.stringify(ev2.map((e) => [e.type, e.amount])));
  text = await bodyText();
  ok("late fees all collected now", /Late fees due\s*₹0/.test(text));
  ok("installment 1 paid, installment 2 still overdue", await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")];
    return rows[0].innerText.includes("Paid") && rows[1].innerText.includes("Overdue");
  }));

  // Installment 3 in full (principal + interest).
  await payInst(3);
  await primary();
  await sleep(300);
  b = await book();
  const ev3 = b.events.filter((e) => e.loanId === loan.id && e.installmentIndex === 2);
  ok("both: installment 3 paid in full (₹1,000 + ₹240)", ev3.some((e) => e.type === "PRINCIPAL_PAYMENT" && e.amount === 1000) && ev3.some((e) => e.type === "INTEREST_PAYMENT" && e.amount === 240));

  // ------------------------------------------------------------ Year end
  await go("/year-end");
  text = await bodyText();
  // Income: interest 240 + 240 + 240 = 720, late fees 100 + 100 + 50 = 250 → gross 970.
  ok("year end: manager's charges 10% of ₹970 = ₹97", text.includes("₹97") && text.includes("Manager"), text.match(/Manager[^\n]*\n[^\n]*/)?.[0]);
  // (Carlos may still appear in the unpaid-interest table, which lists borrowers.)
  ok("year end: borrower-only Carlos gets no profit share", !(await page.evaluate(() => [...document.querySelectorAll("table:not(.unpaid-interest) tbody tr")].some((r) => r.innerText.includes("Carlos Mgr")))));
  await clickButton("Save allocation");
  await sleep(250);
  await primary();
  await sleep(300);
  await clickButton("Settle & payout");
  await sleep(250);
  text = await page.evaluate(() => [...document.querySelectorAll(".modal")].pop().innerText);
  ok("settle screen says the manager's share is paid out", text.includes("manager's share"));
  await primary();
  await sleep(400);
  b = await book();
  const mgr = b.events.find((e) => e.type === "MANAGER_PAYOUT");
  ok("manager's share paid out in the ledger", mgr && Math.abs(mgr.amount - 97) < 0.01, mgr?.amount);
  const ye = b.yearEnds[0];
  ok("allocation split between the two depositors only", ye.allocations.every((a) => a.memberId !== carlos.id) && Math.abs(ye.allocations.reduce((s, a) => s + a.profitShare, 0) - ye.distributable) < 0.01);
  await go("/ledger");
  text = await bodyText();
  ok("ledger lists the manager's share", text.includes("Manager's share"));

  ok("no console/page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log("FAIL  scenario crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL MANAGER FLOW TESTS PASSED" : `\n${failures} MANAGER FLOW TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
