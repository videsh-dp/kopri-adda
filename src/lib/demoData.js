// ---------------------------------------------------------------------------
// Demo data — seeds a realistic Kopri so the app opens with live-looking data.
// All dates are generated relative to "today" so the demo never goes stale.
// ---------------------------------------------------------------------------

import { DEFAULT_RULES } from "./constants.js";
import { todayISO, uid, round2 } from "./format.js";
import { buildSchedule } from "./calculations.js";

const today = todayISO();

function dateNDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateNMonthsAgo(months, day = 1) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildDemoState(name = "Sunrise Kopri") {
  const rules = { ...DEFAULT_RULES, kopriName: name, financialYearStart: "04-01" };

  const members = [
    { id: "m1", name: "Anita Fernandes", phone: "98220 12345", email: "anita.f@example.com", joinedAt: dateNMonthsAgo(14), status: "active", notes: "Founding member, keeps the books." },
    { id: "m2", name: "Rohit Naik", phone: "98221 23456", email: "rohit.naik@example.com", joinedAt: dateNMonthsAgo(14), status: "active", notes: "" },
    { id: "m3", name: "Priya Desai", phone: "98222 34567", email: "priya.desai@example.com", joinedAt: dateNMonthsAgo(14), status: "active", notes: "" },
    { id: "m4", name: "Manuel D'Souza", phone: "98223 45678", email: "manuel.dsouza@example.com", joinedAt: dateNMonthsAgo(12), status: "active", notes: "Owner of a bakery." },
    { id: "m5", name: "Sneha Kerkar", phone: "98224 56789", email: "sneha.k@example.com", joinedAt: dateNMonthsAgo(10), status: "active", notes: "" },
    { id: "m6", name: "Vijay Sawant", phone: "98225 67890", email: "vijay.s@example.com", joinedAt: dateNMonthsAgo(8), status: "active", notes: "" },
    { id: "m7", name: "Lata Kamat", phone: "98226 78901", email: "lata.k@example.com", joinedAt: dateNMonthsAgo(6), status: "inactive", notes: "Withdrew mid-year." },
  ];

  const loans = [
    {
      id: "l1",
      memberId: "m2",
      principal: 300000,
      rate: 2,
      rateUnit: "monthly",
      interestMethod: "reducing_balance",
      interestCollection: "monthly",
      principalRepayment: "monthly",
      startDate: dateNMonthsAgo(11),
      tenureMonths: 12,
      gracePeriodDays: 5,
      lateRule: "normal_interest",
      unpaidInterestRule: "carry_forward",
      status: "active",
      guarantorIds: ["m1"],
      security: "Gold jewellery (10g)",
      notes: "Bakery equipment purchase.",
    },
    {
      id: "l2",
      memberId: "m3",
      principal: 200000,
      rate: 2,
      rateUnit: "monthly",
      interestMethod: "flat",
      interestCollection: "monthly",
      principalRepayment: "monthly",
      startDate: dateNMonthsAgo(9),
      tenureMonths: 12,
      gracePeriodDays: 5,
      lateRule: "additional_interest",
      unpaidInterestRule: "separate_outstanding",
      status: "active",
      guarantorIds: ["m4"],
      security: "Property documents",
      notes: "",
    },
    {
      id: "l3",
      memberId: "m4",
      principal: 150000,
      rate: 2.5,
      rateUnit: "monthly",
      interestMethod: "reducing_balance",
      interestCollection: "monthly",
      principalRepayment: "monthly",
      startDate: dateNMonthsAgo(13),
      tenureMonths: 12,
      gracePeriodDays: 5,
      lateRule: "normal_interest",
      unpaidInterestRule: "carry_forward",
      status: "completed",
      guarantorIds: [],
      security: "",
      notes: "Fully repaid last year.",
    },
    {
      id: "l4",
      memberId: "m6",
      principal: 250000,
      rate: 2.5,
      rateUnit: "monthly",
      interestMethod: "reducing_balance",
      interestCollection: "monthly",
      principalRepayment: "monthly",
      startDate: dateNMonthsAgo(5),
      tenureMonths: 18,
      gracePeriodDays: 5,
      lateRule: "percentage_penalty",
      unpaidInterestRule: "carry_forward",
      status: "active",
      guarantorIds: ["m5"],
      security: "Two-wheeler + papers",
      notes: "Overdue: last 2 installments missed.",
    },
    {
      id: "l5",
      memberId: "m1",
      principal: 100000,
      rate: 2,
      rateUnit: "monthly",
      interestMethod: "flat",
      interestCollection: "quarterly",
      principalRepayment: "quarterly",
      startDate: dateNMonthsAgo(4),
      tenureMonths: 12,
      gracePeriodDays: 5,
      lateRule: "fixed_penalty",
      unpaidInterestRule: "carry_forward",
      status: "active",
      guarantorIds: ["m2"],
      security: "",
      notes: "Quarterly collection example.",
    },
  ];

  const events = [];

  const contribution = (memberId, amount, date, note) =>
    events.push({ id: uid("ev"), date, type: "MEMBER_CONTRIBUTION", memberId, amount, account: "cash", reference: "", description: note || "Monthly contribution", createdAt: `${date}T10:00:00.000Z` });

  // Founding contributions (14 months ago)
  contribution("m1", 50000, dateNMonthsAgo(14), "Opening contribution");
  contribution("m2", 50000, dateNMonthsAgo(14), "Opening contribution");
  contribution("m3", 50000, dateNMonthsAgo(14), "Opening contribution");

  // Monthly contributions — members contribute 5000/mo (m1-m3 since 14mo, m4 since 12mo, m5 since 10mo, m6 since 8mo, m7 since 6mo)
  const schedules = [
    ["m1", 14, 5000],
    ["m2", 14, 5000],
    ["m3", 14, 5000],
    ["m4", 12, 5000],
    ["m5", 10, 5000],
    ["m6", 8, 5000],
    ["m7", 6, 5000],
  ];
  for (const [mid, months, amt] of schedules) {
    for (let m = months - 1; m >= 0; m--) {
      contribution(mid, amt, dateNMonthsAgo(m, 2), "Monthly contribution");
    }
  }

  // Extra lump contributions
  contribution("m2", 100000, dateNMonthsAgo(11, 15), "Lump-sum deposit");
  contribution("m3", 50000, dateNMonthsAgo(9, 10), "Lump-sum deposit");
  contribution("m4", 50000, dateNMonthsAgo(8, 5), "Lump-sum deposit");
  contribution("m1", 50000, dateNMonthsAgo(3, 20), "Lump-sum deposit");

  // Withdrawals
  events.push({ id: uid("ev"), date: dateNMonthsAgo(5, 15), type: "MEMBER_WITHDRAWAL", memberId: "m7", amount: 30000, account: "cash", reference: "", description: "Partial withdrawal", createdAt: `${dateNMonthsAgo(5, 15)}T10:00:00.000Z` });

  // --- Loan disbursements ---
  const disburse = (loanId, memberId, amount, date, note) =>
    events.push({ id: uid("ev"), date, type: "LOAN_DISBURSEMENT", memberId, loanId, amount, account: "cash", reference: "", description: note || "Loan disbursement", createdAt: `${date}T10:00:00.000Z` });

  disburse("l1", "m2", 300000, dateNMonthsAgo(11, 5), "Loan disbursement — bakery equipment");
  disburse("l2", "m3", 200000, dateNMonthsAgo(9, 7), "Loan disbursement");
  disburse("l3", "m4", 150000, dateNMonthsAgo(13, 3), "Loan disbursement");
  disburse("l4", "m6", 250000, dateNMonthsAgo(5, 10), "Loan disbursement");
  disburse("l5", "m1", 100000, dateNMonthsAgo(4, 12), "Loan disbursement");

  // --- Repayments: generated from the same schedule engine the app uses,
  // so the demo data reconciles exactly with the repayment schedule.
  const repay = (loanId, memberId, date, principal, interest, lateFee = 0, installmentIndex) => {
    if (principal > 0)
      events.push({ id: uid("ev"), date, type: "PRINCIPAL_PAYMENT", memberId, loanId, amount: principal, account: "cash", reference: "", description: `Installment ${installmentIndex + 1} — principal`, createdAt: `${date}T10:00:00.000Z`, installmentIndex });
    if (interest > 0)
      events.push({ id: uid("ev"), date, type: "INTEREST_PAYMENT", memberId, loanId, amount: interest, account: "cash", reference: "", description: `Installment ${installmentIndex + 1} — interest`, createdAt: `${date}T10:00:00.000Z`, installmentIndex });
    if (lateFee > 0)
      events.push({ id: uid("ev"), date, type: "LATE_FEE", memberId, loanId, amount: lateFee, account: "cash", reference: "", description: `Installment ${installmentIndex + 1} — late fee`, createdAt: `${date}T10:00:00.000Z`, installmentIndex });
  };

  // Which installments have been paid for each loan (index into the schedule)
  const paidThrough = {
    l1: 10, // 11 of 12 installments paid (1 missed → overdue near the end)
    l2: 7, // 8 of 9 due installments paid (1 missed → overdue)
    l3: 11, // fully paid
    l4: 2, // 3 of 5 due installments paid (2 missed → overdue)
    l5: 2, // 1 of 2 due quarters paid (next quarter still current)
  };

  for (const l of loans) {
    const sched = buildSchedule(l);
    const paidCount = paidThrough[l.id] ?? 0;
    for (let i = 0; i <= paidCount && i < sched.length; i++) {
      const inst = sched[i];
      // pay on the due date itself (within grace period → on time)
      repay(l.id, l.memberId, inst.dueDate, inst.principalDue, inst.interestDue, 0, i);
    }
  }

  // --- Expenses & other income ---
  events.push({ id: uid("ev"), date: dateNMonthsAgo(6, 25), type: "EXPENSE", memberId: "", loanId: "", amount: 5000, account: "cash", reference: "", description: "Office rent (quarterly)", createdAt: `${dateNMonthsAgo(6, 25)}T10:00:00.000Z` });
  events.push({ id: uid("ev"), date: dateNMonthsAgo(2, 20), type: "EXPENSE", memberId: "", loanId: "", amount: 2000, account: "cash", reference: "", description: "Stationery & printing", createdAt: `${dateNMonthsAgo(2, 20)}T10:00:00.000Z` });
  events.push({ id: uid("ev"), date: dateNMonthsAgo(4, 5), type: "OTHER_INCOME", memberId: "", loanId: "", amount: 3500, account: "cash", reference: "", description: "Membership/registration fees", createdAt: `${dateNMonthsAgo(4, 5)}T10:00:00.000Z` });

  // --- Transfers ---
  const transfer = (from, to, amount, date, note) =>
    events.push({ id: uid("ev"), date, type: "TRANSFER", amount, from, to, account: from, reference: "", description: note, createdAt: `${date}T10:00:00.000Z` });

  transfer("cash", "bank", 300000, dateNMonthsAgo(7, 1), "Moved surplus to bank");
  transfer("cash", "bank", 100000, dateNMonthsAgo(2, 1), "Bank deposit");
  transfer("bank", "cash", 50000, dateNMonthsAgo(3, 1), "Withdrew for daily needs");

  // --- Last year's settlement (for yearEnds history) ---
  const lastYearEnd = `${new Date().getFullYear() - 1}-04-01`;
  events.push({ id: uid("ev"), date: lastYearEnd, type: "PROFIT_ALLOCATION", memberId: "m1", amount: 24000, account: "cash", reference: "", description: "FY profit allocation", createdAt: `${lastYearEnd}T10:00:00.000Z` });
  events.push({ id: uid("ev"), date: lastYearEnd, type: "PROFIT_ALLOCATION", memberId: "m2", amount: 24000, account: "cash", reference: "", description: "FY profit allocation", createdAt: `${lastYearEnd}T10:00:00.000Z` });
  events.push({ id: uid("ev"), date: lastYearEnd, type: "PROFIT_ALLOCATION", memberId: "m3", amount: 24000, account: "cash", reference: "", description: "FY profit allocation", createdAt: `${lastYearEnd}T10:00:00.000Z` });

  return {
    rules,
    members,
    loans,
    events,
    yearEnds: [
      {
        year: String(new Date().getFullYear() - 1),
        yearStart: `${new Date().getFullYear() - 1}-04-01`,
        yearEndDate: lastYearEnd,
        interestCollected: 128400,
        penaltiesCollected: 1200,
        otherIncome: 2500,
        expenses: 8400,
        badDebt: 0,
        grossProfit: 123700,
        reserve: 6185,
        managerCharges: 6185,
        distributable: 111330,
        allocations: [
          { memberId: "m1", capital: 118000, profitShare: 24000, settlement: 142000 },
          { memberId: "m2", capital: 118000, profitShare: 24000, settlement: 142000 },
          { memberId: "m3", capital: 118000, profitShare: 24000, settlement: 142000 },
          { memberId: "m4", capital: 65000, profitShare: 13222, settlement: 78222 },
          { memberId: "m5", capital: 35000, profitShare: 7122, settlement: 42122 },
        ],
        settled: false,
      },
    ],
  };
}