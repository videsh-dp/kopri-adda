// Unit tests for the money math in src/lib/calculations.js (no browser needed).
// Run with:  npm run test:calc
import {
  buildSchedule,
  deriveLoan,
  deriveMember,
  deriveAccounts,
  computeYearEnd,
  financialYearBounds,
  financialYearOf,
  splitPayAmount,
} from "../src/lib/calculations.js";
import { DEFAULT_RULES } from "../src/lib/constants.js";
import { rootReducer, createBook } from "../src/state/kopriStore.js";

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `  (${detail})`}`);
  if (!cond) failures++;
};
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

let n = 0;
const ev = (o) => ({ id: `e${++n}`, account: "cash", createdAt: `t${String(n).padStart(4, "0")}`, ...o });
const A = { id: "a", name: "A", status: "active" };
const B = { id: "b", name: "B", status: "active" };
const C = { id: "c", name: "C", status: "active" };

// --------------------------------------------------------------- Interest
const loan = {
  id: "L1", memberId: "a", principal: 12000, rate: 2, rateUnit: "monthly",
  interestMethod: "reducing_balance", interestCollection: "monthly", principalRepayment: "monthly",
  startDate: "2025-01-15", tenureMonths: 12, gracePeriodDays: 5, lateRule: "normal_interest", status: "active",
};
{
  const s = buildSchedule(loan);
  ok("reducing balance: month 1 interest = 12000 × 2% = 240", s[0].interestDue === 240, s[0].interestDue);
  ok("reducing balance: February not cut short (month 2 = 11000 × 2% = 220)", s[1].interestDue === 220, s[1].interestDue);
  const total = s.reduce((a, x) => a + x.interestDue, 0);
  ok("reducing balance: total interest = 1560", near(total, 1560), total);
  const flat = buildSchedule({ ...loan, interestMethod: "flat" });
  ok("flat: every month 240", flat.every((x) => x.interestDue === 240));
  const daily = buildSchedule({ ...loan, interestMethod: "daily_outstanding" });
  ok("daily: Jan 15 → Feb 15 is 31 days", daily[0].daysInPeriod === 31 && near(daily[0].interestDue, 248), daily[0].interestDue);
  ok("daily: Feb 15 → Mar 15 is 28 days", daily[1].daysInPeriod === 28 && near(daily[1].interestDue, 205.33), daily[1].interestDue);
  const yearly = buildSchedule({ ...loan, rate: 24, rateUnit: "yearly" });
  ok("24%/yr behaves like 2%/mo", yearly[0].interestDue === 240);
  const custom = buildSchedule({ ...loan, tenureMonths: 3, principalRepayment: "custom", customPrincipalSchedule: [2000, 0, 10000] });
  ok("custom principal schedule is used", custom.map((x) => x.principalDue).join() === "2000,0,10000");
  const badCustom = buildSchedule({ ...loan, tenureMonths: 3, principalRepayment: "custom", customPrincipalSchedule: [1, 2, 3] });
  ok("custom schedule that doesn't add up falls back to equal split", badCustom.map((x) => x.principalDue).join() === "4000,4000,4000");
}

// ---------------------------------------------------------- Payment split
{
  const s = splitPayAmount(500, 1000, 240);
  ok("partial payment clears interest first", s.interest === 240 && s.principal === 260 && s.extra === 0, JSON.stringify(s));
  const o = splitPayAmount(1500, 1000, 240);
  ok("overpayment is kept as extra principal", o.interest === 240 && o.principal === 1260 && o.extra === 260, JSON.stringify(o));
}

// ------------------------------------------------------- Loan derivation
{
  const events = [
    ev({ date: "2025-01-15", type: "LOAN_DISBURSEMENT", memberId: "a", loanId: "L1", amount: 12000 }),
    // pays installment 1 with 2000 extra principal
    ev({ date: "2025-02-15", type: "PRINCIPAL_PAYMENT", loanId: "L1", installmentIndex: 0, amount: 3000 }),
    ev({ date: "2025-02-15", type: "INTEREST_PAYMENT", loanId: "L1", installmentIndex: 0, amount: 240 }),
    ev({ date: "2025-02-20", type: "LATE_FEE", loanId: "L1", amount: 50 }),
  ];
  const d = deriveLoan(loan, events, "2025-03-01");
  ok("prepayment on installment 1 carries to the next installments", [0, 1, 2].every((i) => d.installments[i].principalPaid === 1000) && d.installments[3].principalPaid === 0);
  ok("outstanding principal = 12000 − 3000", d.outstandingPrincipal === 9000);
  ok("untagged late fee doesn't produce NaN", d.installments.every((i) => Number.isFinite(i.lateFeePaid)) && d.lateFeesPaid === 50);

  const wo = [...events, ev({ date: "2026-01-10", type: "LOAN_WRITE_OFF", memberId: "a", loanId: "L1", amount: 9000 })];
  const w = deriveLoan(loan, wo, "2026-02-01");
  ok("write-off clears outstanding", w.outstandingPrincipal === 0 && w.principalWrittenOff === 9000);
  ok("written-off loan is defaulted, not overdue", w.effectiveStatus === "defaulted" && !w.isOverdue && w.overdueInterest === 0);
  ok("write-off doesn't touch cash", deriveAccounts(wo).cash === deriveAccounts(events).cash);
}

// --------------------------------------------------------------- Cash
{
  const events = [
    ev({ date: "2025-04-01", type: "MEMBER_CONTRIBUTION", memberId: "a", amount: 10000 }),
    ev({ date: "2025-05-01", type: "TRANSFER", from: "cash", to: "bank", amount: 4000 }),
    ev({ date: "2025-06-01", type: "PROFIT_ALLOCATION", memberId: "a", amount: 500 }),
    ev({ date: "2025-07-01", type: "ADJUSTMENT", sign: "negative", amount: 100 }),
  ];
  const acc = deriveAccounts(events);
  ok("profit allocation is not cash; transfers and adjustments are", acc.cash === 5900 && acc.bank === 4000, JSON.stringify(acc));
}

// ------------------------------------------------------- Member balances
{
  const events = [
    ev({ date: "2025-04-01", type: "MEMBER_CONTRIBUTION", memberId: "a", amount: 10000 }),
    ev({ date: "2026-03-31", type: "PROFIT_ALLOCATION", memberId: "a", amount: 800 }),
  ];
  const before = deriveMember(A, events, []);
  ok("retained profit is part of entitlement, not capital", before.capital === 10000 && before.entitlement === 10800);
  const paid = deriveMember(A, [...events, ev({ date: "2026-04-05", type: "MEMBER_SETTLEMENT", memberId: "a", amount: 10800 })], []);
  ok("full settlement brings capital and entitlement to 0", paid.capital === 0 && paid.entitlement === 0, `${paid.capital}/${paid.entitlement}`);
}

// --------------------------------------------------------------- Year end
const FY = "2026-03-31"; // FY 2025 with April start
const base = [
  ev({ date: "2025-01-10", type: "MEMBER_CONTRIBUTION", memberId: "a", amount: 10000 }), // held all year
  ev({ date: "2025-10-01", type: "MEMBER_CONTRIBUTION", memberId: "b", amount: 10000 }), // 182 days
  ev({ date: "2025-12-01", type: "MEMBER_WITHDRAWAL", memberId: "b", amount: 5000 }),    // −5000 for 121 days
  ev({ date: "2025-06-01", type: "INTEREST_PAYMENT", amount: 2000 }),
];
const ye = (events, rules = {}, extra = {}) =>
  computeYearEnd({ events, members: [A, B, C], loans: [], rules: { ...DEFAULT_RULES, ...rules }, yearEnds: [], ...extra }, FY);
{
  const r = ye(base);
  ok("FY 2025 runs 2025-04-01 … 2026-03-31", r.year === "2025" && r.yearStart === "2025-04-01");
  ok("distributable = 2000 − 5% reserve − 5% manager = 1800", r.distributable === 1800);
  const a = r.allocations.find((x) => x.memberId === "a");
  const b = r.allocations.find((x) => x.memberId === "b");
  // a: 10000 × 365; b: 10000 × 182 − 5000 × 121
  const wa = 10000 * 365, wb = 10000 * 182 - 5000 * 121;
  ok("contribution × time: opening balance counts for the whole year", near(a.profitShare, (1800 * wa) / (wa + wb), 0.02), a.profitShare);
  ok("contribution × time: withdrawals reduce the weight", near(b.profitShare, (1800 * wb) / (wa + wb), 0.02), b.profitShare);
  ok("member with no money gets nothing", !r.allocations.some((x) => x.memberId === "c"));
  ok("shares add up to distributable", near(a.profitShare + b.profitShare, 1800));
  ok("settlement = year-end balance + share", a.settlement === round(10000 + a.profitShare) && b.settlement === round(5000 + b.profitShare));

  const avg = ye(base, { profitDistribution: "average_contribution" });
  ok("average contribution splits like contribution × time", near(avg.allocations[0].profitShare, a.profitShare, 0.02));
  const cur = ye(base, { profitDistribution: "current_contribution" });
  ok("current contribution: 10000 vs 5000 → 1200 / 600", cur.allocations.map((x) => x.profitShare).join() === "1200,600");
  const eq = ye(base, { profitDistribution: "equal" });
  ok("equal: 900 each", eq.allocations.every((x) => x.profitShare === 900));
  const custom = ye(base, { profitDistribution: "custom" });
  ok("custom: nothing assigned until entered (no dump on first member)", custom.allocations.every((x) => x.profitShare === 0));

  const loss = ye([...base, ev({ date: "2025-07-01", type: "EXPENSE", amount: 3000 })]);
  ok("loss year: no reserve or manager charges", loss.grossProfit === -1000 && loss.reserve === 0 && loss.managerCharges === 0);

  // Saving the allocation (dated on year end) must not change this year's split
  const withAlloc = [...base, ...r.allocations.map((x) => ev({ date: FY, type: "PROFIT_ALLOCATION", memberId: x.memberId, amount: x.profitShare }))];
  const again = ye(withAlloc);
  ok("saved allocation doesn't change capital in the same year", again.allocations.find((x) => x.memberId === "a").capital === 10000);

  // Next year: retained profit becomes opening balance; settled members drop out
  const settled = [...withAlloc, ...r.allocations.map((x) => ev({ date: "2026-04-10", type: "MEMBER_SETTLEMENT", memberId: x.memberId, amount: x.settlement }))];
  const next = computeYearEnd(
    { events: [...settled, ev({ date: "2026-06-01", type: "INTEREST_PAYMENT", amount: 1000 })], members: [A, B, C], loans: [], rules: DEFAULT_RULES, yearEnds: [] },
    "2027-03-31"
  );
  ok("after full payout nobody has capital next year", next.allocations.every((x) => x.capital === 0));
}
{
  ok("calendar FY bounds", JSON.stringify(financialYearBounds(2026, "01-01")) === JSON.stringify({ yearStart: "2026-01-01", yearEndDate: "2026-12-31" }));
  ok("April FY bounds", financialYearBounds(2025, "04-01").yearEndDate === "2026-03-31");
  ok("bad FY start falls back to April", financialYearBounds(2025, "april").yearStart === "2025-04-01");
  ok("financialYearOf: Feb 2027 is FY 2026", financialYearOf("2027-02-10", "04-01") === 2026);
  const cal = computeYearEnd({ events: base, members: [A, B], loans: [], rules: { ...DEFAULT_RULES, financialYearStart: "01-01" }, yearEnds: [] }, "2025-12-31");
  ok("calendar FY covers one year only", cal.yearStart === "2025-01-01" && cal.year === "2025");
}

// ------------------------------------------------------------- Store
{
  let root = { version: 2, settings: {}, activeKopriId: "k", kopris: [{ ...createBook({ name: "T" }), id: "k" }] };
  root = rootReducer(root, { type: "ADD_MEMBER", member: { id: "a", name: "A" } });
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "L9" } });
  root = rootReducer(root, { type: "ADD_EVENT", event: { type: "LOAN_DISBURSEMENT", memberId: "a", loanId: "L9", amount: 12000, date: loan.startDate } });
  root = rootReducer(root, { type: "UPDATE_LOAN", id: "L9", patch: { principal: 15000, startDate: "2025-02-01" } });
  const d = root.kopris[0].events.find((e) => e.type === "LOAN_DISBURSEMENT");
  ok("editing a loan updates its disbursement entry", d.amount === 15000 && d.date === "2025-02-01");

  // legacy disbursement without loanId is matched and linked
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "L10", principal: 5000, startDate: "2025-03-01" } });
  root = rootReducer(root, { type: "ADD_EVENT", event: { type: "LOAN_DISBURSEMENT", memberId: "a", amount: 5000, date: "2025-03-01" } });
  root = rootReducer(root, { type: "UPDATE_LOAN", id: "L10", patch: { principal: 6000 } });
  const legacy = root.kopris[0].events.find((e) => e.type === "LOAN_DISBURSEMENT" && e.loanId === "L10");
  ok("legacy disbursement is linked and updated", legacy && legacy.amount === 6000);
}

function round(x) {
  return Math.round(x * 100) / 100;
}

console.log(failures ? `\n${failures} CALC TEST(S) FAILED` : "\nALL CALC TESTS PASSED");
process.exit(failures ? 1 : 0);
