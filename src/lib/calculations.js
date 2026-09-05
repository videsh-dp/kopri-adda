// ---------------------------------------------------------------------------
// Kopri Manager — financial calculation engine (pure, UI-independent).
//
// Everything here is a pure function of (state). No React, no DOM, no storage.
// This is the module we will port 1:1 to Node.js + PostgreSQL later.
// ---------------------------------------------------------------------------

import {
  EVENT_TYPES,
  INTEREST_METHODS,
  INTEREST_COLLECTION,
  PRINCIPAL_REPAYMENT,
  CASH_SIGN,
  INCOME_EVENT_TYPES,
  EXPENSE_EVENT_TYPES,
  PROFIT_DISTRIBUTION,
  ACCOUNTS,
} from "./constants.js";
import { addMonthsISO, addDaysISO, daysBetween, todayISO, round2, monthsBetween, clamp } from "./format.js";

// ---------------------------------------------------------------------------
// Loan repayment schedule
// ---------------------------------------------------------------------------

export function monthlyRate(loan) {
  const rate = Number(loan.rate) || 0;
  return loan.rateUnit === "yearly" ? rate / 12 : rate;
}

// Days in a given month (approximates daily-outstanding interest for V1).
function daysInMonthISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function equalSplit(total, parts) {
  const base = Math.floor(total / parts);
  const out = Array(parts).fill(base);
  out[parts - 1] = total - base * (parts - 1);
  return out;
}

// Build the full repayment schedule for a loan.
// Returns [{ index, dueDate, principalDue, interestDue, totalDue }]
export function buildSchedule(loan) {
  const principal = Number(loan.principal) || 0;
  const tenure = Math.max(1, Math.min(Number(loan.tenureMonths) || 1, 600));
  const r = monthlyRate(loan) / 100;
  const method = loan.interestMethod || INTEREST_METHODS.REDUCING_BALANCE;
  const collection = loan.interestCollection || INTEREST_COLLECTION.MONTHLY;
  const repayment = loan.principalRepayment || PRINCIPAL_REPAYMENT.MONTHLY;

  const months = Array.from({ length: tenure }, (_, i) => ({
    index: i,
    dueDate: addMonthsISO(loan.startDate, i + 1),
  }));

  // --- Principal schedule ---
  let principalDue = Array(tenure).fill(0);
  if (repayment === PRINCIPAL_REPAYMENT.LUMP_SUM) {
    principalDue[tenure - 1] = principal;
  } else if (repayment === PRINCIPAL_REPAYMENT.QUARTERLY) {
    const quarterMonths = [];
    for (let i = 0; i < tenure; i++) {
      if ((i + 1) % 3 === 0 || i === tenure - 1) quarterMonths.push(i);
    }
    const chunks = equalSplit(principal, quarterMonths.length);
    quarterMonths.forEach((mi, qi) => {
      principalDue[mi] = chunks[qi];
    });
  } else {
    // monthly (default) or custom: monthly split
    const chunks = equalSplit(principal, tenure);
    principalDue = chunks;
  }
  // Custom override — a user-editable amount table stored on the loan.
  if (Array.isArray(loan.customPrincipalSchedule) && loan.customPrincipalSchedule.length === tenure) {
    const totalCustom = loan.customPrincipalSchedule.reduce((a, b) => a + Number(b) || 0, 0);
    if (Math.abs(totalCustom - principal) < 1) {
      principalDue = loan.customPrincipalSchedule.map((v) => Number(v) || 0);
    }
  }

  // --- Interest schedule ---
  // Flat: interest on the full principal, split across collection months.
  // Reducing/daily: interest on outstanding principal at period start.
  let interestDue = Array(tenure).fill(0);
  const isCollectionMonth = (i) =>
    collection === INTEREST_COLLECTION.MONTHLY ||
    (collection === INTEREST_COLLECTION.QUARTERLY && ((i + 1) % 3 === 0 || i === tenure - 1)) ||
    (collection === INTEREST_COLLECTION.AT_CLOSURE && i === tenure - 1);

  let outstanding = principal;
  let accrued = 0;
  for (let i = 0; i < tenure; i++) {
    let periodInterest;
    if (method === INTEREST_METHODS.FLAT) {
      periodInterest = principal * r;
    } else {
      // reducing balance / daily outstanding (daily approximated monthly)
      const days = daysInMonthISO(months[i].dueDate);
      periodInterest = outstanding * r * (days / 30);
    }
    accrued += periodInterest;
    if (isCollectionMonth(i)) {
      interestDue[i] = round2(accrued);
      accrued = 0;
    }
    outstanding = round2(outstanding - principalDue[i]);
  }

  return months.map((m, i) => ({
    index: i,
    dueDate: m.dueDate,
    principalDue: round2(principalDue[i]),
    interestDue: round2(interestDue[i]),
    totalDue: round2(principalDue[i] + interestDue[i]),
  }));
}

