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
  LATE_RULES,
  LATE_RULE_LABELS,
  CASH_SIGN,
  INCOME_EVENT_TYPES,
  EXPENSE_EVENT_TYPES,
  PROFIT_DISTRIBUTION,
  ACCOUNTS,
  MEMBER_ROLES,
  DEPOSIT_LATE_FEE,
  DEFAULT_RULES,
  UNPAID_INTEREST_RULES,
  UNPAID_INTEREST_EVENT,
} from "./constants.js";
import { addMonthsISO, addDaysISO, daysBetween, todayISO, round2, monthsBetween, clamp } from "./format.js";

// ---------------------------------------------------------------------------
// Loan repayment schedule
// ---------------------------------------------------------------------------

export function monthlyRate(loan) {
  const rate = Number(loan.rate) || 0;
  return loan.rateUnit === "yearly" ? rate / 12 : rate;
}

function equalSplit(total, parts) {
  const base = Math.floor(total / parts);
  const out = Array(parts).fill(base);
  out[parts - 1] = total - base * (parts - 1);
  return out;
}

// Build the full repayment schedule for a loan.
// Returns [{ index, dueDate, principalDue, interestDue, totalDue }]
// `capitalized` lists unpaid interest added to principal at a year end
// ([{ date, amount }]): it is repaid over the installments due after that
// date (or with the last one if none are left), and bears interest from the
// next period on.
export function buildSchedule(loan, capitalized = []) {
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
    const totalCustom = loan.customPrincipalSchedule.reduce((a, b) => a + (Number(b) || 0), 0);
    if (Math.abs(totalCustom - principal) < 1) {
      principalDue = loan.customPrincipalSchedule.map((v) => Number(v) || 0);
    }
  }

  // Capitalized interest becomes principal due on the remaining installments.
  for (const c of capitalized) {
    const amount = Number(c.amount) || 0;
    if (amount <= 0) continue;
    const rest = months.filter((m) => m.dueDate > c.date).map((m) => m.index);
    const targets = rest.length ? rest : [tenure - 1];
    const each = round2(amount / targets.length);
    targets.forEach((idx, k) => {
      principalDue[idx] += k === targets.length - 1 ? round2(amount - each * (targets.length - 1)) : each;
    });
  }
  const capitalizedBy = (iso) => capitalized.reduce((a, c) => a + (c.date <= iso ? Number(c.amount) || 0 : 0), 0);

  // --- Interest schedule ---
  // Flat: interest on the full principal, split across collection months.
  // Reducing: outstanding principal at period start × monthly rate.
  // Daily: same, pro-rated by the actual days in the period ÷ 30.
  let interestDue = Array(tenure).fill(0);
  const isCollectionMonth = (i) =>
    collection === INTEREST_COLLECTION.MONTHLY ||
    (collection === INTEREST_COLLECTION.QUARTERLY && ((i + 1) % 3 === 0 || i === tenure - 1)) ||
    (collection === INTEREST_COLLECTION.AT_CLOSURE && i === tenure - 1);

  const monthlyRatePct = monthlyRate(loan);
  const working = [];
  let outstanding = principal;
  let capAdded = 0;
  let accrued = 0;
  for (let i = 0; i < tenure; i++) {
    const periodStart = i === 0 ? loan.startDate : months[i - 1].dueDate;
    const days = daysBetween(periodStart, months[i].dueDate);
    // Interest capitalized on or before this period's start now bears interest.
    const capToDate = capitalizedBy(periodStart);
    if (capToDate > capAdded) {
      outstanding = round2(outstanding + capToDate - capAdded);
      capAdded = capToDate;
    }
    const outstandingBefore = outstanding;
    const carriedIn = accrued;
    let periodInterest;
    if (method === INTEREST_METHODS.FLAT) {
      periodInterest = (principal + capitalizedBy(periodStart)) * r;
    } else if (method === INTEREST_METHODS.DAILY_OUTSTANDING) {
      periodInterest = outstanding * r * (days / 30);
    } else {
      periodInterest = outstanding * r;
    }
    accrued += periodInterest;
    if (isCollectionMonth(i)) {
      interestDue[i] = round2(accrued);
      accrued = 0;
    }
    working[i] = {
      outstandingBefore: round2(outstandingBefore),
      daysInPeriod: days,
      monthlyRatePct,
      periodInterest: round2(periodInterest),
      carriedIn: round2(carriedIn),
      interestMethod: method,
    };
    outstanding = round2(outstanding - principalDue[i]);
  }

  return months.map((m, i) => ({
    index: i,
    dueDate: m.dueDate,
    principalDue: round2(principalDue[i]),
    interestDue: round2(interestDue[i]),
    totalDue: round2(principalDue[i] + interestDue[i]),
    ...working[i],
  }));
}

