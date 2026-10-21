import { useMemo, useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveAccounts, sortLedger, cashDelta, deriveLoan } from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, StatCard, Badge, Button, EmptyState } from "../components/ui.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconPlus } from "../components/Icons.jsx";
import { EVENT_TYPES, ACCOUNTS } from "../lib/constants.js";

const LABELS = {
  MEMBER_CONTRIBUTION: "Contribution",
  MEMBER_WITHDRAWAL: "Withdrawal",
  LOAN_DISBURSEMENT: "Disbursement",
  PRINCIPAL_PAYMENT: "Principal repaid",
  INTEREST_PAYMENT: "Interest received",
  LATE_FEE: "Late fee",
  EXPENSE: "Expense",
  OTHER_INCOME: "Other income",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Adjustment",
  LOAN_WRITE_OFF: "Write-off",
  PROFIT_ALLOCATION: "Profit allocated",
  MEMBER_SETTLEMENT: "Settlement",
};

export default function CashBank() {
  const { state } = useKopri();
  const [account, setAccount] = useState("all");
  const [showTransfer, setShowTransfer] = useState(false);

  const accounts = useMemo(() => deriveAccounts(state.events), [state.events]);
  const loansOutstanding = useMemo(
    () => state.loans.reduce((a, l) => a + deriveLoan(l, state.events).outstandingPrincipal, 0),
    [state.loans, state.events]
  );
  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);

  const entries = useMemo(() => {
    // Only real money movements: profit allocations and write-offs are book entries.
    let list = sortLedger(state.events).filter((e) => e.type === "TRANSFER" || cashDelta(e) !== 0);
    const touches = (e, acc) => (e.type === "TRANSFER" ? e.from === acc || e.to === acc : e.account === acc);
    if (account === "cash") list = list.filter((e) => touches(e, "cash"));
    if (account === "bank") list = list.filter((e) => touches(e, "bank"));
    return list;
  }, [state.events, account]);

  const isIn = (e) => cashDelta(e) > 0;
  const isOut = (e) => cashDelta(e) < 0;
  const affectsAccount = (e) => {
    if (e.type === "TRANSFER") return true;
    return e.account === account || account === "all";
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Cash & Bank</div>
          <div className="page-sub">Where the pool's money physically sits</div>
        </div>
        <Button variant="primary" onClick={() => setShowTransfer(true)}>
          <IconPlus /> Transfer
        </Button>
      </div>

      <div className="stat-grid">
        <StatCard label="Cash on hand" value={formatINR(accounts.cash)} foot="Money physically in the tin" color="var(--teal)" />
        <StatCard label="Bank balance" value={formatINR(accounts.bank)} foot="Money in the bank account" color="var(--blue)" />
        <StatCard label="Total liquid" value={formatINR(accounts.total)} foot="Cash + bank, derived from ledger" color="var(--primary)" />
        <StatCard label="Out in loans" value={formatINR(loansOutstanding)} foot="Principal still outstanding on loans" color="var(--violet)" />
      </div>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
          {[
            ["all", "All"],
            ["cash", "Cash"],
            ["bank", "Bank"],
          ].map(([k, label]) => (
            <button key={k} className={`tab ${account === k ? "active" : ""}`} onClick={() => setAccount(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        {entries.length === 0 ? (
          <EmptyState icon="💰" title="No transactions yet" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Account</th>
                  <th>Member</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const member = e.memberId ? memberById[e.memberId] : null;
                  const isTransfer = e.type === "TRANSFER";
                  const shownIn = !isTransfer && isIn(e);
                  const shownOut = !isTransfer && isOut(e);
                  const relatesToSelected = affectsAccount(e);
                  return (
                    <tr key={e.id} style={{ opacity: relatesToSelected ? 1 : 0.45 }}>
                      <td className="muted">{formatDate(e.date)}</td>
                      <td>
                        <Badge tone={isTransfer ? "gray" : shownIn ? "green" : shownOut ? "red" : "violet"}>
                          {LABELS[e.type] || e.type}
                        </Badge>
                      </td>
                      <td className="muted small">
                        {isTransfer ? (
                          <span>
                            {e.from} → {e.to}
                          </span>
                        ) : (
                          e.account
                        )}
                      </td>
                      <td>{member ? member.name : <span className="faint">—</span>}</td>
                      <td className="muted">{e.description || ""}</td>
                      <td className={`num ${isTransfer ? "amount-mut" : shownIn ? "amount-pos" : shownOut ? "amount-neg" : "amount-mut"}`}>
                        {isTransfer ? "↔" : shownIn ? "+" : shownOut ? "−" : ""}
                        {formatINR(e.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EventFormModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        preset={{ type: EVENT_TYPES.TRANSFER, from: ACCOUNTS.CASH, to: ACCOUNTS.BANK, amount: "10000", description: "Transfer between accounts" }}
      />
    </div>
  );
}