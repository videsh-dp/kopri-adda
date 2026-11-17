// ---------------------------------------------------------------------------
// Member statement: what one person has deposited, what they owe on loans,
// and what is due next. Used by the printable statement page and the
// WhatsApp summary the manager sends.
// ---------------------------------------------------------------------------
import { deriveDeposits, deriveLoan, deriveMember, financialYearBounds, financialYearOf, isDepositor } from "./calculations.js";
import { formatINR, formatDate, todayISO, round2 } from "./format.js";

const monthName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

export function memberStatement(state, member, today = todayISO()) {
  const view = deriveMember(member, state.events, state.loans);
  const fy = financialYearOf(today, state.rules.financialYearStart);
  const { yearStart } = financialYearBounds(fy, state.rules.financialYearStart);
  const deposits = isDepositor(member) ? deriveDeposits(member, state.events, state.rules, today) : null;
  const months = deposits ? deposits.months.filter((m) => m.month >= yearStart.slice(0, 7)) : [];

  const loans = state.loans
    .filter((l) => l.memberId === member.id && l.status !== "draft")
    .map((l) => deriveLoan(l, state.events, today))
    .filter((l) => !l.fullyPaid || l.installments.some((i) => i.dueDate >= yearStart))
    .map((l) => {
      const next = l.installments.find((i) => i.status === "due" || i.status === "overdue");
      const late = l.installments.filter((i) => i.status === "overdue");
      return {
        id: l.id,
        principal: l.principal,
        startDate: l.startDate,
        tenureMonths: l.tenureMonths,
        paidBack: l.principalPaid,
        interestPaid: l.interestPaid,
        stillToPay: l.outstandingPrincipal,
        lateAmount: round2(l.overduePrincipal + l.overdueInterest + l.lateFeesDue),
        lateCount: late.length,
        closed: l.fullyPaid || l.effectiveStatus === "completed",
        writtenOff: l.isWrittenOff,
        next: next ? { index: next.index, dueDate: next.dueDate, amount: round2(next.principalLeft + next.interestLeft + (next.lateFeeDue || 0)) } : null,
        emis: l.installments.length,
        emisPaid: l.installments.filter((i) => i.status === "paid").length,
      };
    });

  const depositsUnpaid = deposits ? round2(deposits.arrears + deposits.lateFeesDue) : 0;
  const loansLate = round2(loans.reduce((a, l) => a + l.lateAmount, 0));
  return {
    kopriName: state.name || state.rules.kopriName || "Kopri",
    member,
    today,
    fy,
    fyLabel: yearStart.slice(5) === "01-01" ? `${fy}` : `${fy}–${String(fy + 1).slice(2)}`,
    deposited: view.contributions,
    withdrawn: view.withdrawals,
    balance: view.entitlement,
    monthly: deposits?.amount || 0,
    months: months.map((m) => ({ month: m.month, label: monthName(m.month), status: m.status, paid: m.paid, expected: m.expected, paidDate: m.paidDate, left: m.left })),
    depositsUnpaid,
    loans,
    owedNow: round2(depositsUnpaid + loansLate),
  };
}

// Short WhatsApp version of the statement.
export function statementText(s) {
  const first = s.member.name.split(" ")[0];
  const lines = [`Namaskar ${first},`, `Your ${s.kopriName} statement as on ${formatDate(s.today)}:`];
  if (s.monthly > 0) {
    lines.push(`• Deposited so far: ${formatINR(s.deposited)} (${formatINR(s.monthly)} a month)`);
    const unpaid = s.months.filter((m) => m.status === "late" || m.status === "due");
    lines.push(unpaid.length ? `• Deposits unpaid: ${unpaid.map((m) => m.label).join(", ")} (${formatINR(s.depositsUnpaid)})` : "• All deposits paid up to date");
  }
  for (const l of s.loans) {
    if (l.closed) {
      lines.push(`• Loan of ${formatINR(l.principal)}: fully repaid`);
      continue;
    }
    lines.push(`• Loan of ${formatINR(l.principal)}: ${formatINR(l.stillToPay)} still to pay (${l.emisPaid} of ${l.emis} EMIs paid)`);
    if (l.lateAmount > 0.5) lines.push(`  Late: ${formatINR(l.lateAmount)}`);
    if (l.next) lines.push(`  Next EMI: ${formatINR(l.next.amount)} due ${formatDate(l.next.dueDate)}`);
  }
  if (s.owedNow > 0.5) lines.push(`Please pay ${formatINR(s.owedNow)} that is due now.`);
  lines.push(`Thank you. ${s.kopriName}`);
  return lines.join("\n");
}
