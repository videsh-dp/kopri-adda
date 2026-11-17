// ---------------------------------------------------------------------------
// Collect: the manager's "who owes what" list for the home screen.
// Pure helpers: build the list, turn one row into ledger events, and write
// WhatsApp receipt / reminder messages.
// ---------------------------------------------------------------------------
import { EVENT_TYPES } from "./constants.js";
import { deriveDeposits, deriveLoan, isDepositor, splitPayAmount } from "./calculations.js";
import { formatINR, daysBetween, todayISO, round2, uid } from "./format.js";
import { translate, monthLongIn, dateIn } from "./i18n.js";

const COLLECTED_TYPES = [EVENT_TYPES.CONTRIBUTION, EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE];

const monthLong = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
export const monthShortName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short" });
};

const endOfMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
};

// Status shown to the manager. Three colours only:
//   late (red)  → past the deadline / grace period
//   due (orange) → due now or later this month
//   paid (green)
function tone(status) {
  return status === "late" ? "late" : status === "paid" ? "paid" : "due";
}

// Everything to collect: this month's deposits and EMIs, plus anything older
// still unpaid. Also lists what was already paid this month.
export function collectionList(state, today = todayISO()) {
  const month = today.slice(0, 7);
  const monthEnd = endOfMonth(month);
  const toCollect = [];
  const paid = [];

  for (const member of state.members) {
    if (!isDepositor(member)) continue;
    const d = deriveDeposits(member, state.events, state.rules, today);
    for (const m of d.months) {
      const lateFee = round2(m.lateFeeDue || 0);
      if (m.left > 0.5 && (m.status !== "upcoming" || m.month === month)) {
        toCollect.push({
          key: `dep:${member.id}:${m.month}`,
          kind: "deposit",
          member,
          month: m.month,
          title: `${monthShortName(m.month)} deposit`,
          status: m.status === "late" ? "late" : "due",
          dueDate: m.dueDate,
          deadline: m.deadline,
          daysLate: m.status === "late" ? Math.max(0, daysBetween(m.deadline, today)) : 0,
          base: round2(m.left),
          lateFee,
          amount: round2(m.left + lateFee),
        });
      } else if (m.left <= 0.5 && lateFee > 0.005) {
        toCollect.push({
          key: `depfee:${member.id}:${m.month}`,
          kind: "deposit_fee",
          member,
          month: m.month,
          title: `Late fee, ${monthShortName(m.month)} deposit`,
          status: "late",
          dueDate: m.deadline,
          daysLate: 0,
          base: 0,
          lateFee,
          amount: lateFee,
        });
      } else if (m.month === month && m.left <= 0.5) {
        paid.push({
          key: `dep:${member.id}:${m.month}`,
          kind: "deposit",
          member,
          month: m.month,
          title: `${monthShortName(m.month)} deposit`,
          status: "paid",
          paidDate: m.paidDate,
          amount: round2(m.paid),
          eventIds: m.eventIds,
        });
      }
    }
  }

  const memberById = Object.fromEntries(state.members.map((m) => [m.id, m]));
  for (const loan of state.loans) {
    if (loan.status === "draft") continue;
    const member = memberById[loan.memberId];
    if (!member) continue;
    const view = deriveLoan(loan, state.events, today);
    const n = view.installments.length;
    for (const inst of view.installments) {
      const left = round2(inst.principalLeft + inst.interestLeft);
      const label = `EMI ${inst.index + 1} of ${n}`;
      if (inst.status === "written_off") continue;
      if (left > 0.5 && (inst.status === "overdue" || inst.dueDate <= monthEnd)) {
        const lateFee = round2(inst.lateFeeDue || 0);
        toCollect.push({
          key: `emi:${loan.id}:${inst.index}`,
          kind: "emi",
          member,
          loan: view,
          installment: inst,
          title: label,
          status: inst.status === "overdue" ? "late" : "due",
          dueDate: inst.dueDate,
          daysLate: inst.status === "overdue" ? inst.overdueDays : 0,
          base: left,
          principal: inst.principalLeft,
          interest: inst.interestLeft,
          lateFee,
          amount: round2(left + lateFee),
        });
      } else if (left <= 0.5 && inst.dueDate.slice(0, 7) === month && inst.principalDue + inst.interestDue > 0.5) {
        paid.push({
          key: `emi:${loan.id}:${inst.index}`,
          kind: "emi",
          member,
          loan: view,
          installment: inst,
          title: label,
          status: "paid",
          amount: round2(inst.principalPaid + inst.interestPaid),
        });
      }
    }
  }

  // Late first (most days late at the top), then by due date, then name.
  toCollect.sort(
    (a, b) =>
      (a.status === "late" ? 0 : 1) - (b.status === "late" ? 0 : 1) ||
      b.daysLate - a.daysLate ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.member.name.localeCompare(b.member.name)
  );
  paid.sort((a, b) => a.member.name.localeCompare(b.member.name));

  const sum = (list) => round2(list.reduce((a, i) => a + i.amount, 0));
  const thisMonthDue = toCollect.filter((i) => i.status !== "late" || (i.month || i.dueDate.slice(0, 7)) === month);
  return {
    month,
    toCollect,
    paid,
    totals: {
      toCollect: sum(toCollect),
      late: sum(toCollect.filter((i) => i.status === "late")),
      lateCount: toCollect.filter((i) => i.status === "late").length,
      // Money actually received this month (any deposit, EMI or late fee).
      collected: round2(
        state.events
          .filter((e) => e.date.slice(0, 7) === month && COLLECTED_TYPES.includes(e.type))
          .reduce((a, e) => a + (Number(e.amount) || 0), 0)
      ),
      expectedThisMonth: round2(sum(paid) + sum(thisMonthDue)),
    },
  };
}