// Split a payment amount into principal + interest legs given each side's
// outstanding balance. Interest due is cleared first, then principal; any
// overflow beyond both is an extra principal prepayment (included in
// `principal`, and shown separately as `extra`).
export function splitPayAmount(amount, principalLeft, interestLeft) {
  const amt = Math.max(Number(amount) || 0, 0);
  const interest = Math.min(amt, Math.max(interestLeft, 0));
  const due = Math.min(amt - interest, Math.max(principalLeft, 0));
  const extra = Math.max(amt - interest - due, 0);
  return { principal: round2(due + extra), interest: round2(interest), extra: round2(extra) };
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
const INTEREST_TREATMENT_TYPES = [EVENT_TYPES.INTEREST_CAPITALIZED, EVENT_TYPES.INTEREST_TO_ARREARS, EVENT_TYPES.INTEREST_WAIVED];

export function deriveLoan(loan, events, today = todayISO()) {
  const loanEvents = events.filter((e) => e.loanId === loan.id);
  const treatments = loanEvents.filter((e) => INTEREST_TREATMENT_TYPES.includes(e.type));
  const capitalized = treatments
    .filter((e) => e.type === EVENT_TYPES.INTEREST_CAPITALIZED)
    .map((e) => ({ date: e.date, amount: Number(e.amount) || 0 }));
  const schedule = buildSchedule(loan, capitalized);

  const totals = { principal: 0, interest: 0, lateFee: 0 };
  const treated = { capitalized: 0, arrears: 0, waived: 0 };
  let writtenOff = 0;
  let arrearsPaid = 0;
  const perInstallment = schedule.map(() => ({ principal: 0, interest: 0, lateFee: 0, interestCleared: 0 }));
  // Payments recorded without an installmentIndex (e.g. via the ledger form)
  // are attributed FIFO: earliest unpaid installment gets the money first.
  const unassigned = { principal: [], interest: [], lateFee: [] };

  // Year-end treatments settle the interest on the installments they name
  // without any cash: it was capitalized, moved to arrears, or waived.
  for (const e of treatments) {
    const amount = Number(e.amount) || 0;
    if (e.type === EVENT_TYPES.INTEREST_CAPITALIZED) treated.capitalized += amount;
    else if (e.type === EVENT_TYPES.INTEREST_TO_ARREARS) treated.arrears += amount;
    else treated.waived += amount;
    for (const a of e.allocations || []) {
      const slot = perInstallment[a.index];
      if (!slot) continue;
      const amt = Number(a.amount) || 0;
      slot.interest += amt;
      slot.interestCleared += amt;
    }
  }

  for (const e of loanEvents) {
    // Payments against interest arrears clear the arrears balance first.
    if (e.type === EVENT_TYPES.INTEREST_PAYMENT && e.arrears) {
      const amount = Number(e.amount) || 0;
      totals.interest += amount;
      const take = Math.min(amount, Math.max(0, treated.arrears - arrearsPaid));
      arrearsPaid += take;
      if (amount - take > 0.005) unassigned.interest.push(amount - take);
      continue;
    }
    if (e.type === EVENT_TYPES.LOAN_WRITE_OFF) {
      writtenOff += Number(e.amount) || 0;
      continue;
    }
    const kind = PAYMENT_TYPE_TO_KIND[e.type];
    if (!kind) continue;
    const amount = Number(e.amount) || 0;
    totals[kind] += amount;
    const idx = e.installmentIndex;
    if (idx !== undefined && idx !== null && perInstallment[idx]) {
      if (kind === "lateFee") {
        perInstallment[idx].lateFee += amount;
        continue;
      }
      // Anything beyond what this installment still needs is a prepayment:
      // it flows FIFO into the next unpaid installments.
      const need = Math.max(0, schedule[idx][`${kind}Due`] - perInstallment[idx][kind]);
      const take = Math.min(need, amount);
      perInstallment[idx][kind] += take;
      if (amount - take > 0.005) unassigned[kind].push(amount - take);
    } else if (kind !== "lateFee") {
      unassigned[kind].push(amount);
    }
  }

  // FIFO fallback: fill unpaid installments from oldest to newest.
  // Late fees have no schedule, so untagged ones only count toward totals.
  for (const kind of ["principal", "interest"]) {
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
  const principalWrittenOff = round2(writtenOff);
  const interestCapitalized = round2(treated.capitalized);
  const totalPrincipal = round2((Number(loan.principal) || 0) + interestCapitalized);
  const interestArrears = round2(Math.max(0, treated.arrears - arrearsPaid));
  const outstandingPrincipal = round2(Math.max(0, totalPrincipal - principalPaid - principalWrittenOff));
  const isWrittenOff = principalWrittenOff > 0.5 && outstandingPrincipal <= 0.5;

  const grace = Number(loan.gracePeriodDays) || 0;
  let overduePrincipal = 0;
  let overdueInterest = 0;
  let overdueDaysMax = 0;

  const installments = schedule.map((inst, i) => {
    const paid = perInstallment[i];
    const principalLeft = round2(Math.max(0, inst.principalDue - paid.principal));
    const interestLeft = round2(Math.max(0, inst.interestDue - paid.interest));
    const due = daysBetween(inst.dueDate, today);
    const overdue = !isWrittenOff && principalLeft + interestLeft > 0.5 && due > grace;
    if (overdue) {
      overduePrincipal += principalLeft;
      overdueInterest += interestLeft;
      overdueDaysMax = Math.max(overdueDaysMax, due);
    }
    // Late charges built up so far on what is still unpaid, less any late
    // fee already collected on this installment.
    const lateCharges = overdue ? computeLateCharges(loan, inst, principalLeft, interestLeft, today).total : 0;
    const lateFeeDue = round2(Math.max(0, lateCharges - paid.lateFee));
    return {
      ...inst,
      principalPaid: round2(paid.principal),
      interestPaid: round2(paid.interest - paid.interestCleared),
      interestCleared: round2(paid.interestCleared),
      lateFeePaid: round2(paid.lateFee),
      lateFeeDue,
      principalLeft: round2(principalLeft),
      interestLeft: round2(interestLeft),
      status: principalLeft + interestLeft <= 0.5 ? "paid" : isWrittenOff ? "written_off" : overdue ? "overdue" : "due",
      overdueDays: overdue ? due : 0,
    };
  });

  const fullyPaid =
    !isWrittenOff && outstandingPrincipal <= 0.5 && interestArrears <= 0.5 && installments.every((i) => i.status === "paid");
  const isOverdue = overduePrincipal + overdueInterest > 0.5;

  return {
    ...loan,
    schedule,
    installments,
    principalPaid,
    interestPaid,
    lateFeesPaid,
    lateFeesDue: round2(installments.reduce((a, i) => a + i.lateFeeDue, 0)),
    principalWrittenOff,
    isWrittenOff,
    interestCapitalized,
    interestToArrears: round2(treated.arrears),
    interestArrears,
    interestWaived: round2(treated.waived),
    totalPrincipal,
    outstandingPrincipal,
    totalOutstanding: round2(outstandingPrincipal + overdueInterest + interestArrears),
    overduePrincipal: round2(overduePrincipal),
    overdueInterest: round2(overdueInterest),
    overdueDaysMax,
    isOverdue,
    fullyPaid,
    effectiveStatus:
      loan.status === "defaulted" || isWrittenOff
        ? "defaulted"
        : loan.status === "completed" || fullyPaid
          ? "completed"
          : isOverdue
            ? "overdue"
            : loan.status,
    totalInterestDue: round2(schedule.reduce((a, i) => a + i.interestDue, 0)),
    totalPrincipalDue: round2(schedule.reduce((a, i) => a + i.principalDue, 0)),
    paidRatio: totalPrincipal > 0 ? clamp(principalPaid / totalPrincipal, 0, 1) : 0,
  };
}

// ---------------------------------------------------------------------------
// Late-payment charges (per the loan's late rule) as of a given date
// ---------------------------------------------------------------------------

// Charges accrued on one installment as of `asOf`, following loan.lateRule.
// Late interest accrues on the outstanding principal for the days beyond the
// due date + grace period; fixed/percentage penalties follow the rule table.
export function computeLateCharges(loan, inst, principalLeft, interestLeft, asOf = todayISO()) {
  const graceDays = Number(loan.gracePeriodDays) || 0;
  const calendarDays = daysBetween(inst.dueDate, asOf);
  const chargeableDays = calendarDays - graceDays;
  const principalBase = round2(Math.max(principalLeft, 0));
  const interestBase = round2(Math.max(interestLeft, 0));
  const overdueBase = round2(principalBase + interestBase);
  const monthlyRatePct = monthlyRate(loan);
  const addRate = Number(loan.lateAdditionalInterestRate) || 0;
  const empty = {
    isLate: false,
    daysLate: 0,
    calendarDays: Math.max(calendarDays, 0),
    graceDays,
    chargeableDays: 0,
    monthsLate: 0,
    graceEnds: addDaysISO(inst.dueDate, graceDays),
    dueDate: inst.dueDate,
    asOf,
    lateInterest: 0,
    penalty: 0,
    total: 0,
    rateLabel: "",
    pct: 0,
    penaltyBase: 0,
    fixedFlat: 0,
    monthlyRatePct,
    addRate,
    combinedRate: monthlyRatePct,
    principalBase,
    overdueBase,
    lateRule: loan.lateRule,
    lateRuleLabel: LATE_RULE_LABELS[loan.lateRule] || loan.lateRule,
  };
  if (chargeableDays <= 0 || overdueBase <= 0.5) return empty;

  const monthsLate = chargeableDays / 30;
  let lateInterest = 0;
  let penalty = 0;
  let rateLabel = "";
  let pct = 0;
  let penaltyBase = 0;
  let fixedFlat = 0;
  let combinedRate = monthlyRatePct;

  switch (loan.lateRule) {
    case LATE_RULES.ADDITIONAL_INTEREST: {
      combinedRate = monthlyRatePct + addRate;
      lateInterest = round2(principalBase * (combinedRate / 100) * monthsLate);
      rateLabel = `${monthlyRatePct}% + ${addRate}%/mo`;
      break;
    }
    case LATE_RULES.NORMAL_INTEREST:
      lateInterest = round2(principalBase * (monthlyRatePct / 100) * monthsLate);
      rateLabel = `${monthlyRatePct}%/mo`;
      break;
    case LATE_RULES.FIXED_PENALTY:
      fixedFlat = round2(Number(loan.lateFixedPenalty) || 0);
      penalty = fixedFlat;
      break;
    case LATE_RULES.PERCENTAGE_PENALTY:
      pct = Number(loan.latePercentagePenalty) || 0;
      penaltyBase = overdueBase;
      penalty = round2(overdueBase * (pct / 100));
      break;
    case LATE_RULES.GRACE_ONLY:
    default:
      break; // grace covers it — no extra charges
  }

  return {
    ...empty,
    isLate: true,
    daysLate: chargeableDays,
    chargeableDays,
    monthsLate,
    lateInterest,
    penalty,
    total: round2(lateInterest + penalty),
    rateLabel,
    pct,
    penaltyBase,
    fixedFlat,
    combinedRate,
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

  // Settlement payouts use up allocated profit first, then capital, so after a
  // full year-end settlement both capital and entitlement are back to zero.
  const capital = round2(contributions - withdrawals - Math.max(0, settled - profitAllocated));
  const entitlement = round2(contributions - withdrawals + profitAllocated - settled);

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

// Signed effect of one event on the pool's cash + bank total (transfers are 0).
export function cashDelta(e) {
  const amt = Number(e.amount) || 0;
  if (e.type === EVENT_TYPES.ADJUSTMENT) return e.sign === "negative" ? -amt : amt;
  return (CASH_SIGN[e.type] || 0) * amt;
}

export function deriveAccounts(events) {
  let cash = 0;
  let bank = 0;
  for (const e of events) {
    const amt = Number(e.amount) || 0;
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
    if (target === "bank") bank += cashDelta(e);
    else cash += cashDelta(e);
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
  const lateFeesDue = round2(loanViews.reduce((a, l) => a + l.lateFeesDue, 0));

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
    lateFeesDue,
    activeLoans: loanViews.filter((l) => l.effectiveStatus === "active" || l.effectiveStatus === "overdue").length,
    completedLoans: loanViews.filter((l) => l.effectiveStatus === "completed").length,
    overdueLoans: loanViews.filter((l) => l.isOverdue).length,
    membersActive: members.filter((m) => m.status === "active").length,
    depositorsActive: members.filter((m) => m.status === "active" && isDepositor(m)).length,
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

// Financial-year bounds for the FY that starts in `fyYear` (e.g. 2025 with
// financialYearStart "04-01" → 2025-04-01 … 2026-03-31).
export function financialYearBounds(fyYear, financialYearStart = "04-01") {
  const start = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(financialYearStart || "") ? financialYearStart : "04-01";
  const yearStart = `${fyYear}-${start}`;
  return { yearStart, yearEndDate: addDaysISO(addMonthsISO(yearStart, 12), -1) };
}

// Change to a member's balance with the pool from one event (money they are
// owed: deposits and retained profit, less withdrawals and payouts).
function memberBalanceDelta(e) {
  const amt = Number(e.amount) || 0;
  switch (e.type) {
    case EVENT_TYPES.CONTRIBUTION:
    case EVENT_TYPES.PROFIT_ALLOCATION:
      return amt;
    case EVENT_TYPES.WITHDRAWAL:
    case EVENT_TYPES.MEMBER_SETTLEMENT:
      return -amt;
    default:
      return 0;
  }
}

export function computeYearEnd(state, yearEndDate, { interestActions = {} } = {}) {
  const { events, members, rules, yearEnds } = state;
  // The FY is named for the year it began; it ends the day before the same
  // date one year after it starts.
  const yearStart = addDaysISO(addMonthsISO(yearEndDate, -12), 1);
  const fyYear = Number(yearStart.slice(0, 4));

  const inYear = (e) => e.date >= yearStart && e.date <= yearEndDate;
  const sumInYear = (types) =>
    round2(events.filter((e) => inYear(e) && types.includes(e.type)).reduce((a, e) => a + (Number(e.amount) || 0), 0));

  const interestCollected = sumInYear([EVENT_TYPES.INTEREST_PAYMENT]);
  const penaltiesCollected = sumInYear([EVENT_TYPES.LATE_FEE]);
  const otherIncome = sumInYear([EVENT_TYPES.OTHER_INCOME]);
  const expenses = sumInYear(EXPENSE_EVENT_TYPES);
  const badDebt = sumInYear([EVENT_TYPES.LOAN_WRITE_OFF]);

  const grossProfit = round2(interestCollected + penaltiesCollected + otherIncome - expenses - badDebt);
  // Reserve and manager's charges only come out of a profit, never a loss.
  const reserve = grossProfit > 0 ? round2((grossProfit * (Number(rules.reserveRate) || 0)) / 100) : 0;
  const managerCharges = grossProfit > 0 ? round2((grossProfit * (Number(rules.managerChargesRate) || 0)) / 100) : 0;
  const distributable = round2(grossProfit - reserve - managerCharges);

  // Each member's balance with the pool through the year: opening balance
  // held all year, then every in-year movement weighted by the days it was
  // held up to year end. This year's own profit allocation (dated on the
  // year-end date) is excluded so saving it doesn't change the split.
  const yearDays = Math.max(1, daysBetween(yearStart, yearEndDate) + 1);
  const isThisYearsAllocation = (e) => e.type === EVENT_TYPES.PROFIT_ALLOCATION && e.date === yearEndDate;
  const memberWeights = members.map((m) => {
    let opening = 0;
    let closing = 0;
    let weighted = 0;
    for (const e of events) {
      if (e.memberId !== m.id || e.date > yearEndDate || isThisYearsAllocation(e)) continue;
      const delta = memberBalanceDelta(e);
      if (!delta) continue;
      closing += delta;
      if (e.date < yearStart) opening += delta;
      else weighted += delta * (daysBetween(e.date, yearEndDate) + 1);
    }
    weighted = Math.max(0, weighted + opening * yearDays);
    return {
      memberId: m.id,
      opening: round2(opening),
      capital: round2(Math.max(0, closing)),
      weighted,
      days: yearDays,
      average: weighted / yearDays,
    };
  });

  const eligible = memberWeights.filter((w) => w.capital > 0.5 || w.weighted > 0.5);
  const totalWeighted = eligible.reduce((a, w) => a + w.weighted, 0);
  const totalAverage = eligible.reduce((a, w) => a + w.average, 0);
  const totalCapital = round2(eligible.reduce((a, w) => a + w.capital, 0));
  const withCapital = eligible.filter((w) => w.capital > 0.5);
  const method = rules.profitDistribution;

  const allocations = eligible.map((w) => {
    let share = 0;
    switch (method) {
      case PROFIT_DISTRIBUTION.EQUAL:
        share = w.capital > 0.5 && withCapital.length ? distributable / withCapital.length : 0;
        break;
      case PROFIT_DISTRIBUTION.CURRENT_CONTRIBUTION:
        share = totalCapital > 0 ? (distributable * w.capital) / totalCapital : 0;
        break;
      case PROFIT_DISTRIBUTION.AVERAGE_CONTRIBUTION:
        share = totalAverage > 0 ? (distributable * w.average) / totalAverage : 0;
        break;
      case PROFIT_DISTRIBUTION.CONTRIBUTION_X_TIME:
        share = totalWeighted > 0 ? (distributable * w.weighted) / totalWeighted : 0;
        break;
      default:
        share = 0; // custom: entered by hand on the year-end page
    }
    return {
      memberId: w.memberId,
      capital: w.capital,
      averageContribution: w.average,
      weighted: w.weighted,
      profitShare: round2(share),
      settlement: 0,
    };
  });

  // Saved allocations (and custom shares) win over the computed ones
  const existing = yearEnds?.find((y) => y.year === String(fyYear));
  if (existing && existing.allocations) {
    for (const a of allocations) {
      const saved = existing.allocations.find((x) => x.memberId === a.memberId);
      if (saved) a.profitShare = Number(saved.profitShare) || 0;
    }
  }

  // Rounding: make computed shares sum exactly to distributable by putting the
  // paise left over on the largest share. Custom splits are left as entered.
  if (method !== PROFIT_DISTRIBUTION.CUSTOM && !existing && allocations.length > 0) {
    const diff = round2(distributable - allocations.reduce((a, x) => a + x.profitShare, 0));
    if (Math.abs(diff) >= 0.01 && Math.abs(diff) < 1) {
      const largest = allocations.reduce((best, x) => (x.profitShare > best.profitShare ? x : best), allocations[0]);
      largest.profitShare = round2(largest.profitShare + diff);
    }
  }
  allocations.forEach((a) => {
    a.settlement = round2(a.capital + a.profitShare);
  });
  const totalAllocated = round2(allocations.reduce((a, x) => a + x.profitShare, 0));

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
    totalAllocated,
    allocations,
    memberWeights,
    // Recorded with the allocation once saved; previewed until then.
    unpaidInterest: existing?.unpaidInterest ?? unpaidInterestAtYearEnd(state, yearEndDate, interestActions),
    totalCapital,
  };
}

// Interest that fell due on or before the year-end date and is still unpaid,
// per loan, with what each loan's "unpaid interest at year end" rule does
// with it. Profit is cash-based, so none of this changes the year's profit;
// it changes what the borrower owes from then on. `actions` (loanId → rule)
// holds the choices made by hand for loans set to "manual".
export function unpaidInterestAtYearEnd(state, yearEndDate, actions = {}) {
  const { loans, events, rules } = state;
  const fyYear = String(addDaysISO(addMonthsISO(yearEndDate, -12), 1).slice(0, 4));
  // Leave out this year's own treatment entries so the list stays the same
  // after it has been applied.
  const asOf = events.filter((e) => e.date <= yearEndDate && !(INTEREST_TREATMENT_TYPES.includes(e.type) && e.yearEnd === fyYear));
  const out = [];
  for (const loan of loans) {
    if (!loan.startDate || loan.startDate > yearEndDate) continue;
    const d = deriveLoan(loan, asOf, yearEndDate);
    if (d.isWrittenOff) continue;
    const allocations = d.installments
      .filter((i) => i.dueDate <= yearEndDate && i.interestLeft > 0.005)
      .map((i) => ({ index: i.index, amount: i.interestLeft }));
    const amount = round2(allocations.reduce((a, x) => a + x.amount, 0));
    if (amount < 0.5) continue;
    const rule = loan.unpaidInterestRule || rules?.unpaidInterestRule || UNPAID_INTEREST_RULES.CARRY_FORWARD;
    const action =
      rule === UNPAID_INTEREST_RULES.MANUAL ? actions[loan.id] || UNPAID_INTEREST_RULES.CARRY_FORWARD : rule;
    out.push({ loanId: loan.id, memberId: loan.memberId, amount, rule, action, allocations });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// The ledger entries that apply year-end unpaid-interest treatments (carry
// forward needs none). Non-cash; tagged with the FY so a re-save replaces them.
export function unpaidInterestEvents(unpaid, year, yearEndDate) {
  return unpaid
    .filter((u) => UNPAID_INTEREST_EVENT[u.action])
    .map((u) => ({
      type: UNPAID_INTEREST_EVENT[u.action],
      date: yearEndDate,
      memberId: u.memberId,
      loanId: u.loanId,
      amount: u.amount,
      allocations: u.allocations,
      yearEnd: String(year),
      account: "cash",
      reference: "",
      description:
        u.action === UNPAID_INTEREST_RULES.CAPITALIZE
          ? `FY ${year} unpaid interest added to principal`
          : u.action === UNPAID_INTEREST_RULES.SEPARATE_OUTSTANDING
            ? `FY ${year} unpaid interest moved to arrears`
            : `FY ${year} unpaid interest waived`,
    }));
}

// The FY (named by its start year) that contains `iso`.
export function financialYearOf(iso, financialYearStart = "04-01") {
  const y = Number(iso.slice(0, 4));
  return iso < financialYearBounds(y, financialYearStart).yearStart ? y - 1 : y;
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
    const delta = cashDelta(e);
    if (delta > 0) bucket.inflows += delta;
    else if (delta < 0) bucket.outflows -= delta;
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
// ---------------------------------------------------------------------------
// Roles & referral rule
// ---------------------------------------------------------------------------

// Members saved before roles existed are depositors.
export function memberRole(member) {
  return member?.role || MEMBER_ROLES.DEPOSITOR;
}

export function isDepositor(member) {
  return memberRole(member) !== MEMBER_ROLES.BORROWER;
}

// Who may refer a loan: an active depositor other than the borrower.
export function eligibleReferrers(members, borrowerId = "") {
  return members.filter((m) => m.status === "active" && isDepositor(m) && m.id !== borrowerId);
}

// Returns why a new loan breaks the referral rule, or "" when it is fine.
export function loanReferralError(loan, members, rules = DEFAULT_RULES) {
  if (rules?.requireReferral === false) return "";
  if (!loan.referredById) return "A loan must be referred by a member.";
  if (loan.referredById === loan.memberId) return "A borrower can't refer their own loan.";
  const ref = members.find((m) => m.id === loan.referredById);
  if (!ref || ref.status !== "active" || !isDepositor(ref)) return "The referrer must be an active depositing member.";
  return "";
}

// ---------------------------------------------------------------------------
// Monthly deposits — schedule per depositor, paid/due/late per month
// ---------------------------------------------------------------------------

// "YYYY-MM" + day → ISO date, clamped to the month's last day.
function dayOfMonthISO(ym, day) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const d = Math.max(1, Math.min(Number(day) || 1, last));
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function addMonthsYM(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthlyDepositOf(member, rules = DEFAULT_RULES) {
  if (!isDepositor(member)) return 0;
  const own = member.monthlyDeposit;
  if (own === undefined || own === null || own === "") return Number(rules.defaultMonthlyDeposit) || 0;
  return Number(own) || 0;
}

// Due date and deadline for one month. A deadline day before the due day
// means the deadline falls in the following month.
export function depositDates(ym, rules = DEFAULT_RULES) {
  const dueDay = Number(rules.depositDueDay) || 1;
  const deadlineDay = Number(rules.depositDeadlineDay) || dueDay;
  const dueDate = dayOfMonthISO(ym, dueDay);
  const deadline = deadlineDay >= dueDay ? dayOfMonthISO(ym, deadlineDay) : dayOfMonthISO(addMonthsYM(ym, 1), deadlineDay);
  return { dueDate, deadline };
}

export function depositLateFee(expected, rules = DEFAULT_RULES) {
  if (rules.depositLateFeeType === DEPOSIT_LATE_FEE.FIXED) return round2(Number(rules.depositLateFeeFixed) || 0);
  if (rules.depositLateFeeType === DEPOSIT_LATE_FEE.PERCENTAGE) return round2((expected * (Number(rules.depositLateFeePercent) || 0)) / 100);
  return 0;
}

// The month-by-month deposit record for one member, from their first deposit
// month to the current month (or the month they became inactive).
//
// Contributions count toward the schedule like this:
//   - tagged with depositMonth → that month first, any extra flows on
//   - flagged lumpSum (opening / extra deposits) → never counted as monthly
//   - anything else → the oldest month that is still unpaid
// Status per month: paid, paid_late, late (past deadline, not fully paid),
// due (due date reached, deadline not yet), upcoming.
export function deriveDeposits(member, events, rulesIn = DEFAULT_RULES, today = todayISO()) {
  const rules = { ...DEFAULT_RULES, ...rulesIn };
  const amount = monthlyDepositOf(member, rules);
  const contributions = events
    .filter((e) => e.memberId === member.id && e.type === EVENT_TYPES.CONTRIBUTION && !e.lumpSum)
    .sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date.localeCompare(b.date)));
  const empty = { months: [], amount, expected: 0, paid: 0, arrears: 0, lateMonths: 0, lateFeesDue: 0, advance: 0, current: null };
  if (!isDepositor(member) || amount <= 0) return empty;

  const start = (member.depositStartMonth || member.joinedAt || today).slice(0, 7);
  let end = today.slice(0, 7);
  if (member.status === "inactive") {
    const lastPaid = contributions.length ? contributions[contributions.length - 1].date.slice(0, 7) : start;
    const stop = (member.inactiveSince || "").slice(0, 7) || lastPaid;
    if (stop < end) end = stop;
  }
  const keys = [];
  for (let ym = start; ym <= end && keys.length < 600; ym = addMonthsYM(ym, 1)) keys.push(ym);
  if (keys.length === 0) return empty;

  const months = keys.map((ym) => ({ month: ym, ...depositDates(ym, rules), expected: amount, paid: 0, paidDate: null, eventIds: [] }));
  const byKey = Object.fromEntries(months.map((m, i) => [m.month, i]));
  const credit = (m, amt, e) => {
    const take = Math.min(Math.max(m.expected - m.paid, 0), amt);
    if (take <= 0) return 0;
    m.paid = round2(m.paid + take);
    m.eventIds.push(e.id);
    if (m.paid >= m.expected - 0.5) m.paidDate = e.date;
    return take;
  };

  // Tagged contributions settle their own month first.
  const queue = [];
  for (const e of contributions) {
    let amt = Number(e.amount) || 0;
    const idx = e.depositMonth ? byKey[e.depositMonth] : undefined;
    if (idx !== undefined) amt -= credit(months[idx], amt, e);
    if (amt > 0.005) queue.push({ e, amt });
  }
  // The rest pays the oldest unpaid month first.
  let advance = 0;
  for (const q of queue) {
    let amt = q.amt;
    for (const m of months) {
      if (amt <= 0.005) break;
      amt -= credit(m, amt, q.e);
    }
    advance += Math.max(amt, 0);
  }

  const feesPaid = {};
  for (const e of events) {
    if (e.memberId === member.id && e.type === EVENT_TYPES.LATE_FEE && !e.loanId && e.depositMonth) {
      feesPaid[e.depositMonth] = (feesPaid[e.depositMonth] || 0) + (Number(e.amount) || 0);
    }
  }

  let expected = 0;
  let paid = 0;
  let arrears = 0;
  let lateMonths = 0;
  let lateFeesDue = 0;
  for (const m of months) {
    const left = round2(Math.max(m.expected - m.paid, 0));
    const fullyPaid = left <= 0.5;
    if (fullyPaid) m.status = m.paidDate && m.paidDate > m.deadline ? "paid_late" : "paid";
    else if (today > m.deadline) m.status = "late";
    else if (today >= m.dueDate) m.status = "due";
    else m.status = "upcoming";
    m.left = fullyPaid ? 0 : left;
    m.isLate = m.status === "late" || m.status === "paid_late";
    m.lateFee = m.isLate ? depositLateFee(m.expected, rules) : 0;
    m.lateFeePaid = round2(feesPaid[m.month] || 0);
    m.lateFeeDue = round2(Math.max(0, m.lateFee - m.lateFeePaid));
    expected += m.expected;
    paid += m.paid;
    if (m.status === "late" || m.status === "due") arrears += m.left;
    if (m.status === "late") lateMonths++;
    lateFeesDue += m.lateFeeDue;
  }

  return {
    months,
    amount,
    expected: round2(expected),
    paid: round2(paid),
    arrears: round2(arrears),
    lateMonths,
    lateFeesDue: round2(lateFeesDue),
    advance: round2(advance),
    current: months.find((m) => m.month === today.slice(0, 7)) || null,
  };
}

// Kopri-wide deposit roll-up for one month ("YYYY-MM", default this month).
export function depositSummary(state, month = todayISO().slice(0, 7), today = todayISO()) {
  const rows = state.members
    .filter((m) => isDepositor(m))
    .map((m) => ({ member: m, deposits: deriveDeposits(m, state.events, state.rules, today) }))
    .filter((r) => r.deposits.months.length > 0);
  let expected = 0;
  let collected = 0;
  const unpaid = [];
  for (const r of rows) {
    const m = r.deposits.months.find((x) => x.month === month);
    if (!m) continue;
    expected += m.expected;
    collected += m.paid;
    if (m.left > 0.5 && m.status !== "upcoming") unpaid.push({ member: r.member, month: m });
  }
  return {
    month,
    rows,
    expected: round2(expected),
    collected: round2(collected),
    unpaid,
    lateMembers: rows.filter((r) => r.deposits.lateMonths > 0),
    arrears: round2(rows.reduce((a, r) => a + r.deposits.arrears, 0)),
    lateFeesDue: round2(rows.reduce((a, r) => a + r.deposits.lateFeesDue, 0)),
  };
}
