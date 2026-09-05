import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import {
  reportOutstandingLoans,
  reportOverdue,
  reportMembersByCapital,
  sortLedger,
  deriveLoan,
} from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, Badge, MemberCell, Progress, EmptyState } from "../components/ui.jsx";

const REPORTS = [
  ["outstanding", "Outstanding loans"],
  ["overdue", "Overdue report"],
  ["members", "Member capital"],
  ["contributions", "Contribution report"],
  ["interest", "Interest report"],
  ["ledger", "Full ledger export"],
];

export default function Reports() {
  const { state } = useKopri();
  const [report, setReport] = useState("outstanding");

  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);
  const loanById = useMemo(() => Object.fromEntries(state.loans.map((l) => [l.id, l])), [state.loans]);

  const outstanding = useMemo(() => reportOutstandingLoans(state), [state]);
  const overdue = useMemo(() => reportOverdue(state), [state]);
  const byCapital = useMemo(() => reportMembersByCapital(state), [state]);

  const contributions = useMemo(() => {
    const map = new Map();
    for (const m of state.members) map.set(m.id, { member: m, total: 0, count: 0, first: null, last: null });
    for (const e of state.events) {
      if (e.type !== "MEMBER_CONTRIBUTION" || !e.memberId) continue;
      const row = map.get(e.memberId);
      if (!row) continue;
      row.total += Number(e.amount) || 0;
      row.count += 1;
      if (!row.first || e.date < row.first) row.first = e.date;
      if (!row.last || e.date > row.last) row.last = e.date;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [state]);

  const interest = useMemo(() => {
    const rows = [];
    for (const l of state.loans) {
      const v = deriveLoan(l, state.events);
      rows.push({ loan: v, member: memberById[l.memberId], interestPaid: v.interestPaid, interestDue: v.totalInterestDue, lateFees: v.lateFeesPaid });
    }
    return rows.sort((a, b) => b.interestPaid - a.interestPaid);
  }, [state, memberById]);

  const ledger = useMemo(() => sortLedger(state.events), [state.events]);

  const exportCSV = (name, header, rows) => {
    const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = (which) => {
    if (which === "outstanding")
      exportCSV(
        "outstanding-loans",
        ["Loan ID", "Borrower", "Principal", "Outstanding", "Overdue", "Status"],
        outstanding.map((l) => [l.id.toUpperCase(), memberById[l.memberId]?.name, l.principal, l.outstandingPrincipal, l.overduePrincipal + l.overdueInterest, l.effectiveStatus])
      );
    if (which === "overdue")
      exportCSV(
        "overdue",
        ["Loan ID", "Borrower", "Overdue Principal", "Overdue Interest", "Days Late"],
        overdue.map((l) => [l.id.toUpperCase(), memberById[l.memberId]?.name, l.overduePrincipal, l.overdueInterest, l.overdueDaysMax])
      );
    if (which === "members")
      exportCSV(
        "member-capital",
        ["Member", "Contributions", "Withdrawals", "Capital", "Outstanding Loans"],
        byCapital.map((m) => [m.name, m.contributions, m.withdrawals, m.capital, m.outstandingTotal])
      );
    if (which === "ledger")
      exportCSV(
        "ledger",
        ["Date", "Type", "Member", "Loan", "Account", "Amount", "Description"],
        ledger.map((e) => [e.date, e.type, memberById[e.memberId]?.name || "", e.loanId || "", e.type === "TRANSFER" ? `${e.from}->${e.to}` : e.account, e.amount, e.description])
      );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-sub">Generated live from the ledger — always current</div>
        </div>
      </div>

      <div className="tabs">
        {REPORTS.map(([k, label]) => (
          <button key={k} className={`tab ${report === k ? "active" : ""}`} onClick={() => setReport(k)}>
            {label}
          </button>
        ))}
      </div>

      {report === "outstanding" && (
        <Card title="Outstanding Loans" sub="All loans with principal still owed" pad={false} actions={<button className="btn btn-sm btn-ghost" onClick={() => download("outstanding")}>Export CSV</button>}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th className="num">Principal</th>
                  <th className="num">Repaid</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Overdue</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {outstanding.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <MemberCell name={memberById[l.memberId]?.name || "Unknown"} id={l.memberId} />
                    </td>
                    <td className="num">{formatINR(l.principal)}</td>
                    <td className="num">{formatINR(l.principalPaid)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{formatINR(l.outstandingPrincipal)}</td>
                    <td className={`num ${l.overduePrincipal + l.overdueInterest > 0 ? "amount-neg" : ""}`}>
                      {l.overduePrincipal + l.overdueInterest > 0 ? formatINR(l.overduePrincipal + l.overdueInterest) : "—"}
                    </td>
                    <td>
                      <Badge tone={l.isOverdue ? "red" : "blue"} dot={l.isOverdue}>
                        {l.isOverdue ? "Overdue" : "On track"}
                      </Badge>
                    </td>
                    <td className="num">
                      <Link to={`/loans/${l.id}`} className="btn btn-sm btn-ghost">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report === "overdue" && (
        <Card title="Overdue Report" sub="Installments past the due date + grace period" pad={false} actions={<button className="btn btn-sm btn-ghost" onClick={() => download("overdue")}>Export CSV</button>}>
          {overdue.length === 0 ? (
            <EmptyState icon="🎉" title="Nothing overdue" sub="Every installment is on time." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Loan</th>
                    <th className="num">Overdue principal</th>
                    <th className="num">Overdue interest</th>
                    <th className="num">Total at risk</th>
                    <th className="num">Days late</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <MemberCell name={memberById[l.memberId]?.name || "Unknown"} id={l.memberId} />
                      </td>
                      <td className="mono muted">{l.id.toUpperCase()}</td>
                      <td className="num">{formatINR(l.overduePrincipal)}</td>
                      <td className="num">{formatINR(l.overdueInterest)}</td>
                      <td className="num" style={{ fontWeight: 750, color: "var(--red)" }}>
                        {formatINR(l.overduePrincipal + l.overdueInterest)}
                      </td>
                      <td className="num">
                        <Badge tone={l.overdueDaysMax > 30 ? "red" : "amber"}>{l.overdueDaysMax} days</Badge>
                      </td>
                      <td className="num">
                        <Link to={`/loans/${l.id}`} className="btn btn-sm btn-ghost">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {report === "members" && (
        <Card title="Member Capital" sub="Ranked by current capital (derived from the ledger)" pad={false} actions={<button className="btn btn-sm btn-ghost" onClick={() => download("members")}>Export CSV</button>}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="num">Contributions</th>
                  <th className="num">Withdrawals</th>
                  <th className="num">Capital</th>
                  <th className="num">Loans out</th>
                  <th className="num">Share of pool</th>
                </tr>
              </thead>
              <tbody>
                {byCapital.map((m) => {
                  const total = byCapital.reduce((a, x) => a + x.capital, 0);
                  return (
                    <tr key={m.id}>
                      <td>
                        <MemberCell name={m.name} sub={m.phone} id={m.id} />
                      </td>
                      <td className="num">{formatINR(m.contributions)}</td>
                      <td className="num">{formatINR(m.withdrawals)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{formatINR(m.capital)}</td>
                      <td className="num">{m.outstandingTotal > 0 ? formatINR(m.outstandingTotal) : "—"}</td>
                      <td className="num">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                          <Progress value={m.capital} max={total} />
                          <span className="small muted">{total > 0 ? ((m.capital / total) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report === "contributions" && (
        <Card title="Contribution Report" sub="Every member contribution, aggregated" pad={false}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="num">Total contributed</th>
                  <th className="num"># contributions</th>
                  <th>First</th>
                  <th>Last</th>
                  <th className="num">Monthly avg</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map(({ member, total, count, first, last }) => (
                  <tr key={member.id}>
                    <td>
                      <MemberCell name={member.name} id={member.id} />
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>{formatINR(total)}</td>
                    <td className="num">{count}</td>
                    <td className="muted">{formatDate(first)}</td>
                    <td className="muted">{formatDate(last)}</td>
                    <td className="num">{count > 0 ? formatINR(total / count) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report === "interest" && (
        <Card title="Interest Report" sub="Interest earned and collected per loan" pad={false}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th className="num">Principal</th>
                  <th className="num">Interest scheduled</th>
                  <th className="num">Interest collected</th>
                  <th className="num">Late fees</th>
                  <th className="num">Collection rate</th>
                </tr>
              </thead>
              <tbody>
                {interest.map(({ loan: l, member, interestPaid, interestDue, lateFees }) => (
                  <tr key={l.id}>
                    <td>
                      <MemberCell name={member?.name || "Unknown"} id={l.memberId} />
                    </td>
                    <td className="num">{formatINR(l.principal)}</td>
                    <td className="num">{formatINR(interestDue)}</td>
                    <td className="num" style={{ fontWeight: 700, color: "var(--green)" }}>{formatINR(interestPaid)}</td>
                    <td className="num">{lateFees > 0 ? formatINR(lateFees) : "—"}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                        <Progress value={interestPaid} max={interestDue || 1} color="var(--green)" />
                        <span className="small muted">{interestDue > 0 ? Math.round((interestPaid / interestDue) * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report === "ledger" && (
        <Card title="Full Ledger" sub={`${ledger.length} events — everything the pool has done`} pad={false} actions={<button className="btn btn-sm btn-ghost" onClick={() => download("ledger")}>Export CSV</button>}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Member / Loan</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{formatDate(e.date)}</td>
                    <td className="muted">{e.type.replace(/_/g, " ").toLowerCase()}</td>
                    <td>
                      {e.memberId ? memberById[e.memberId]?.name : e.loanId ? <span className="mono">{loanById[e.loanId]?.id.toUpperCase()}</span> : "—"}
                    </td>
                    <td className="muted">{e.type === "TRANSFER" ? `${e.from} → ${e.to}` : e.account}</td>
                    <td className="muted">{e.description || ""}</td>
                    <td className="num">{formatINR(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}