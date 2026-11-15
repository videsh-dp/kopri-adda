// ---------------------------------------------------------------------------
// Chart of accounts — a read-only tree view over the existing money math.
//
// Nothing here is a new rule: every balance comes from derivePortfolio /
// deriveLoan / deriveMember / deriveAccounts, and the income & expense groups
// add up the same event types computeYearEnd uses for the year's profit.
// Parents always show the sum of their children.
// ---------------------------------------------------------------------------

import { EVENT_TYPES, EVENT_META, EXPENSE_EVENT_TYPES } from "./constants.js";
import { derivePortfolio, cashDelta, isDepositor } from "./calculations.js";
import { round2, formatINR } from "./format.js";

const amt = (e) => Number(e.amount) || 0;

export function eventLabel(type) {
  return EVENT_META[type]?.label || type;
}

// node(): a tree node. A leaf carries its own amount and entries; a parent's
// amount is the sum of its children (filled in by rollUp).
function node(id, label, opts = {}) {
  return { id, label, sub: "", amount: 0, children: [], entries: [], ...opts };
}

function rollUp(n) {
  if (n.children.length) {
    n.children.forEach(rollUp);
    n.amount = round2(n.children.reduce((a, c) => a + c.amount, 0));
  } else {
    n.amount = round2(n.amount);
  }
  return n;
}

// entries: [{ event, effect }] — effect is the signed change this event made to
// this account (0 when it is shown for context only).
const entry = (event, effect) => ({ event, effect: round2(effect) });

function loanEffect(e) {
  switch (e.type) {
    case EVENT_TYPES.LOAN_DISBURSEMENT:
    case EVENT_TYPES.INTEREST_CAPITALIZED:
      return amt(e);
    case EVENT_TYPES.PRINCIPAL_PAYMENT:
    case EVENT_TYPES.LOAN_WRITE_OFF:
      return -amt(e);
    default:
      return 0;
  }
}

function memberEffect(e) {
  switch (e.type) {
    case EVENT_TYPES.CONTRIBUTION:
    case EVENT_TYPES.PROFIT_ALLOCATION:
      return amt(e);
    case EVENT_TYPES.WITHDRAWAL:
    case EVENT_TYPES.MEMBER_SETTLEMENT:
      return -amt(e);
    default:
      return 0;
  }
}

// Effect of one event on the cash (or bank) account.
function accountEffect(e, account) {
  if (e.type === EVENT_TYPES.TRANSFER) {
    if (e.from === e.to) return 0;
    if (e.to === account) return amt(e);
    if (e.from === account) return -amt(e);
    return 0;
  }
  const target = e.account === "bank" ? "bank" : "cash";
  return target === account ? cashDelta(e) : 0;
}

const byDateDesc = (a, b) =>
  a.event.date < b.event.date ? 1 : a.event.date > b.event.date ? -1 : (a.event.createdAt || "") < (b.event.createdAt || "") ? 1 : -1;

/**
 * Build the account tree.
 * @param state  the Kopri book (members, loans, events, rules)
 * @param period { from, to } ISO dates for the income/expense groups, or null for all time.
 *               Balance groups (assets, members' funds) are always as of today.
 */