// ---------------------------------------------------------------------------
// Loan state derived from ledger events
// ---------------------------------------------------------------------------

const PAYMENT_TYPE_TO_KIND = {
  [EVENT_TYPES.PRINCIPAL_PAYMENT]: "principal",
  [EVENT_TYPES.INTEREST_PAYMENT]: "interest",
  [EVENT_TYPES.LATE_FEE]: "lateFee",
};

// Aggregate per-installment payments + loan totals from the ledger.
export function deriveLoan(loan, events, today = todayISO()) {
  const loanEvents = events.filter((e) => e.loanId === loan.id);
  const schedule = buildSchedule(loan);

  const totals = { principal: 0, interest: 0, lateFee: 0 };
  const perInstallment = schedule.map(() => ({ principal: 0, interest: 0, lateFee: 0 }));
  // Payments recorded without an installmentIndex (e.g. via the ledger form)
  // are attributed FIFO: earliest unpaid installment gets the money first.
  const unassigned = { principal: [], interest: [], lateFee: [] };

  for (const e of loanEvents) {
    const kind = PAYMENT_TYPE_TO_KIND[e.type];
    if (!kind) continue;
    const amount = Number(e.amount) || 0;
    totals[kind] += amount;
    const idx = e.installmentIndex;
    if (idx !== undefined && idx !== null && perInstallment[idx]) {
      perInstallment[idx][kind] += amount;
    } else {
      unassigned[kind].push(amount);
    }
  }

  // FIFO fallback: fill unpaid installments from oldest to newest
  for (const kind of ["principal", "interest", "lateFee"]) {
    let queue = unassigned[kind].slice();
    for (let i = 0; i < schedule.length && queue.length; i++) {
      const need = Math.max(0, schedule[i][`${kind}Due`] - perInstallment[i][kind]);
      if (need <= 0) continue;
      const take = Math.min(need, queue[0]);
      perInstallment[i][kind] += take;
      queue[0] -= take;
      if (queue[0] < 0.005) queue.shift();
    }
  }

  const principalPaid = round2(totals.principal);
  const interestPaid = round2(totals.interest);
  const lateFeesPaid = round2(totals.lateFee);
  const outstandingPrincipal = round2(Math.max(0, (Number(loan.principal) || 0) - principalPaid));

  const grace = Number(loan.gracePeriodDays) || 0;
  let overduePrincipal = 0;
  let overdueInterest = 0;
  let overdueDaysMax = 0;

  const installments = schedule.map((inst, i) => {
    const paid = perInstallment[i];
    const principalLeft = round2(Math.max(0, inst.principalDue - paid.principal));
    const interestLeft = round2(Math.max(0, inst.interestDue - paid.interest));
    const due = daysBetween(inst.dueDate, today);
    const overdue = principalLeft + interestLeft > 0.5 && due > grace;
    if (overdue) {
      overduePrincipal += principalLeft;
      overdueInterest += interestLeft;
      overdueDaysMax = Math.max(overdueDaysMax, due);
    }
    return {
      ...inst,
      principalPaid: round2(paid.principal),
      interestPaid: round2(paid.interest),
      lateFeePaid: round2(paid.lateFee),
      principalLeft: round2(principalLeft),
      interestLeft: round2(interestLeft),
      status: principalLeft + interestLeft <= 0.5 ? "paid" : overdue ? "overdue" : "due",
      overdueDays: overdue ? due : 0,
    };
  });

  const fullyPaid = outstandingPrincipal <= 0.5 && installments.every((i) => i.status === "paid");
  const isOverdue = overduePrincipal + overdueInterest > 0.5;

  return {
    ...loan,
    schedule,
    installments,
    principalPaid,
    interestPaid,
    lateFeesPaid,
    outstandingPrincipal,
    totalOutstanding: round2(outstandingPrincipal + overdueInterest),
    overduePrincipal: round2(overduePrincipal),
    overdueInterest: round2(overdueInterest),
    overdueDaysMax,
    isOverdue,
    fullyPaid,
    effectiveStatus: loan.status === "defaulted" ? "defaulted" : loan.status === "completed" || fullyPaid ? "completed" : isOverdue ? "overdue" : loan.status,
    totalInterestDue: round2(schedule.reduce((a, i) => a + i.interestDue, 0)),
    totalPrincipalDue: round2(schedule.reduce((a, i) => a + i.principalDue, 0)),
    paidRatio: (Number(loan.principal) || 0) > 0 ? clamp(principalPaid / Number(loan.principal), 0, 1) : 0,
  };
}

