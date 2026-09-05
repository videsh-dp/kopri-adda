import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveLoan } from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, StatusBadge, Button, Badge, MemberCell, Progress, EmptyState } from "../components/ui.jsx";
import { LoanFormModal } from "../components/modals.jsx";
import { IconPlus, IconSearch } from "../components/Icons.jsx";

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["overdue", "Overdue"],
  ["completed", "Completed"],
  ["defaulted", "Defaulted"],
];

export default function Loans() {
  const { state } = useKopri();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);

  const loans = useMemo(() => {
    const all = state.loans.map((l) => deriveLoan(l, state.events));
    const filtered = all.filter((l) => {
      if (filter !== "all" && l.effectiveStatus !== filter) return false;
      const m = memberById[l.memberId];
      if (query && !(m?.name || "").toLowerCase().includes(query.toLowerCase()) && !l.id.includes(query.toLowerCase())) return false;
      return true;
    });
    return filtered.sort((a, b) => (a.effectiveStatus === "overdue" ? -1 : b.effectiveStatus === "overdue" ? 1 : b.startDate.localeCompare(a.startDate)));
  }, [state, filter, query, memberById]);

  const totals = useMemo(() => {
    const all = state.loans.map((l) => deriveLoan(l, state.events));
    return {
      outstanding: all.reduce((a, l) => a + l.outstandingPrincipal, 0),
      overdue: all.reduce((a, l) => a + l.overduePrincipal + l.overdueInterest, 0),
      disbursed: all.reduce((a, l) => a + l.principal, 0),
    };
  }, [state]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Loans</div>
          <div className="page-sub">
            {formatINR(totals.disbursed)} disbursed · {formatINR(totals.outstanding)} outstanding ·{" "}
            {totals.overdue > 0 && <span className="amount-neg">{formatINR(totals.overdue)} overdue</span>}
          </div>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <IconPlus /> Create loan
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
        <div className="grow" />
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search borrower…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 34, minWidth: 200 }}
          />
          <span style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }}>
            <IconSearch />
          </span>
        </div>
      </div>

      <Card pad={false}>
        {loans.length === 0 ? (
          <EmptyState icon="🏦" title="No loans here" sub="Create a loan to start lending the pool." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Borrower</th>
                  <th>Principal</th>
                  <th>Rate & method</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Repaid</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => {
                  const m = memberById[l.memberId];
                  return (
                    <tr key={l.id} className="row-link" onClick={() => navigate(`/loans/${l.id}`)}>
                      <td className="mono muted">{l.id.toUpperCase()}</td>
                      <td>
                        <MemberCell name={m?.name || "Unknown"} sub={m?.phone} id={l.memberId} />
                      </td>
                      <td style={{ fontWeight: 650 }}>{formatINR(l.principal)}</td>
                      <td className="muted small">
                        {l.rate}%/{l.rateUnit === "yearly" ? "yr" : "mo"} · {l.interestMethod.replace("_", " ")}
                      </td>
                      <td className="muted">{formatDate(l.startDate)}</td>
                      <td>
                        <StatusBadge status={l.effectiveStatus} />
                        {l.effectiveStatus === "overdue" && (
                          <div className="small" style={{ color: "var(--red)", marginTop: 3 }}>
                            {l.overdueDaysMax}d late
                          </div>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {formatINR(l.outstandingPrincipal)}
                      </td>
                      <td className="num">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                          <Progress value={l.paidRatio * 100} max={100} color={l.paidRatio >= 1 ? "var(--green)" : "var(--primary)"} />
                          <span className="small muted">{Math.round(l.paidRatio * 100)}%</span>
                        </div>
                      </td>
                      <td className="num">
                        <Link to={`/loans/${l.id}`} className="btn btn-sm btn-ghost">
                          Schedule →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LoanFormModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}