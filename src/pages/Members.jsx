import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveMember, deriveDeposits, isDepositor, memberRole } from "../lib/calculations.js";
import { MEMBER_ROLES, MEMBER_ROLE_LABELS } from "../lib/constants.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, MemberCell, StatusBadge, Button, EmptyState, Badge } from "../components/ui.jsx";
import { MemberFormModal } from "../components/modals.jsx";
import { IconPlus, IconSearch } from "../components/Icons.jsx";

export default function Members() {
  const { state } = useKopri();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(null); // role for the add form
  const [roleFilter, setRoleFilter] = useState("all");

  const members = useMemo(
    () =>
      state.members
        .map((m) => ({ ...deriveMember(m, state.events, state.loans), deposits: deriveDeposits(m, state.events, state.rules) }))
        .filter((m) => roleFilter === "all" || (roleFilter === "depositors" ? isDepositor(m) : memberRole(m) !== MEMBER_ROLES.DEPOSITOR))
        .filter(
          (m) =>
            m.name.toLowerCase().includes(query.toLowerCase()) ||
            (m.phone || "").includes(query)
        )
        .sort((a, b) => b.capital - a.capital),
    [state, query, roleFilter]
  );
  const depositorCount = state.members.filter(isDepositor).length;
  const borrowerOnly = state.members.length - depositorCount;

  const totalCapital = members.reduce((a, m) => a + m.capital, 0);
  const totalOutstanding = members.reduce((a, m) => a + m.outstandingTotal, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Members & Borrowers</div>
          <div className="page-sub">
            {depositorCount} depositing members · {borrowerOnly} borrower{borrowerOnly === 1 ? "" : "s"} only · {formatINR(totalCapital)} total capital ·{" "}
            {formatINR(totalOutstanding)} outstanding loans
          </div>
        </div>
        <div className="row">
          <Button onClick={() => setShowAdd(MEMBER_ROLES.BORROWER)}>
            <IconPlus /> Add borrower
          </Button>
          <Button variant="primary" onClick={() => setShowAdd(MEMBER_ROLES.DEPOSITOR)}>
            <IconPlus /> Add member
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
          {[
            ["all", "All"],
            ["depositors", "Depositors"],
            ["borrowers", "Borrowers"],
          ].map(([k, label]) => (
            <button key={k} className={`tab ${roleFilter === k ? "active" : ""}`} onClick={() => setRoleFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="search" style={{ position: "relative" }}>
          <input
            placeholder="Search by name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
          <span style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }}>
            <IconSearch />
          </span>
        </div>
        <div className="grow" />
        <span className="small faint">
          Capital shown = contributions − withdrawals − year-end payouts beyond profit (derived from ledger, never stored)
        </span>
      </div>

      <Card pad={false}>
        {members.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No members found"
            sub={query ? "Try a different search." : "Add your first member to start the Kopri."}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th className="num">Deposits due</th>
                  <th className="num">Contributions</th>
                  <th className="num">Capital</th>
                  <th className="num">Loans out</th>
                  <th className="num">Overdue</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="row-link" onClick={() => navigate(`/members/${m.id}`)}>
                    <td>
                      <MemberCell name={m.name} sub={m.phone || "no phone"} id={m.id} />
                    </td>
                    <td className="muted">{formatDate(m.joinedAt)}</td>
                    <td>
                      <StatusBadge status={m.status} />
                      {m.activeLoans > 0 && (
                        <Badge tone="blue" style={{ marginLeft: 5 }}>
                          {m.activeLoans} loan{m.activeLoans > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <Badge tone={isDepositor(m) ? "violet" : "gray"}>{MEMBER_ROLE_LABELS[memberRole(m)]}</Badge>
                    </td>
                    <td className="num">
                      {m.deposits.arrears > 0 ? (
                        <span className={m.deposits.lateMonths > 0 ? "amount-neg" : ""} title={`${m.deposits.lateMonths} month(s) late`}>
                          {formatINR(m.deposits.arrears)}
                        </span>
                      ) : isDepositor(m) ? (
                        <span style={{ color: "var(--green)" }}>✓</span>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td className="num">{formatINR(m.contributions)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatINR(m.capital)}
                    </td>
                    <td className="num">{m.outstandingTotal > 0 ? formatINR(m.outstandingTotal) : <span className="faint">—</span>}</td>
                    <td className="num">
                      {m.overdueTotal > 0 ? <span className="amount-neg">{formatINR(m.overdueTotal)}</span> : <span className="faint">—</span>}
                    </td>
                    <td className="num">
                      <Link to={`/members/${m.id}`} className="btn btn-sm btn-ghost">
                        Statement →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MemberFormModal open={!!showAdd} onClose={() => setShowAdd(null)} defaultRole={showAdd || MEMBER_ROLES.DEPOSITOR} />
    </div>
  );
}