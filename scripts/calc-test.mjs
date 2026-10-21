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
  deriveDeposits,
  depositDates,
  depositSummary,
  loanReferralError,
  computeLateCharges,
} from "../src/lib/calculations.js";
import { DEFAULT_RULES } from "../src/lib/constants.js";
import { rootReducer, createBook, normalizeBook } from "../src/state/kopriStore.js";

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
  root = rootReducer(root, { type: "ADD_MEMBER", member: { id: "r", name: "R" } });
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "L9", referredById: "r" } });
  root = rootReducer(root, { type: "ADD_EVENT", event: { type: "LOAN_DISBURSEMENT", memberId: "a", loanId: "L9", amount: 12000, date: loan.startDate } });
  root = rootReducer(root, { type: "UPDATE_LOAN", id: "L9", patch: { principal: 15000, startDate: "2025-02-01" } });
  const d = root.kopris[0].events.find((e) => e.type === "LOAN_DISBURSEMENT");
  ok("editing a loan updates its disbursement entry", d.amount === 15000 && d.date === "2025-02-01");

  // legacy disbursement without loanId is matched and linked
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "L10", referredById: "r", principal: 5000, startDate: "2025-03-01" } });
  root = rootReducer(root, { type: "ADD_EVENT", event: { type: "LOAN_DISBURSEMENT", memberId: "a", amount: 5000, date: "2025-03-01" } });
  root = rootReducer(root, { type: "UPDATE_LOAN", id: "L10", patch: { principal: 6000 } });
  const legacy = root.kopris[0].events.find((e) => e.type === "LOAN_DISBURSEMENT" && e.loanId === "L10");
  ok("legacy disbursement is linked and updated", legacy && legacy.amount === 6000);
}


// ---------------------------------------------------------- Deposits
{
  const rules = { ...DEFAULT_RULES, defaultMonthlyDeposit: 1000, depositDueDay: 1, depositDeadlineDay: 15 };
  const D = { id: "d", name: "D", status: "active", role: "depositor", joinedAt: "2025-01-10" };
  const dep = (o) => ev({ type: "MEMBER_CONTRIBUTION", memberId: "d", ...o });
  ok("deposit dates: due 1st, deadline 15th", JSON.stringify(depositDates("2025-02", rules)) === JSON.stringify({ dueDate: "2025-02-01", deadline: "2025-02-15" }));
  ok("deadline before due day falls next month", depositDates("2025-01", { ...rules, depositDueDay: 25, depositDeadlineDay: 5 }).deadline === "2025-02-05");
  ok("due day 31 clamps to February's end", depositDates("2025-02", { ...rules, depositDueDay: 31, depositDeadlineDay: 31 }).dueDate === "2025-02-28");

  const events = [
    dep({ date: "2025-01-05", amount: 50000, lumpSum: true, description: "Opening" }),
    dep({ date: "2025-01-12", amount: 1000 }),
    dep({ date: "2025-02-20", amount: 1000, depositMonth: "2025-02" }),
    dep({ date: "2025-03-10", amount: 400 }),
  ];
  const d = deriveDeposits(D, events, rules, "2025-04-20");
  const st = d.months.map((m) => m.status).join();
  ok("months run from joining to today", d.months.length === 4 && d.months[0].month === "2025-01", d.months.length);
  ok("lump sum is not counted as a monthly deposit", d.months[0].paid === 1000 && d.advance === 0, JSON.stringify(d.months[0]));
  ok("statuses: paid, paid late, late (partial), late", st === "paid,paid_late,late,late", st);
  ok("partial month shows what is left", d.months[2].paid === 400 && d.months[2].left === 600);
  ok("arrears = unpaid due months", d.arrears === 1600 && d.lateMonths === 2, `${d.arrears} ${d.lateMonths}`);
  ok("no late fee unless configured", d.lateFeesDue === 0);

  const early = deriveDeposits(D, events, rules, "2025-04-10");
  ok("current month is 'due' until the deadline", early.months[3].status === "due", early.months[3].status);
  const beforeDue = deriveDeposits(D, events, { ...rules, depositDueDay: 12, depositDeadlineDay: 20 }, "2025-04-10");
  ok("before the due day the month is 'upcoming'", beforeDue.months[3].status === "upcoming" && beforeDue.arrears === 600, `${beforeDue.months[3].status} ${beforeDue.arrears}`);

  const fixed = deriveDeposits(D, events, { ...rules, depositLateFeeType: "fixed", depositLateFeeFixed: 50 }, "2025-04-20");
  ok("fixed late fee per late month (incl. paid late)", fixed.lateFeesDue === 150, fixed.lateFeesDue);
  const withFee = [...events, ev({ type: "LATE_FEE", memberId: "d", loanId: "", depositMonth: "2025-02", amount: 50, date: "2025-02-20" })];
  const feePaid = deriveDeposits(D, withFee, { ...rules, depositLateFeeType: "fixed", depositLateFeeFixed: 50 }, "2025-04-20");
  ok("collected deposit late fee is netted off", feePaid.lateFeesDue === 100 && feePaid.months[1].lateFeeDue === 0, feePaid.lateFeesDue);
  const pct = deriveDeposits(D, events, { ...rules, depositLateFeeType: "percentage", depositLateFeePercent: 2 }, "2025-04-20");
  ok("percentage late fee = 2% of the month's deposit", pct.months[2].lateFee === 20);

  const extra = deriveDeposits(D, [...events, dep({ date: "2025-04-02", amount: 3000 })], rules, "2025-04-20");
  ok("untagged deposit pays oldest unpaid month first, rest is advance", extra.months[2].status === "paid_late" && extra.months[3].status === "paid" && extra.advance === 1400, `${extra.months.map((m) => m.status)} ${extra.advance}`);

  const own = deriveDeposits({ ...D, monthlyDeposit: 2500 }, events, rules, "2025-04-20");
  ok("member's own monthly amount overrides the Kopri default (March 400 tops up January)", own.amount === 2500 && own.months[0].left === 1100);
  const bor = deriveDeposits({ ...D, role: "borrower" }, events, rules, "2025-04-20");
  ok("borrowers have no deposit schedule", bor.months.length === 0);
  const gone = deriveDeposits({ ...D, status: "inactive", inactiveSince: "2025-02-28" }, events, rules, "2025-04-20");
  ok("inactive member's schedule stops when they left", gone.months.length === 2, gone.months.length);

  const sum = depositSummary({ members: [D, { ...D, id: "e", name: "E" }], events, rules }, "2025-03", "2025-04-20");
  ok("summary: expected, collected and unpaid for a month", sum.expected === 2000 && sum.collected === 400 && sum.unpaid.length === 2, JSON.stringify([sum.expected, sum.collected, sum.unpaid.length]));
}

