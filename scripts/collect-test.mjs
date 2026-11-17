// Unit tests for the Collect list (src/lib/collect.js). No browser needed.
// Run with:  npm run test:collect
import { collectionList, paymentEvents, waPhone, whatsappLink, receiptText, reminderText } from "../src/lib/collect.js";
import { deriveDeposits, deriveLoan } from "../src/lib/calculations.js";
import { DEFAULT_RULES } from "../src/lib/constants.js";

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `  (${detail})`}`);
  if (!cond) failures++;
};

const today = "2026-11-17";
const rules = { ...DEFAULT_RULES, depositDueDay: 1, depositDeadlineDay: 15, depositLateFeeType: "fixed", depositLateFeeFixed: 100 };
const members = [
  { id: "a", name: "Asha Naik", phone: "98220 12345", status: "active", role: "depositor", monthlyDeposit: 1000, depositStartMonth: "2026-10", joinedAt: "2026-10-01" },
  { id: "b", name: "Bosco Dias", phone: "", status: "active", role: "both", monthlyDeposit: 2000, depositStartMonth: "2026-11", joinedAt: "2026-11-01" },
  { id: "c", name: "Carol Pinto", status: "active", role: "borrower" },
];
const loan = {
  id: "L1", memberId: "c", principal: 12000, rate: 2, rateUnit: "monthly",
  interestMethod: "flat", interestCollection: "monthly", principalRepayment: "monthly",
  startDate: "2026-09-10", tenureMonths: 12, gracePeriodDays: 5, lateRule: "fixed_penalty", lateFixedPenalty: 50, status: "active", referredById: "a",
};
let state = {
  name: "Test Kopri",
  rules,
  members,
  loans: [loan],
  events: [
    { id: "d1", date: "2026-10-03", type: "MEMBER_CONTRIBUTION", memberId: "b", amount: 0, account: "cash" },
    { id: "p1", date: "2026-10-10", type: "PRINCIPAL_PAYMENT", memberId: "c", loanId: "L1", installmentIndex: 0, amount: 1000, account: "cash" },
    { id: "p2", date: "2026-10-10", type: "INTEREST_PAYMENT", memberId: "c", loanId: "L1", installmentIndex: 0, amount: 240, account: "cash" },
    { id: "d2", date: "2026-11-02", type: "MEMBER_CONTRIBUTION", memberId: "b", amount: 2000, depositMonth: "2026-11", account: "cash" },
  ],
};

const list = collectionList(state, today);
const keys = list.toCollect.map((i) => i.key);

ok("Asha's October deposit is late (past 15 Oct)", list.toCollect.find((i) => i.key === "dep:a:2026-10")?.status === "late");
ok("late deposit includes the late fee", list.toCollect.find((i) => i.key === "dep:a:2026-10")?.amount === 1100);
ok("Asha's November deposit is late too (past 15 Nov)", list.toCollect.find((i) => i.key === "dep:a:2026-11")?.status === "late");
ok("Bosco's paid November deposit is in the paid list", list.paid.some((i) => i.key === "dep:b:2026-11"));
ok("Bosco is not asked to pay November again", !keys.includes("dep:b:2026-11"));
ok("paid EMI 1 (due 10 Oct) is not listed", !keys.includes("emi:L1:0"));
ok("EMI 2 (due 10 Nov) is listed as late", list.toCollect.find((i) => i.key === "emi:L1:1")?.status === "late");
ok("EMI 3 (due 10 Dec) is not listed yet", !keys.includes("emi:L1:2"));
ok("late items come first", list.toCollect[0].status === "late");

// Recording a row as paid clears it.
const emi = list.toCollect.find((i) => i.key === "emi:L1:1");
const evs = paymentEvents(emi, { date: today });
ok("EMI paid as principal + interest + late fee", evs.map((e) => e.type).join() === "PRINCIPAL_PAYMENT,INTEREST_PAYMENT,LATE_FEE", evs.map((e) => e.type).join());
ok("EMI events add up to the shown amount", Math.abs(evs.reduce((a, e) => a + e.amount, 0) - emi.amount) < 0.01);
ok("every event has its own id (for undo)", new Set(evs.map((e) => e.id)).size === evs.length && evs.every((e) => e.id));
state = { ...state, events: [...state.events, ...evs] };
const after = deriveLoan(loan, state.events, today);
ok("installment 2 now paid", after.installments[1].status === "paid");
ok("no late fee left on installment 2", after.installments[1].lateFeeDue < 0.01);

const dep = list.toCollect.find((i) => i.key === "dep:a:2026-10");
const devs = paymentEvents(dep, { date: today, account: "bank" });
ok("deposit recorded as contribution + late fee, tagged to the month", devs.length === 2 && devs.every((e) => e.depositMonth === "2026-10" && e.account === "bank"));
state = { ...state, events: [...state.events, ...devs] };
const d = deriveDeposits(members[0], state.events, rules, today);
ok("October now paid late with no fee left", d.months[0].status === "paid_late" && d.months[0].lateFeeDue < 0.01);
const list2 = collectionList(state, today);
ok("paid rows leave the list", !list2.toCollect.some((i) => i.key === "dep:a:2026-10" || i.key === "emi:L1:1"));
ok("paid EMI shows in this month's paid list", list2.paid.some((i) => i.key === "emi:L1:1"));

// WhatsApp
ok("10-digit phone gets 91", waPhone("98220 12345") === "919822012345");
ok("+91 kept", waPhone("+91 98220-12345") === "919822012345");
ok("leading 0 dropped", waPhone("098220 12345") === "919822012345");
ok("no phone gives empty", waPhone("") === "");
ok("link encodes text", whatsappLink("9822012345", "Hi there\nok").endsWith("?text=Hi%20there%0Aok"));
const r = receiptText({ kopriName: "Test Kopri", item: emi, amount: emi.amount, date: today });
ok("receipt names member and amount", r.includes("Namaskar Carol") && r.includes("₹1,290") && r.includes("Test Kopri"), r);
const rem = reminderText({ kopriName: "Test Kopri", item: dep, today });
ok("reminder says it was due", rem.includes("was due on") && rem.includes("₹1,100"), rem);

console.log(failures ? `\n${failures} COLLECT TEST(S) FAILED` : "\nALL COLLECT TESTS PASSED");
process.exit(failures ? 1 : 0);