export function buildAccountTree(state, period = null) {
  const { events, members, loans } = state;
  const portfolio = derivePortfolio(state);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const loanViewById = Object.fromEntries(portfolio.loanViews.map((l) => [l.id, l]));
  const borrowerName = (loan) => memberById[loan?.memberId]?.name || "Unknown borrower";
  const loanRef = (loan) => (loan?.id || "").toUpperCase();
  const inPeriod = (e) => !period || (e.date >= period.from && e.date <= period.to);

  // ------------------------------------------------------------- Assets
  const cash = node("cash", "Cash in hand", {
    amount: portfolio.accounts.cash,
    sub: "Money physically in the tin",
    entries: events.map((e) => entry(e, accountEffect(e, "cash"))).filter((x) => x.effect !== 0),
    link: { to: "/cash-bank", label: "Open Cash & Bank" },
  });
  const bank = node("bank", "Bank account", {
    amount: portfolio.accounts.bank,
    sub: "Money in the bank",
    entries: events.map((e) => entry(e, accountEffect(e, "bank"))).filter((x) => x.effect !== 0),
    link: { to: "/cash-bank", label: "Open Cash & Bank" },
  });
  const cashBank = node("cash-bank", "Cash & Bank", { children: [cash, bank], sub: "Liquid money" });

  const loanLeaf = (l) =>
    node(`loan-${l.id}`, borrowerName(l), {
      amount: l.outstandingPrincipal,
      sub: `${loanRef(l)} · ${l.effectiveStatus}${l.isOverdue ? ` · ${formatINR(l.overduePrincipal + l.overdueInterest)} overdue` : ""}`,
      tone: l.isOverdue || l.effectiveStatus === "defaulted" ? "red" : undefined,
      entries: events.filter((e) => e.loanId === l.id).map((e) => entry(e, loanEffect(e))),
      link: { to: `/loans/${l.id}`, label: "Open loan" },
      facts: [
        ["Principal lent", l.totalPrincipal],
        ["Principal repaid", l.principalPaid],
        l.principalWrittenOff > 0 ? ["Written off", l.principalWrittenOff] : null,
        ["Interest received", l.interestPaid],
        l.overdueInterest > 0 ? ["Interest overdue", l.overdueInterest] : null,
        l.interestArrears > 0 ? ["Interest arrears", l.interestArrears] : null,
        l.lateFeesDue > 0 ? ["Late fees built up", l.lateFeesDue] : null,
      ].filter(Boolean),
    });
  const openLoans = portfolio.loanViews.filter((l) => l.outstandingPrincipal > 0.005).sort((a, b) => b.outstandingPrincipal - a.outstandingPrincipal);
  const closedLoans = portfolio.loanViews.filter((l) => l.outstandingPrincipal <= 0.005);
  const loanChildren = openLoans.map(loanLeaf);
  if (closedLoans.length) {
    loanChildren.push(
      node("loans-closed", "Repaid or closed", {
        sub: "Nothing left to collect",
        children: closedLoans.map(loanLeaf),
        muted: true,
      })
    );
  }
  const loansNode = node("loans", "Loans given out", {
    children: loanChildren,
    sub: `${openLoans.length} open loan${openLoans.length === 1 ? "" : "s"} · principal still to collect`,
    link: { to: "/loans", label: "Open Loans" },
  });

  const assets = node("assets", "Assets", {
    sub: "What the kopri holds",
    kind: "balance",
    color: "var(--primary)",
    children: [cashBank, loansNode],
  });

  // ------------------------------------------------------ Members' funds
  const memberLeaf = (m) => {
    const owed = round2(m.entitlement - m.capital);
    return node(`member-${m.id}`, m.name, {
      amount: m.entitlement,
      sub: owed > 0.005 ? `deposits + profit owed` : "deposits",
      entries: events.filter((e) => e.memberId === m.id && memberEffect(e) !== 0).map((e) => entry(e, memberEffect(e))),
      link: { to: `/members/${m.id}`, label: "Open member" },
      muted: m.status !== "active",
      facts: [
        ["Deposited", m.contributions],
        m.withdrawals > 0 ? ["Withdrawn", m.withdrawals] : null,
        m.profitAllocated > 0 ? ["Profit given", m.profitAllocated] : null,
        m.settled > 0 ? ["Paid out at settlement", m.settled] : null,
        ["Capital in the kopri", m.capital],
        owed > 0.005 ? ["Profit owed, not yet paid", owed] : null,
      ].filter(Boolean),
    });
  };
  const holders = portfolio.memberViews
    .filter((m) => Math.abs(m.entitlement) > 0.005 || (isDepositor(m) && m.status === "active"))
    .sort((a, b) => b.entitlement - a.entitlement);
  const memberBalances = node("member-balances", "Member balances", {
    sub: `${holders.length} member${holders.length === 1 ? "" : "s"} · deposits plus profit owed`,
    children: holders.map(memberLeaf),
    link: { to: "/members", label: "Open Members" },
  });
  rollUp(assets);
  rollUp(memberBalances);

  // The kopri's own surplus is what is left once members are paid back:
  // profit earned so far that hasn't been shared out yet.
  const allTime = (types) => round2(events.filter((e) => types.includes(e.type)).reduce((a, e) => a + amt(e), 0));
  const adjustments = round2(events.filter((e) => e.type === EVENT_TYPES.ADJUSTMENT).reduce((a, e) => a + cashDelta(e), 0));
  const surplusAmount = round2(assets.amount - memberBalances.amount);
  const surplusParts = [
    ["Interest received", allTime([EVENT_TYPES.INTEREST_PAYMENT])],
    ["Late fees collected", allTime([EVENT_TYPES.LATE_FEE])],
    ["Other income", allTime([EVENT_TYPES.OTHER_INCOME])],
    ["Interest added to loans", allTime([EVENT_TYPES.INTEREST_CAPITALIZED])],
    ["Expenses", -allTime(EXPENSE_EVENT_TYPES)],
    ["Bad loans written off", -allTime([EVENT_TYPES.LOAN_WRITE_OFF])],
    ["Manager's share paid", -allTime([EVENT_TYPES.MANAGER_PAYOUT])],
    ["Profit given to members", -allTime([EVENT_TYPES.PROFIT_ALLOCATION])],
    ["Adjustments", adjustments],
  ].filter(([, v]) => Math.abs(v) > 0.005);
  const explained = round2(surplusParts.reduce((a, [, v]) => a + v, 0));
  if (Math.abs(surplusAmount - explained) > 0.5) surplusParts.push(["Other / unmatched", round2(surplusAmount - explained)]);
  const surplus = node("surplus", "Kopri surplus", {
    amount: surplusAmount,
    sub: "Profit earned, not yet shared out",
    tone: surplusAmount < -0.005 ? "red" : undefined,
    facts: surplusParts,
    note: "Assets minus what is owed to members. It becomes members' profit at year end.",
    link: { to: "/year-end", label: "Open Year End" },
  });

  const funds = node("funds", "Members' funds", {
    sub: "Who the money belongs to",
    kind: "balance",
    color: "var(--violet)",
    children: [memberBalances, surplus],
  });
  rollUp(funds);

  // -------------------------------------------------- Income & expenses
  const periodEvents = events.filter(inPeriod);
  const perLoan = (type, idPrefix) => {
    const groups = {};
    for (const e of periodEvents) {
      if (e.type !== type || !e.loanId) continue;
      (groups[e.loanId] ||= []).push(e);
    }
    return Object.entries(groups)
      .map(([loanId, list]) => {
        const loan = loanViewById[loanId] || loans.find((l) => l.id === loanId);
        return node(`${idPrefix}-${loanId}`, borrowerName(loan), {
          amount: list.reduce((a, e) => a + amt(e), 0),
          sub: loanRef(loan) || "Deleted loan",
          entries: list.map((e) => entry(e, amt(e))),
          link: loan ? { to: `/loans/${loanId}`, label: "Open loan" } : undefined,
        });
      })
      .sort((a, b) => b.amount - a.amount);
  };
  const leafOf = (id, label, types, opts = {}) => {
    const list = periodEvents.filter((e) => types.includes(e.type) && (!opts.filter || opts.filter(e)));
    return node(id, label, {
      amount: list.reduce((a, e) => a + amt(e), 0),
      entries: list.map((e) => entry(e, amt(e))),
      ...opts.extra,
    });
  };

  const depositLateFees = {};
  for (const e of periodEvents) {
    if (e.type === EVENT_TYPES.LATE_FEE && !e.loanId) (depositLateFees[e.memberId || "none"] ||= []).push(e);
  }
  const depositLateNodes = Object.entries(depositLateFees).map(([memberId, list]) =>
    node(`dlate-${memberId}`, memberById[memberId]?.name || "No member", {
      amount: list.reduce((a, e) => a + amt(e), 0),
      sub: "Late monthly deposits",
      entries: list.map((e) => entry(e, amt(e))),
      link: memberById[memberId] ? { to: `/members/${memberId}`, label: "Open member" } : undefined,
    })
  );

  const interestNode = node("income-interest", "Interest received", { children: perLoan(EVENT_TYPES.INTEREST_PAYMENT, "int") });
  const lateNode = node("income-late", "Late fees", {
    children: [
      node("income-late-loans", "On loan EMIs", { children: perLoan(EVENT_TYPES.LATE_FEE, "late") }),
      node("income-late-deposits", "On monthly deposits", { children: depositLateNodes }),
    ].filter((c) => c.children.length),
  });
  const otherIncome = leafOf("income-other", "Other income", [EVENT_TYPES.OTHER_INCOME]);
  const income = node("income", "Income", {
    sub: "Money the kopri earned",
    kind: "flow",
    color: "var(--green)",
    children: [interestNode, lateNode, otherIncome],
  });

  const expenseLeaf = leafOf("exp-expenses", "Running expenses", EXPENSE_EVENT_TYPES);
  const writeOffs = node("exp-writeoffs", "Bad loans written off", { children: perLoan(EVENT_TYPES.LOAN_WRITE_OFF, "wo") });
  const expenses = node("expenses", "Expenses & losses", {
    sub: "Takes away from shared profit",
    kind: "flow",
    color: "var(--red)",
    children: [expenseLeaf, writeOffs],
  });

  const allocated = {};
  for (const e of periodEvents) if (e.type === EVENT_TYPES.PROFIT_ALLOCATION) (allocated[e.memberId || "none"] ||= []).push(e);
  const shared = node("shared", "Profit shared", {
    sub: "Out of the surplus at year end",
    kind: "flow",
    color: "var(--amber)",
    children: [
      leafOf("shared-manager", "Manager's share paid", [EVENT_TYPES.MANAGER_PAYOUT]),
      node("shared-members", "Given to members", {
        children: Object.entries(allocated).map(([memberId, list]) =>
          node(`alloc-${memberId}`, memberById[memberId]?.name || "No member", {
            amount: list.reduce((a, e) => a + amt(e), 0),
            entries: list.map((e) => entry(e, amt(e))),
            link: memberById[memberId] ? { to: `/members/${memberId}`, label: "Open member" } : undefined,
          })
        ).sort((a, b) => b.amount - a.amount),
      }),
    ],
  });

  [income, expenses, shared].forEach(rollUp);

  const groups = [assets, funds, income, expenses, shared];
  // Sort entries newest first, once.
  const walk = (n) => {
    n.entries.sort(byDateDesc);
    n.children.forEach(walk);
  };
  groups.forEach(walk);

  return {
    groups,
    totals: {
      assets: assets.amount,
      memberBalances: memberBalances.amount,
      surplus: surplus.amount,
      income: income.amount,
      expenses: expenses.amount,
      netProfit: round2(income.amount - expenses.amount),
    },
  };
}

// All entries under a node (its own plus every descendant's), newest first.
// An event that touches two children (a cash→bank transfer, or a loan paid
// out of cash) shows once, with its combined effect on this node.
export function collectEntries(n) {
  const byId = new Map();
  const walk = (x) => {
    for (const en of x.entries) {
      const prev = byId.get(en.event.id);
      if (prev) prev.effect = round2(prev.effect + en.effect);
      else byId.set(en.event.id, { ...en });
    }
    x.children.forEach(walk);
  };
  walk(n);
  return [...byId.values()].sort(byDateDesc);
}

export function findNode(groups, id) {
  for (const g of groups) {
    if (g.id === id) return g;
    const hit = findNode(g.children, id);
    if (hit) return hit;
  }
  return null;
}

// Path of labels from the top group down to the node with this id.
export function nodePath(groups, id, trail = []) {
  for (const g of groups) {
    const next = [...trail, g];
    if (g.id === id) return next;
    const hit = nodePath(g.children, id, next);
    if (hit) return hit;
  }
  return null;
}