// ---------------------------------------------------------- Referral rule
{
  const R = { id: "r", name: "R", status: "active", role: "depositor" };
  const X = { id: "x", name: "X", status: "active", role: "borrower" };
  const members = [R, X, { id: "i", name: "I", status: "inactive" }];
  ok("loan without referral is refused", loanReferralError({ memberId: "x" }, members) !== "");
  ok("non-member borrower referred by a depositor is fine", loanReferralError({ memberId: "x", referredById: "r" }, members) === "");
  ok("borrower can't refer themselves", loanReferralError({ memberId: "r", referredById: "r" }, members) !== "");
  ok("borrower-only person can't refer", loanReferralError({ memberId: "r", referredById: "x" }, members) !== "");
  ok("inactive member can't refer", loanReferralError({ memberId: "x", referredById: "i" }, members) !== "");
  ok("rule can be switched off", loanReferralError({ memberId: "x" }, members, { requireReferral: false }) === "");

  let root = { version: 2, settings: {}, activeKopriId: "k", kopris: [{ ...createBook({ name: "T" }), id: "k" }] };
  root = rootReducer(root, { type: "ADD_MEMBER", member: { id: "r", name: "R" } });
  root = rootReducer(root, { type: "ADD_MEMBER", member: { id: "x", name: "X", role: "borrower" } });
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "NOPE", memberId: "x" }, disbursement: {} });
  ok("store refuses a loan without referral (and books no cash)", root.kopris[0].loans.length === 0 && root.kopris[0].events.length === 0);
  root = rootReducer(root, { type: "ADD_LOAN", loan: { ...loan, id: "YES", memberId: "x", referredById: "r" }, disbursement: { account: "bank" } });
  const k = root.kopris[0];
  const dis = k.events.find((e) => e.type === "LOAN_DISBURSEMENT");
  ok("referred loan is added with its disbursement", k.loans.length === 1 && dis && dis.loanId === "YES" && dis.amount === 12000 && dis.account === "bank");
  ok("new loan carries the Kopri's late-fee amounts", k.loans[0].lateFixedPenalty === DEFAULT_RULES.lateFixedPenalty);
  root = rootReducer(root, { type: "ADD_MEMBER", member: { id: "o", name: "O" }, openingContribution: 5000 });
  ok("opening contribution is a lump sum, not a monthly deposit", root.kopris[0].events.some((e) => e.memberId === "o" && e.lumpSum));
  root = rootReducer(root, { type: "UPDATE_MEMBER", id: "o", patch: { status: "inactive" } });
  ok("marking inactive records when", !!root.kopris[0].members.find((m) => m.id === "o").inactiveSince);
}

