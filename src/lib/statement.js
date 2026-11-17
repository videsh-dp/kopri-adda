// ---------------------------------------------------------------------------
// Member statement: what one person has deposited, what they owe on loans,
// and what is due next. Used by the printable statement page and the
// WhatsApp summary the manager sends.
// ---------------------------------------------------------------------------
import { deriveDeposits, deriveLoan, deriveMember, financialYearBounds, financialYearOf, isDepositor } from "./calculations.js";
import { formatINR, todayISO, round2 } from "./format.js";
import { translate, dateIn, monthShortIn } from "./i18n.js";

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

// Short WhatsApp version of the statement, in the message language.
export function statementText(s, lang = "en") {
  const t = (x, v) => translate(lang, x, v);
  const first = s.member.name.split(" ")[0];
  const lines = [t("Namaskar {name},", { name: first }), t("Your {kopri} statement as on {date}:", { kopri: s.kopriName, date: dateIn(lang, s.today) })];
  if (s.monthly > 0) {
    lines.push(t("• Deposited so far: {amt} ({monthly} a month)", { amt: formatINR(s.deposited), monthly: formatINR(s.monthly) }));
    const unpaid = s.months.filter((m) => m.status === "late" || m.status === "due");
    lines.push(
      unpaid.length
        ? t("• Deposits unpaid: {months} ({amt})", { months: unpaid.map((m) => monthShortIn(lang, m.month)).join(", "), amt: formatINR(s.depositsUnpaid) })
        : t("• All deposits paid up to date")
    );
  }
  for (const l of s.loans) {
    if (l.closed) {
      lines.push(t("• Loan of {amt}: fully repaid", { amt: formatINR(l.principal) }));
      continue;
    }
    lines.push(t("• Loan of {amt}: {left} still to pay ({paid} of {n} EMIs paid)", { amt: formatINR(l.principal), left: formatINR(l.stillToPay), paid: l.emisPaid, n: l.emis }));
    if (l.lateAmount > 0.5) lines.push(t("  Late: {amt}", { amt: formatINR(l.lateAmount) }));
    if (l.next) lines.push(t("  Next EMI: {amt} due {date}", { amt: formatINR(l.next.amount), date: dateIn(lang, l.next.dueDate) }));
  }
  if (s.owedNow > 0.5) lines.push(t("Please pay {amt} that is due now.", { amt: formatINR(s.owedNow) }));
  lines.push(t("Thank you. {kopri}", { kopri: s.kopriName }));
  return lines.join("\n");
}