// ---------------------------------------------------------------------------
// Members — capital derived from events (never stored as a balance)
// ---------------------------------------------------------------------------

export function deriveMember(member, events, loans) {
  const memberEvents = events.filter((e) => e.memberId === member.id);
  let contributions = 0;
  let withdrawals = 0;
  let profitAllocated = 0;
  let settled = 0;
  let adjustments = 0;

  for (const e of memberEvents) {
    const amt = Number(e.amount) || 0;
    switch (e.type) {
      case EVENT_TYPES.CONTRIBUTION:
        contributions += amt;
        break;
      case EVENT_TYPES.WITHDRAWAL:
        withdrawals += amt;
        break;
      case EVENT_TYPES.PROFIT_ALLOCATION:
        profitAllocated += amt;
        break;
      case EVENT_TYPES.MEMBER_SETTLEMENT:
        settled += amt;
        break;
      case EVENT_TYPES.ADJUSTMENT:
        adjustments += e.sign === "negative" ? -amt : amt;
        break;
      default:
        break;
    }
  }

  const capital = round2(contributions - withdrawals);
  const entitlement = round2(capital + profitAllocated - settled);

  const memberLoans = loans
    .filter((l) => l.memberId === member.id)
    .map((l) => deriveLoan(l, events));

  return {
    ...member,
    contributions: round2(contributions),
    withdrawals: round2(withdrawals),
    profitAllocated: round2(profitAllocated),
    settled: round2(settled),
    adjustments,
    capital: round2(capital),
    entitlement: round2(entitlement),
    loanCount: memberLoans.length,
    activeLoans: memberLoans.filter((l) => l.effectiveStatus === "active" || l.effectiveStatus === "overdue").length,
    outstandingTotal: round2(memberLoans.reduce((a, l) => a + l.outstandingPrincipal, 0)),
    overdueTotal: round2(memberLoans.reduce((a, l) => a + l.overduePrincipal + l.overdueInterest, 0)),
  };
}

// ---------------------------------------------------------------------------
// Cash & bank — derived from events
// ---------------------------------------------------------------------------

export function deriveAccounts(events) {
  let cash = 0;
  let bank = 0;
  for (const e of events) {
    const amt = Number(e.amount) || 0;
    const sign = e.type === EVENT_TYPES.ADJUSTMENT ? (e.sign === "negative" ? -1 : 1) : CASH_SIGN[e.type] || 0;
    if (e.type === EVENT_TYPES.TRANSFER) {
      if (e.from === ACCOUNTS.CASH && e.to === ACCOUNTS.BANK) {
        cash -= amt;
        bank += amt;
      } else if (e.from === ACCOUNTS.BANK && e.to === ACCOUNTS.CASH) {
        bank -= amt;
        cash += amt;
      }
      continue;
    }
    const target = e.account === ACCOUNTS.BANK ? "bank" : "cash";
    if (target === "bank") bank += sign * amt;
    else cash += sign * amt;
  }
  return {
    cash: round2(cash),
    bank: round2(bank),
    total: round2(cash + bank),
  };
}

// ---------------------------------------------------------------------------
// Portfolio roll-ups
// ---------------------------------------------------------------------------