// --------------------------------------------- Late fees building up on loans
{
  const L = { ...loan, lateRule: "fixed_penalty", lateFixedPenalty: 100 };
  const v = deriveLoan(L, [], "2025-04-01");
  // Feb 15, Mar 15 installments are past grace on Apr 1; the Apr 15 one isn't due yet.
  ok("fixed penalty accrues on each overdue installment", v.lateFeesDue === 200 && v.installments[0].lateFeeDue === 100, v.lateFeesDue);
  const paidFee = deriveLoan(L, [ev({ type: "LATE_FEE", loanId: "L1", amount: 100, installmentIndex: 0, date: "2025-03-30" })], "2025-04-01");
  ok("late fee already collected is netted off", paidFee.lateFeesDue === 100, paidFee.lateFeesDue);
  const pctLoan = deriveLoan({ ...loan, lateRule: "percentage_penalty", latePercentagePenalty: 2 }, [], "2025-03-01");
  ok("percentage penalty = 2% of overdue principal + interest", near(pctLoan.lateFeesDue, (1000 + 240) * 0.02), pctLoan.lateFeesDue);
  const ni = deriveLoan(loan, [], "2025-03-01");
  const expect = computeLateCharges(loan, ni.schedule[0], 1000, 240, "2025-03-01").total;
  ok("normal-interest late charge matches the pay screen", near(ni.lateFeesDue, expect) && expect > 0, `${ni.lateFeesDue} vs ${expect}`);
  ok("no late fees on a loan that is on time", deriveLoan(L, [], "2025-02-18").lateFeesDue === 0);

  const old = normalizeBook({ rules: { lateFixedPenalty: 75 }, loans: [{ id: "z" }], members: [], events: [] });
  ok("old books get new rules and loan late-fee amounts", old.rules.depositDeadlineDay === 15 && old.loans[0].lateFixedPenalty === 75);
}

