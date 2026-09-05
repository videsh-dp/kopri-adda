import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveLoan, deriveMember } from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, StatCard, StatusBadge, Button, Badge, MemberCell, Avatar, Progress, EmptyState } from "../components/ui.jsx";
import { LoanFormModal } from "../components/modals.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconArrow, IconPlus } from "../components/Icons.jsx";
import { EVENT_TYPES } from "../lib/constants.js";

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useKopri();
  const [showRepay, setShowRepay] = useState(null); // preset for the event modal
  const [quickRepay, setQuickRepay] = useState(null); // pre-filled loan/member context
  const [showEdit, setShowEdit] = useState(false);

  const loan = state.loans.find((l) => l.id === id);
  const view = useMemo(() => (loan ? deriveLoan(loan, state.events) : null), [loan, state.events]);
  const borrower = loan ? state.members.find((m) => m.id === loan.memberId) : null;
  const borrowerView = borrower ? deriveMember(borrower, state.events, state.loans) : null;
  const guarantors = loan ? loan.guarantorIds?.map((g) => state.members.find((m) => m.id === g)).filter(Boolean) : [];

  if (!loan || !view) {
    return (
      <div>
        <EmptyState icon="🔍" title="Loan not found" />
        <div style={{ textAlign: "center" }}>
          <Button onClick={() => navigate("/loans")}>← Back to loans</Button>
        </div>
      </div>
    );
  }

  const totals = view.schedule.reduce(
    (a, i) => ({
      principal: a.principal + i.principalDue,
      interest: a.interest + i.interestDue,
    }),
    { principal: 0, interest: 0 }
  );

  const nextDue = view.installments.find((i) => i.status === "due" || i.status === "overdue");
  const nextDueAmount = nextDue ? Math.max(nextDue.principalLeft + nextDue.interestLeft, 0) : 0;

  return (
    <div className="stack">
      <div className="spread">
        <Link to="/loans" className="btn btn-ghost btn-sm">
          <IconArrow style={{ transform: "rotate(180deg)" }} /> Loans
        </Link>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => setShowEdit(true)}>
            Edit terms
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={view.outstandingPrincipal <= 0.5}
            onClick={() => {
              setShowRepay({
                type: EVENT_TYPES.PRINCIPAL_PAYMENT,
                memberId: loan.memberId,
                loanId: loan.id,
                amount: String(Math.max(nextDueAmount, 1)),
                date: new Date().toISOString().slice(0, 10),
                description: "Repayment — principal",
              });
              setQuickRepay({ memberId: loan.memberId, loanId: loan.id });
            }}
          >
            <IconPlus /> Record repayment
          </Button>
        </div>
      </div>

      <Card>
        <div className="spread">
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={borrower?.name || "?"} id={loan.memberId} size="lg" />
            <div>
              <div style={{ fontSize: 19, fontWeight: 750 }}>
                {borrower?.name || "Unknown borrower"}
                <span className="mono muted" style={{ fontSize: 13, marginLeft: 8 }}>
                  {loan.id.toUpperCase()}
                </span>
              </div>
              <div className="small muted">
                {formatINR(loan.principal)} @ {loan.rate}%/{loan.rateUnit === "yearly" ? "yr" : "mo"} · {loan.interestMethod.replace("_", " ")} ·{" "}
                {loan.tenureMonths} months from {formatDate(loan.startDate)}
              </div>
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={view.effectiveStatus} />
                {loan.security && <Badge tone="gray" style={{ marginLeft: 5 }}>🔒 {loan.security}</Badge>}
              </div>
            </div>
          </div>
          <div className="kpi-row">
            <div className="kpi">
              <b>{formatINR(view.outstandingPrincipal)}</b>Principal out
            </div>
            <div className="kpi">
              <b className={view.overduePrincipal + view.overdueInterest > 0 ? "amount-neg" : ""}>
                {formatINR(view.overduePrincipal + view.overdueInterest)}
              </b>
              Overdue
            </div>
            <div className="kpi">
              <b>{formatINR(view.interestPaid)}</b>Interest paid
            </div>
            <div className="kpi">
              <b>{formatINR(totals.interest)}</b>Total interest due
            </div>
          </div>
        </div>
        {nextDue && (
          <div className={`alert ${nextDue.status === "overdue" ? "alert-red" : "alert-blue"}`} style={{ marginTop: 14 }}>
            {nextDue.status === "overdue" ? (
              <b>
                Installment #{nextDue.index + 1} is {nextDue.overdueDays} days overdue — {formatINR(nextDue.principalLeft + nextDue.interestLeft)} due.
              </b>
            ) : (
              <b>
                Next installment #{nextDue.index + 1} due {formatDate(nextDue.dueDate)} — {formatINR(nextDue.totalDue)}.
              </b>
            )}
          </div>
        )}
      </Card>

      <div className="stat-grid">
        <StatCard label="Principal repaid" value={formatINR(view.principalPaid)} foot={`${Math.round(view.paidRatio * 100)}% of ${formatINR(loan.principal)}`} color="var(--teal)" />
        <StatCard label="Interest received" value={formatINR(view.interestPaid)} foot={`of ${formatINR(totals.interest)} scheduled`} color="var(--green)" />
        <StatCard label="Late fees collected" value={formatINR(view.lateFeesPaid)} foot="Penalties on late installments" color="var(--amber)" />
        <StatCard label="Borrower capital" value={formatINR(borrowerView?.capital || 0)} foot="Security against this loan" color="var(--violet)" />
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <Card title="Repayment Schedule" sub={`${view.installments.length} installments · ${loan.principalRepayment.replace("_", " ")} principal · ${loan.interestCollection} interest`} pad={false} className="grow">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due date</th>
                  <th className="num">Principal</th>
                  <th className="num">Interest</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {view.installments.map((i) => (
                  <tr key={i.index} className={i.status === "overdue" ? "row-link" : ""}>
                    <td className="muted mono">{i.index + 1}</td>
                    <td className="muted">
                      {formatDate(i.dueDate)}
                      {i.status === "overdue" && (
                        <div className="small" style={{ color: "var(--red)" }}>
                          {i.overdueDays}d late
                        </div>
                      )}
                    </td>
                    <td className="num">{formatINR(i.principalDue)}</td>
                    <td className="num">{formatINR(i.interestDue)}</td>
                    <td className="num" style={{ fontWeight: 650 }}>{formatINR(i.totalDue)}</td>
                    <td className="num mono">{formatINR(i.principalPaid + i.interestPaid)}</td>
                    <td>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="num">
                      {i.status !== "paid" && (                          <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const date = new Date().toISOString().slice(0, 10);
                            setShowRepay({
                              type: EVENT_TYPES.PRINCIPAL_PAYMENT,
                              memberId: loan.memberId,
                              loanId: loan.id,
                              amount: String(Math.max(i.principalLeft, 0.01)),
                              date,
                              description: `Installment ${i.index + 1} — principal`,
                            });
                            setQuickRepay({ memberId: loan.memberId, loanId: loan.id });
                          }}
                        >
                          Pay
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ width: 300, flexShrink: 0 }}>
          <Card title="Loan Terms" pad>
            <div className="stack" style={{ gap: 8 }}>
              {[
                ["Principal", formatINR(loan.principal)],
                ["Rate", `${loan.rate}% / ${loan.rateUnit === "yearly" ? "year" : "month"}`],
                ["Interest method", loan.interestMethod.replace("_", " ")],
                ["Interest collected", loan.interestCollection],
                ["Principal repayment", loan.principalRepayment.replace("_", " ")],
                ["Tenure", `${loan.tenureMonths} months`],
                ["Grace period", `${loan.gracePeriodDays} days`],
                ["Late rule", loan.lateRule.replace(/_/g, " ")],
                ["Unpaid interest", loan.unpaidInterestRule.replace(/_/g, " ")],
              ].map(([k, v]) => (
                <div className="spread" key={k}>
                  <span className="small muted">{k}</span>
                  <span className="small" style={{ fontWeight: 650, textAlign: "right" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Guarantors & Security" pad style={{ marginTop: 14 }}>
            {guarantors.length === 0 && !loan.security ? (
              <div className="small muted">None recorded.</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {guarantors.map((g) => (
                  <Link to={`/members/${g.id}`} key={g.id} className="row" style={{ gap: 10 }}>
                    <Avatar name={g.name} id={g.id} size="sm" />
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 13.5 }}>{g.name}</div>
                      <div className="small faint">Guarantor</div>
                    </div>
                  </Link>
                ))}
                {loan.security && (
                  <div className="small" style={{ background: "var(--bg-soft)", borderRadius: 8, padding: "8px 10px" }}>
                    🔒 {loan.security}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <EventFormModal
        open={!!showRepay}
        onClose={() => { setShowRepay(null); setQuickRepay(null); }}
        preset={showRepay || {}}
        editEvent={quickRepay}
      />
      <LoanFormModal open={showEdit} onClose={() => setShowEdit(false)} editLoan={loan} />
    </div>
  );
}