export const statusTone = tone;

// The ledger events that record a row as fully paid today.
// Each event gets its own id so the caller can undo them.
export function paymentEvents(item, { date = todayISO(), account = "cash" } = {}) {
  const base = { date, account, memberId: item.member.id };
  const events = [];
  if (item.kind === "deposit") {
    events.push({
      ...base,
      id: uid("ev"),
      type: EVENT_TYPES.CONTRIBUTION,
      amount: item.base,
      depositMonth: item.month,
      lumpSum: false,
      description: `Monthly deposit, ${monthLong(item.month)}`,
    });
  }
  if ((item.kind === "deposit" || item.kind === "deposit_fee") && item.lateFee > 0.005) {
    events.push({
      ...base,
      id: uid("ev"),
      type: EVENT_TYPES.LATE_FEE,
      loanId: "",
      amount: item.lateFee,
      depositMonth: item.month,
      description: `Late fee on ${monthLong(item.month)} deposit`,
    });
  }
  if (item.kind === "emi") {
    const inst = item.installment;
    const loanBase = { ...base, loanId: item.loan.id, installmentIndex: inst.index };
    const desc = `Installment ${inst.index + 1}`;
    const { principal, interest } = splitPayAmount(item.base, inst.principalLeft, inst.interestLeft);
    if (principal > 0) events.push({ ...loanBase, id: uid("ev"), type: EVENT_TYPES.PRINCIPAL_PAYMENT, amount: principal, description: `${desc} — principal` });
    if (interest > 0) events.push({ ...loanBase, id: uid("ev"), type: EVENT_TYPES.INTEREST_PAYMENT, amount: interest, description: `${desc} — interest` });
    if (item.lateFee > 0.005) {
      events.push({
        ...loanBase,
        id: uid("ev"),
        type: EVENT_TYPES.LATE_FEE,
        amount: item.lateFee,
        description: `Late charges (${item.daysLate} days late)`,
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------- WhatsApp
// Indian numbers: keep the digits, add 91 to a 10-digit mobile number.
export function waPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 ? digits : "";
}

// Opens WhatsApp with the message ready. With no phone number WhatsApp asks
// the manager to pick the contact.
export function whatsappLink(phone, text) {
  const p = waPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

// What a row is, in words, for messages ("monthly deposit for November 2026").
function whatText(item, lang) {
  const t = (x, v) => translate(lang, x, v);
  if (item.kind === "emi") return t("{emi} for your loan", { emi: t("EMI {i} of {n}", { i: item.installment.index + 1, n: item.loan.installments.length }) });
  if (item.kind === "deposit_fee") return t("late fee on the {month} deposit", { month: monthLongIn(lang, item.month) });
  return t("monthly deposit for {month}", { month: monthLongIn(lang, item.month) });
}

export function receiptText({ kopriName, item, amount, date = todayISO(), lang = "en" }) {
  const t = (x, v) => translate(lang, x, v);
  const lines = [
    t("Namaskar {name},", { name: firstName(item.member.name) }),
    t("Received {amt} on {date} towards your {what}.", { amt: formatINR(amount), date: dateIn(lang, date), what: whatText(item, lang) }),
  ];
  if (item.kind === "emi" && item.loan) {
    const left = Math.max(0, round2(item.loan.outstandingPrincipal - (item.principal || 0)));
    lines.push(left > 0.5 ? t("Loan amount still to pay: {amt}.", { amt: formatINR(left) }) : t("Your loan is now fully repaid."));
  }
  lines.push(t("Thank you. {kopri}", { kopri: kopriName }));
  return lines.join("\n");
}

export function reminderText({ kopriName, item, today = todayISO(), lang = "en" }) {
  const t = (x, v) => translate(lang, x, v);
  const when =
    item.status === "late"
      ? t("was due on {date}", { date: dateIn(lang, item.kind === "emi" ? item.dueDate : item.deadline || item.dueDate) })
      : item.dueDate > today
        ? t("is due on {date}", { date: dateIn(lang, item.dueDate) })
        : item.deadline
          ? t("is due now (please pay by {date})", { date: dateIn(lang, item.deadline) })
          : t("is due now");
  return [
    t("Namaskar {name},", { name: firstName(item.member.name) }),
    t("A friendly reminder: your {what} of {amt} {when}.", { what: whatText(item, lang), amt: formatINR(item.amount), when }),
    t("Thank you. {kopri}", { kopri: kopriName }),
  ].join("\n");
}