// ------------------------------------------- Full manager year, end to end
// One calendar year run through the store exactly as the app does it, with
// the year-end numbers worked out by hand.
{
  const R = (root, action) => rootReducer(root, action);
  let root = { version: 2, settings: {}, activeKopriId: "k", kopris: [{ ...createBook({ name: "Y" }), id: "k" }] };
  root = R(root, {
    type: "UPDATE_RULES",
    rules: { financialYearStart: "01-01", managerChargesRate: 10, reserveRate: 5, profitDistribution: "contribution_x_time", defaultMonthlyDeposit: 1000, depositLateFeeType: "fixed", depositLateFeeFixed: 50 },
  });
  root = R(root, { type: "ADD_MEMBER", member: { id: "A", name: "A", joinedAt: "2025-01-01", depositStartMonth: "2025-01" } });
  root = R(root, { type: "ADD_MEMBER", member: { id: "B", name: "B", role: "both", joinedAt: "2025-01-01", depositStartMonth: "2025-01" } });
  root = R(root, { type: "ADD_MEMBER", member: { id: "X", name: "X", role: "borrower", joinedAt: "2025-01-01" } });
  const add = (event) => (root = R(root, { type: "ADD_EVENT", event }));
  for (let m = 1; m <= 12; m++) {
    const ym = `2025-${String(m).padStart(2, "0")}`;
    add({ type: "MEMBER_CONTRIBUTION", memberId: "A", amount: 1000, date: `${ym}-05`, depositMonth: ym });
    add({ type: "MEMBER_CONTRIBUTION", memberId: "B", amount: 1000, date: m === 3 ? `${ym}-20` : `${ym}-05`, depositMonth: ym });
  }
  add({ type: "LATE_FEE", memberId: "B", loanId: "", depositMonth: "2025-03", amount: 50, date: "2025-03-20" });

  // 12,000 to non-member X, referred by A: flat 5%/mo → 1,000 principal + 600 interest a month.
  const xl = { id: "XL", memberId: "X", referredById: "A", principal: 12000, rate: 5, rateUnit: "monthly", interestMethod: "flat", interestCollection: "monthly", principalRepayment: "monthly", startDate: "2025-01-01", tenureMonths: 12, gracePeriodDays: 5, lateRule: "fixed_penalty", status: "active" };
  root = R(root, { type: "ADD_LOAN", loan: { ...xl, referredById: "" }, disbursement: {} });
  ok("year: unreferred loan refused", root.kopris[0].loans.length === 0);
  root = R(root, { type: "ADD_LOAN", loan: xl, disbursement: {} });
  ok("year: referred loan to non-member booked", root.kopris[0].loans.length === 1);
  for (let i = 0; i < 10; i++) {
    const date = `2025-${String(i + 2).padStart(2, "0")}-01`;
    add({ type: "PRINCIPAL_PAYMENT", memberId: "X", loanId: "XL", amount: 1000, installmentIndex: i, date });
    add({ type: "INTEREST_PAYMENT", memberId: "X", loanId: "XL", amount: 600, installmentIndex: i, date });
  }
  add({ type: "LOAN_WRITE_OFF", memberId: "X", loanId: "XL", amount: 2000, date: "2025-12-20" });
  add({ type: "EXPENSE", amount: 500, date: "2025-06-10", description: "Stationery" });

  let book = root.kopris[0];
  const dA = deriveDeposits(book.members[0], book.events, book.rules, "2025-12-31");
  const dB = deriveDeposits(book.members[1], book.events, book.rules, "2025-12-31");
  ok("year: A paid every month on time", dA.months.length === 12 && dA.months.every((m) => m.status === "paid"));
  ok("year: B's March paid late, fee collected", dB.months[2].status === "paid_late" && dB.lateFeesDue === 0);
  ok("year: borrower X has no deposit schedule", deriveDeposits(book.members[2], book.events, book.rules, "2025-12-31").months.length === 0);
  const xv = deriveLoan(book.loans[0], book.events, "2025-12-31");
  ok("year: written-off loan is closed with no late fees", xv.effectiveStatus === "defaulted" && xv.outstandingPrincipal === 0 && xv.lateFeesDue === 0);

  // income 6,000 interest + 50 fee; costs 500 expense + 2,000 bad debt
  const ye = computeYearEnd(book, "2025-12-31");
  ok("year: gross profit = 6000 + 50 − 500 − 2000 = 3550", ye.grossProfit === 3550, ye.grossProfit);
  ok("year: reserve 5% = 177.50", ye.reserve === 177.5, ye.reserve);
  ok("year: manager's share 10% = 355", ye.managerCharges === 355, ye.managerCharges);
  ok("year: distributable = 3017.50", ye.distributable === 3017.5, ye.distributable);
  ok("year: shares add up exactly", near(ye.totalAllocated, 3017.5));
  ok("year: borrower X gets no profit", !ye.allocations.some((a) => a.memberId === "X"));
  const sA = ye.allocations.find((a) => a.memberId === "A").profitShare;
  const sB = ye.allocations.find((a) => a.memberId === "B").profitShare;
  ok("year: B's late March deposit earns slightly less than A", sA > sB && sB > 1400, `${sA} vs ${sB}`);
  const eq = computeYearEnd({ ...book, rules: { ...book.rules, profitDistribution: "equal" } }, "2025-12-31");
  ok("year: equal split gives 1508.75 each", eq.allocations.every((a) => a.profitShare === 1508.75));

  // cash: +24,000 deposits +50 fee −12,000 loan +10,000 principal +6,000 interest −500
  ok("year: cash before settlement = 27,550", deriveAccounts(book.events).total === 27550, deriveAccounts(book.events).total);
  root = R(root, { type: "SAVE_YEAR_END", yearEnd: ye });
  root = R(root, { type: "SETTLE_YEAR_END", year: "2025", date: "2026-01-05" });
  book = root.kopris[0];
  const mgr = book.events.find((e) => e.type === "MANAGER_PAYOUT");
  ok("year: settlement pays the manager's share", mgr && mgr.amount === 355);
  ok("year: after settlement only the reserve is left in cash", deriveAccounts(book.events).total === 177.5, deriveAccounts(book.events).total);
  ok("year: members fully paid out", book.members.filter((m) => m.role !== "borrower").every((m) => deriveMember(m, book.events, book.loans).entitlement === 0));
  const again = computeYearEnd(book, "2025-12-31");
  ok("year: settling doesn't change the saved year's profit", again.grossProfit === 3550 && again.managerCharges === 355);
}

function round(x) {
  return Math.round(x * 100) / 100;
}

console.log(failures ? `\n${failures} CALC TEST(S) FAILED` : "\nALL CALC TESTS PASSED");
process.exit(failures ? 1 : 0);
