import { useMemo } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from "recharts";
import { useKopri } from "../state/KopriContext.jsx";
import { derivePortfolio, monthlyCashFlow, sortLedger, cashDelta, depositSummary } from "../lib/calculations.js";
import { formatINR, formatNumber, formatDate, monthLabel } from "../lib/format.js";
import { Card, StatCard, Badge, EmptyState, Avatar } from "../components/ui.jsx";
import { IconMoney, IconWarning, IconUsers, IconLoan, IconLedger, IconArrow, IconCalendar } from "../components/Icons.jsx";

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12.5,
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <b>{formatINR(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { state } = useKopri();
  const portfolio = useMemo(() => derivePortfolio(state), [state]);
  const deposits = useMemo(() => depositSummary(state), [state]);
  const cashFlow = useMemo(() => monthlyCashFlow(state.events, 12), [state.events]);
  const recent = useMemo(() => sortLedger(state.events).slice(0, 8), [state.events]);
  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);
  const loanById = useMemo(() => Object.fromEntries(state.loans.map((l) => [l.id, l])), [state.loans]);

  const overdueLoans = portfolio.loanViews.filter((l) => l.isOverdue);
  const defaulted = portfolio.loanViews.filter((l) => l.effectiveStatus === "defaulted");

  // Loan portfolio composition for the bar chart
  const portfolioBars = portfolio.loanViews
    .filter((l) => l.outstandingPrincipal > 0)
    .sort((a, b) => b.outstandingPrincipal - a.outstandingPrincipal)
    .slice(0, 6)
    .map((l) => ({
      name: (memberById[l.memberId]?.name || "Unknown").split(" ")[0],
      outstanding: l.outstandingPrincipal,
      color: l.isOverdue ? "var(--red)" : "var(--primary)",
    }));

  const eventLabel = (e) => {
    const labels = {
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
      MANAGER_PAYOUT: "Manager's share",
      INTEREST_CAPITALIZED: "Interest capitalized",
      INTEREST_TO_ARREARS: "Interest to arrears",
      INTEREST_WAIVED: "Interest waived",
    };
    return labels[e.type] || e.type;
  };

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatCard
          label="Total Pool Assets"
          value={formatINR(portfolio.totalPoolAssets)}
          foot={`${formatINR(portfolio.accounts.total)} cash + ${formatINR(portfolio.loansOutstanding)} in loans`}
          color="var(--primary)"
          icon={<IconMoney />}
        />
        <StatCard
          label="Loans Outstanding"
          value={formatINR(portfolio.loansOutstanding)}
          foot={`${portfolio.activeLoans} active · ${portfolio.completedLoans} completed`}
          color="var(--blue)"
          icon={<IconLoan />}
        />
        <StatCard
          label="Interest Received"
          value={formatINR(portfolio.interestReceived)}
          foot={`+ ${formatINR(portfolio.lateFeesCollected)} late fees`}
          color="var(--green)"
        />
        <StatCard
          label="Interest Receivable"
          value={formatINR(portfolio.interestReceivable)}
          foot={`${formatINR(portfolio.overdueAmount)} overdue incl. principal · ${formatINR(portfolio.lateFeesDue)} late fees`}
          color="var(--amber)"
        />
        <StatCard
          label="Member Capital"
          value={formatINR(portfolio.totalCapital)}
          foot={`${portfolio.depositorsActive} active depositors`}
          color="var(--violet)"
          icon={<IconUsers />}
        />
        <StatCard
          label="Deposits This Month"
          value={formatINR(deposits.collected)}
          foot={`of ${formatINR(deposits.expected)} · ${deposits.unpaid.length} unpaid`}
          color="var(--green)"
          icon={<IconCalendar />}
        />
        <StatCard
          label="Cash & Bank"
          value={formatINR(portfolio.accounts.total)}
          foot={`${formatINR(portfolio.accounts.cash)} cash · ${formatINR(portfolio.accounts.bank)} bank`}
          color="var(--teal)"
        />
      </div>

      {(overdueLoans.length > 0 || defaulted.length > 0) && (
        <div className={`alert ${defaulted.length > 0 ? "alert-red" : "alert-amber"}`}>
          <IconWarning width={18} height={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>{overdueLoans.length} overdue loan{overdueLoans.length === 1 ? "" : "s"}</b>
            {defaulted.length > 0 && <> · {defaulted.length} defaulted</>} —{" "}
            {formatINR(portfolio.overdueAmount)} at risk
            {portfolio.lateFeesDue > 0.005 && <>, plus {formatINR(portfolio.lateFeesDue)} late fees built up</>}.
            <Link to="/loans" style={{ fontWeight: 700, textDecoration: "underline", marginLeft: 6 }}>
              Review
            </Link>
          </div>
        </div>
      )}

      {deposits.lateMembers.length > 0 && (
        <div className="alert alert-amber">
          <IconCalendar width={18} height={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>
              {deposits.lateMembers.length} member{deposits.lateMembers.length === 1 ? " is" : "s are"} behind on monthly deposits
            </b>{" "}
            — {formatINR(deposits.arrears)} in arrears ({deposits.lateMembers.map((r) => r.member.name.split(" ")[0]).join(", ")}).
            <Link to="/deposits" style={{ fontWeight: 700, textDecoration: "underline", marginLeft: 6 }}>
              Review
            </Link>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card title="Cash Flow — last 12 months" sub="Inflows vs outflows from the ledger" pad>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "var(--text-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tick={{ fill: "var(--text-faint)", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="inflows" name="Inflows" stroke="#16a34a" fill="url(#inflow)" strokeWidth={2} />
                <Area type="monotone" dataKey="outflows" name="Outflows" stroke="#dc2626" fill="url(#outflow)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Loan Portfolio" sub="Outstanding principal by borrower" pad>
          {portfolioBars.length === 0 ? (
            <EmptyState icon="🏦" title="No loans yet" />
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {portfolioBars.map((b) => (
                <div className="bar-row" key={b.name}>
                  <div className="bar-label">{b.name}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(b.outstanding / portfolioBars[0].outstanding) * 100}%`, background: b.color }}
                    >
                      {formatINR(b.outstanding)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="spread small faint" style={{ marginTop: 4 }}>
                <span>{portfolio.loanViews.length} loans total</span>
                <Link to="/loans" style={{ fontWeight: 650, color: "var(--primary-text)" }}>
                  View all →
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent Transactions" sub="Latest activity from the ledger" pad={false} actions={<Link to="/ledger" className="btn btn-sm btn-ghost">Full ledger</Link>}>
        {recent.length === 0 ? (
          <EmptyState icon="🧾" title="No transactions yet" sub="Record contributions and loans to get started" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Member</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => {
                  const member = e.memberId ? memberById[e.memberId] : null;
                  const isIn = cashDelta(e) > 0;
                  const isOut = cashDelta(e) < 0;
                  return (
                    <tr key={e.id}>
                      <td className="muted">{formatDate(e.date)}</td>
                      <td>
                        <Badge tone={isIn ? "green" : isOut ? "red" : "gray"}>{eventLabel(e)}</Badge>
                      </td>
                      <td>{member ? member.name : <span className="faint">—</span>}</td>
                      <td className="muted">{e.description || ""}</td>
                      <td className={`num ${isIn ? "amount-pos" : isOut ? "amount-neg" : "amount-mut"}`}>
                        {e.type === "TRANSFER" ? "↔" : isIn ? "+" : isOut ? "−" : ""}
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

      {overdueLoans.length > 0 && (
        <Card title="Overdue Attention" sub="Installments past due date + grace period" pad>
          <div className="stack" style={{ gap: 10 }}>
            {overdueLoans.map((l) => (
              <Link to={`/loans/${l.id}`} key={l.id} className="spread" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-soft)" }}>
                <div className="member-cell">
                  <Avatar name={memberById[l.memberId]?.name || "?"} id={l.memberId} />
                  <div>
                    <div style={{ fontWeight: 650 }}>{memberById[l.memberId]?.name || "Unknown"}</div>
                    <div className="small faint">
                      Due {formatDate(l.installments.find((i) => i.status === "overdue")?.dueDate)} · {l.overdueDaysMax} days late
                    </div>
                  </div>
                </div>
                <div className="num" style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 750, color: "var(--red)" }}>{formatINR(l.overduePrincipal + l.overdueInterest)}</div>
                  <div className="small faint">{formatINR(l.outstandingPrincipal)} outstanding</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="spread small faint" style={{ paddingTop: 6 }}>
        <span>Data is stored in this browser (localStorage + session cookie). No server yet — coming later.</span>
        <span>{formatNumber(state.events.length)} ledger events · {state.members.length} members · {state.loans.length} loans</span>
      </div>
    </div>
  );
}