export function derivePortfolio(state) {
  const { loans, events, members } = state;
  const today = todayISO();
  const loanViews = loans.map((l) => deriveLoan(l, events, today));
  const memberViews = members.map((m) => deriveMember(m, events, loans));
  const accounts = deriveAccounts(events);

  const loansOutstanding = round2(loanViews.reduce((a, l) => a + l.outstandingPrincipal, 0));
  const interestReceivable = round2(loanViews.reduce((a, l) => a + l.overdueInterest, 0));
  const overdueAmount = round2(loanViews.reduce((a, l) => a + l.overduePrincipal + l.overdueInterest, 0));
  const totalCapital = round2(memberViews.reduce((a, m) => a + m.capital, 0));

  const interestReceived = round2(
    events.filter((e) => e.type === EVENT_TYPES.INTEREST_PAYMENT).reduce((a, e) => a + (Number(e.amount) || 0), 0)
  );
  const lateFeesCollected = round2(
    events.filter((e) => e.type === EVENT_TYPES.LATE_FEE).reduce((a, e) => a + (Number(e.amount) || 0), 0)
  );

  return {
    loanViews,
    memberViews,
    accounts,
    loansOutstanding,
    interestReceivable,
    overdueAmount,
    totalCapital,
    interestReceived,
    lateFeesCollected,
    activeLoans: loanViews.filter((l) => l.effectiveStatus === "active" || l.effectiveStatus === "overdue").length,
    completedLoans: loanViews.filter((l) => l.effectiveStatus === "completed").length,
    overdueLoans: loanViews.filter((l) => l.isOverdue).length,
    membersActive: members.filter((m) => m.status === "active").length,
    totalPoolAssets: round2(accounts.total + loansOutstanding),
  };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export function sortLedger(events) {
  return [...events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Year-end computation
// ---------------------------------------------------------------------------

export function computeYearEnd(state, yearEndDate) {
  const { events, members, rules, yearEnds } = state;
  // The financial year is named for the year it began: FY ending 2027-03-31
  // started on 2026-04-01, i.e. calendarYear(yearEnd) - 1 + financialYearStart.
  const fyYear = Number(yearEndDate.slice(0, 4)) - 1;
  const yearStart = `${fyYear}-${rules.financialYearStart}`;

  const inYear = (e) => e.date >= yearStart && e.date <= yearEndDate;

  const interestCollected = round2(events.filter((e) => inYear(e) && e.type === EVENT_TYPES.INTEREST_PAYMENT).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const penaltiesCollected = round2(events.filter((e) => inYear(e) && e.type === EVENT_TYPES.LATE_FEE).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const otherIncome = round2(events.filter((e) => inYear(e) && e.type === EVENT_TYPES.OTHER_INCOME).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const expenses = round2(events.filter((e) => inYear(e) && EXPENSE_EVENT_TYPES.includes(e.type)).reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const badDebt = round2(events.filter((e) => inYear(e) && e.type === EVENT_TYPES.LOAN_WRITE_OFF).reduce((a, e) => a + (Number(e.amount) || 0), 0));

  const grossProfit = round2(interestCollected + penaltiesCollected + otherIncome - expenses - badDebt);
  const reserve = round2((grossProfit * (Number(rules.reserveRate) || 0)) / 100);
  const managerCharges = round2((grossProfit * (Number(rules.managerChargesRate) || 0)) / 100);
  const distributable = round2(grossProfit - reserve - managerCharges);

  const memberViews = members.map((m) => deriveMember(m, events, state.loans));

  // Contribution × time for the year (weighted by days held)
  const yearDays = Math.max(1, daysBetween(yearStart, yearEndDate) + 1);
  const memberWeights = members.map((m) => {
    const contribs = events.filter((e) => inYear(e) && e.memberId === m.id && (e.type === EVENT_TYPES.CONTRIBUTION || e.type === EVENT_TYPES.WITHDRAWAL));
    let weighted = 0;
    for (const c of contribs) {
      const days = Math.max(0, daysBetween(c.date, yearEndDate) + 1);
      weighted += (Number(c.amount) || 0) * days;
    }
    return { memberId: m.id, weighted, days: yearDays, average: weighted / yearDays };
  });

  const totalWeighted = memberWeights.reduce((a, w) => a + w.weighted, 0);
  const totalCapital = memberViews.reduce((a, m) => a + m.capital, 0);
  const activeMembers = memberViews.filter((m) => m.capital > 0);

  const allocations = activeMembers.map((m) => {
    const w = memberWeights.find((x) => x.memberId === m.id) || { weighted: 0, average: 0 };
    let share = 0;
    switch (rules.profitDistribution) {
      case PROFIT_DISTRIBUTION.EQUAL:
        share = activeMembers.length ? distributable / activeMembers.length : 0;
        break;
      case PROFIT_DISTRIBUTION.CURRENT_CONTRIBUTION:
        share = totalCapital > 0 ? (distributable * m.capital) / totalCapital : 0;
        break;
      case PROFIT_DISTRIBUTION.AVERAGE_CONTRIBUTION:
        share = totalWeighted > 0 ? (distributable * w.average) / (totalWeighted / memberWeights.length || 1) : 0;
        break;
      case PROFIT_DISTRIBUTION.CONTRIBUTION_X_TIME:
        share = totalWeighted > 0 ? (distributable * w.weighted) / totalWeighted : 0;
        break;
      case PROFIT_DISTRIBUTION.CUSTOM:
        share = 0; // filled in from yearEnd record if present
        break;
      default:
        share = 0;
    }
    return {
      memberId: m.id,
      capital: m.capital,
      averageContribution: w.average,
      weighted: w.weighted,
      profitShare: round2(share),
      settlement: round2(m.capital + share),
    };
  });

  // Custom override allocations if this year already exists
  const existing = yearEnds?.find((y) => y.year === String(fyYear));
  if (existing && existing.allocations) {
    for (const a of allocations) {
      const custom = existing.allocations.find((x) => x.memberId === a.memberId);
      if (custom) a.profitShare = custom.profitShare;
    }
  }

  // Rounding adjustment: make allocations sum exactly to distributable
  const totalAllocated = round2(allocations.reduce((a, x) => a + x.profitShare, 0));
  if (allocations.length > 0 && Math.abs(totalAllocated - distributable) > 0.01) {
    const diff = round2(distributable - totalAllocated);
    allocations[0].profitShare = round2(allocations[0].profitShare + diff);
  }
  allocations.forEach((a) => {
    a.settlement = round2(a.capital + a.profitShare);
  });

  return {
    year: String(fyYear),
    yearStart,
    yearEndDate,
    interestCollected,
    penaltiesCollected,
    otherIncome,
    expenses,
    badDebt,
    grossProfit,
    reserve,
    managerCharges,
    distributable,
    allocations,
    memberWeights,
    totalCapital,
  };
}

// ---------------------------------------------------------------------------
// Reports helpers
// ---------------------------------------------------------------------------

export function reportOutstandingLoans(state) {
  const { loanViews } = derivePortfolio(state);
  return loanViews.filter((l) => l.outstandingPrincipal > 0.5).sort((a, b) => b.outstandingPrincipal - a.outstandingPrincipal);
}

export function reportOverdue(state) {
  const { loanViews } = derivePortfolio(state);
  return loanViews.filter((l) => l.isOverdue).sort((a, b) => b.overdueDaysMax - a.overdueDaysMax);
}

export function reportMembersByCapital(state) {
  const { memberViews } = derivePortfolio(state);
  return [...memberViews].sort((a, b) => b.capital - a.capital);
}

export function monthlyCashFlow(events, months = 12) {
  const today = todayISO();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = addMonthsISO(`${today.slice(0, 8)}01`, -i);
    buckets.push({
      month: start,
      inflows: 0,
      outflows: 0,
      net: 0,
    });
  }
  for (const e of events) {
    const bucket = buckets.find((b) => e.date.slice(0, 7) === b.month.slice(0, 7));
    if (!bucket) continue;
    const sign = e.type === EVENT_TYPES.ADJUSTMENT ? (e.sign === "negative" ? -1 : 1) : CASH_SIGN[e.type] || 0;
    const amt = Number(e.amount) || 0;
    if (e.type === EVENT_TYPES.TRANSFER) continue;
    if (sign > 0) bucket.inflows += amt;
    else if (sign < 0) bucket.outflows += amt;
  }
  return buckets.map((b) => ({ ...b, inflows: round2(b.inflows), outflows: round2(b.outflows), net: round2(b.inflows - b.outflows) }));
}

export function countEventsByType(events) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  return counts;
}

export function isIncomeType(t) {
  return INCOME_EVENT_TYPES.includes(t);
}

export function isExpenseType(t) {
  return EXPENSE_EVENT_TYPES.includes(t);
}