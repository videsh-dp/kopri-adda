import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { toast } from "../components/ui.jsx";
import { sortLedger, deriveAccounts } from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, Badge, Button, EmptyState } from "../components/ui.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconPlus, IconSearch, IconEdit, IconTrash } from "../components/Icons.jsx";
import { ConfirmModal } from "../components/ui.jsx";
import { EVENT_TYPES } from "../lib/constants.js";

const FILTERS = [
  ["all", "All"],
  ["in", "Money in"],
  ["out", "Money out"],
  ["transfer", "Transfers"],
];

const EVENT_LABELS = {
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

const IN_TYPES = ["MEMBER_CONTRIBUTION", "PRINCIPAL_PAYMENT", "INTEREST_PAYMENT", "LATE_FEE", "OTHER_INCOME", "PROFIT_ALLOCATION"];
const OUT_TYPES = ["MEMBER_WITHDRAWAL", "LOAN_DISBURSEMENT", "EXPENSE", "MEMBER_SETTLEMENT", "LOAN_WRITE_OFF"];

export default function Ledger() {
  const { state } = useKopri();
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const { deleteEvent } = useKopri();
  const [showAdd, setShowAdd] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // event to delete

  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);
  const loanById = useMemo(() => Object.fromEntries(state.loans.map((l) => [l.id, l])), [state.loans]);
  const accounts = useMemo(() => deriveAccounts(state.events), [state.events]);

  const entries = useMemo(() => {
    let list = sortLedger(state.events);
    if (filter === "in") list = list.filter((e) => IN_TYPES.includes(e.type) || (e.type === "ADJUSTMENT" && e.sign !== "negative"));
    if (filter === "out") list = list.filter((e) => OUT_TYPES.includes(e.type) || (e.type === "ADJUSTMENT" && e.sign === "negative"));
    if (filter === "transfer") list = list.filter((e) => e.type === "TRANSFER");
    if (typeFilter !== "all") list = list.filter((e) => e.type === typeFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          (e.description || "").toLowerCase().includes(q) ||
          (memberById[e.memberId]?.name || "").toLowerCase().includes(q) ||
          (loanById[e.loanId]?.id || "").includes(q)
      );
    }
    return list;
  }, [state.events, filter, typeFilter, query, memberById, loanById]);

  // running pool balance as we walk from oldest to newest
  const withRunning = useMemo(() => {
    let running = 0;
    return [...entries].reverse().map((e) => {
      let delta = 0;
      const amt = Number(e.amount) || 0;
      if (e.type === "TRANSFER") {
        delta = 0;
      } else if (e.type === "ADJUSTMENT") {
        delta = e.sign === "negative" ? -amt : amt;
      } else if (IN_TYPES.includes(e.type)) {
        delta = amt;
      } else if (OUT_TYPES.includes(e.type)) {
        delta = -amt;
      }
      running += delta;
      return { ...e, delta, running: Math.round(running * 100) / 100 };
    });
  }, [entries]);

  const typeOptions = Object.entries(EVENT_LABELS);

  const tone = (e) => {
    if (e.type === "TRANSFER") return "gray";
    if (e.type === "ADJUSTMENT") return "violet";
    if (IN_TYPES.includes(e.type)) return "green";
    if (OUT_TYPES.includes(e.type)) return "red";
    return "gray";
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Unified Ledger</div>
          <div className="page-sub">
            Every rupee is an event — {formatINR(accounts.total)} in pool · {formatINR(accounts.cash)} cash · {formatINR(accounts.bank)} bank
          </div>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <IconPlus /> Record transaction
        </Button>
      </div>

      <div className="toolbar">
        <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} className={`tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 190 }}>
          <option value="all">All event types</option>
          {typeOptions.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div className="grow" />
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search description, member, loan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 34, minWidth: 240 }}
          />
          <span style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }}>
            <IconSearch />
          </span>
        </div>
      </div>

      <Card pad={false}>
        {withRunning.length === 0 ? (
          <EmptyState icon="🧾" title="No transactions match" sub="Adjust the filters or record a new transaction." />
        ) : (
          <div className="table-wrap sticky-header">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Account</th>
                  <th>Member / Loan</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th className="num">Running pool</th>
                  <th className="num" style={{ width: 64, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withRunning.map((e) => {
                  const member = e.memberId ? memberById[e.memberId] : null;
                  const loan = e.loanId ? loanById[e.loanId] : null;
                  const isIn = e.delta > 0;
                  const isOut = e.delta < 0;
                  return (
                    <tr key={e.id}>
                      <td className="muted">{formatDate(e.date)}</td>
                      <td>
                        <Badge tone={tone(e)}>{EVENT_LABELS[e.type] || e.type}</Badge>
                      </td>
                      <td className="muted small">{e.type === "TRANSFER" ? `${e.from} → ${e.to}` : e.account}</td>
                      <td>
                        {member ? (
                          <Link to={`/members/${member.id}`} style={{ fontWeight: 600 }}>
                            {member.name}
                          </Link>
                        ) : loan ? (
                          <Link to={`/loans/${loan.id}`} className="mono" style={{ fontWeight: 600 }}>
                            {loan.id.toUpperCase()}
                          </Link>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="muted">{e.description || ""}</td>
                      <td className={`num ${isIn ? "amount-pos" : isOut ? "amount-neg" : "amount-mut"}`}>
                        {e.type === "TRANSFER" ? "↔" : isIn ? "+" : isOut ? "−" : ""}
                        {formatINR(e.amount)}
                      </td>
                      <td className="num mono" style={{ fontWeight: 650 }}>
                        {formatINR(e.running)}
                      </td>
                      <td className="num" style={{ width: 64 }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setEditEvent(e)}
                          title="Edit transaction"
                          style={{ padding: "4px 8px", borderRadius: 8 }}
                        >
                          <IconEdit width={13} height={13} />
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setDeleteConfirm(e)}
                          title="Delete transaction"
                          style={{ padding: "4px 8px", borderRadius: 8, color: "var(--red)" }}
                        >
                          <IconTrash width={13} height={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="small faint" style={{ marginTop: 10 }}>
        Balances are always derived from the event stream — nothing is stored as a number that can drift out of sync.
      </div>

      <EventFormModal open={showAdd} onClose={() => setShowAdd(false)} />
      <EventFormModal open={!!editEvent} onClose={() => setEditEvent(null)} editEvent={editEvent} />
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteEvent(deleteConfirm.id);
            toast(`Transaction deleted.`);
          }
          setDeleteConfirm(null);
        }}
        title={`Delete transaction?`}
        confirmLabel="Delete"
        danger
      >
        <p className="muted">
          This removes <b>{deleteConfirm?.type && EVENT_LABELS[deleteConfirm.type] || ""}</b> event「{deleteConfirm?.id?.toUpperCase()}」
          — {formatINR(deleteConfirm?.amount || 0)} on {formatDate(deleteConfirm?.date)}.
          {deleteConfirm?.memberId ? ` Member: ${memberById[deleteConfirm.memberId]?.name || ""}.` : ""}
          {deleteConfirm?.loanId ? ` Loan: ${loanById[deleteConfirm.loanId]?.id.toUpperCase() || ""}.` : ""}
          <br /><br />
          This cannot be undone. Balances will re-derive automatically.
        </p>
      </ConfirmModal>
    </div>
  );
}