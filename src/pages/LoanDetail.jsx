import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveLoan, deriveMember } from "../lib/calculations.js";
import { formatINR, formatDate, round2, todayISO } from "../lib/format.js";
import { Card, StatCard, StatusBadge, Button, Badge, MemberCell, Avatar, Progress, EmptyState, ConfirmModal, toast } from "../components/ui.jsx";
import { LoanFormModal, EventFormModal } from "../components/modals.jsx";
import { IconArrow, IconPlus, IconEdit, IconTrash } from "../components/Icons.jsx";
import { EVENT_TYPES } from "../lib/constants.js";

const PAYMENT_TYPES = [EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE];

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, deleteEvent, addEvent, updateLoan } = useKopri();
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);
  const [showRepay, setShowRepay] = useState(null); // quick-pay preset for the event modal
  const [editEvent, setEditEvent] = useState(null); // event being edited
  const [deleteConfirm, setDeleteConfirm] = useState(null); // event pending delete
  const [showEdit, setShowEdit] = useState(false);

  const loan = state.loans.find((l) => l.id === id);
  const view = useMemo(() => (loan ? deriveLoan(loan, state.events) : null), [loan, state.events]);
  const borrower = loan ? state.members.find((m) => m.id === loan.memberId) : null;
  const borrowerView = borrower ? deriveMember(borrower, state.events, state.loans) : null;
  const guarantors = loan ? loan.guarantorIds?.map((g) => state.members.find((m) => m.id === g)).filter(Boolean) : [];
  const referrer = loan?.referredById ? state.members.find((m) => m.id === loan.referredById) : null;

  // Payment events tagged to each installment, for per-installment edit/delete.
  const eventsByInstallment = useMemo(() => {
    const map = new Map(); // installmentIndex -> [events]
    if (!loan) return map;
    for (const e of state.events) {
      if (e.loanId !== loan.id || !PAYMENT_TYPES.includes(e.type)) continue;
      if (e.installmentIndex === undefined || e.installmentIndex === null) continue;
      const arr = map.get(e.installmentIndex) || [];
      arr.push(e);
      map.set(e.installmentIndex, arr);
    }
    return map;
  }, [loan, state.events]);

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

  // Open quick-pay for one installment (principal + interest by default).
  const openQuickPay = (inst) => {
    setShowRepay({
      quickPay: true,
      memberId: loan.memberId,
      loanId: loan.id,
      installmentIndex: inst.index,
      amount: String(round2(Math.max(inst.principalLeft + inst.interestLeft, 0))),
      date: todayISO(),
      description: `Installment ${inst.index + 1}`,
    });
  };

  // Open quick-pay for the next due installment (header button).
  const openNextDuePay = () => {
    if (nextDue) {
      openQuickPay(nextDue);
    } else {
      setShowRepay({
        type: EVENT_TYPES.PRINCIPAL_PAYMENT,
        memberId: loan.memberId,
        loanId: loan.id,
        amount: String(round2(Math.max(view.outstandingPrincipal, 1))),
        date: todayISO(),
        description: "Repayment — principal",
      });
    }
  };

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
          {!view.isWrittenOff && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = loan.status === "defaulted" ? "active" : "defaulted";
                updateLoan(loan.id, { status: next });
                toast(next === "defaulted" ? "Loan marked as defaulted." : "Loan marked as active again.");
              }}
            >
              {loan.status === "defaulted" ? "Clear default" : "Mark defaulted"}
            </Button>
          )}
          {view.outstandingPrincipal > 0.5 && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmWriteOff(true)}>
              Write off
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={view.outstandingPrincipal <= 0.5}
            onClick={openNextDuePay}
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
                Installment #{nextDue.index + 1} is {nextDue.overdueDays} days overdue — {formatINR(nextDue.principalLeft + nextDue.interestLeft)} due
                {view.lateFeesDue > 0.005 ? <>, plus {formatINR(view.lateFeesDue)} late fees built up so far</> : null}.
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
        <StatCard
          label="Late fees due"
          value={formatINR(view.lateFeesDue)}
          foot={`${formatINR(view.lateFeesPaid)} collected so far · ${loan.lateRule.replace(/_/g, " ")}`}
          color="var(--amber)"
        />
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
                  <th className="num" style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {view.installments.map((i) => {
                  const recorded = eventsByInstallment.get(i.index) || [];
                  return (
                    <tr key={i.index}>
                      <td className="muted mono">{i.index + 1}</td>
                      <td className="muted">
                        {formatDate(i.dueDate)}
                        {i.status === "overdue" && (
                          <div className="small" style={{ color: "var(--red)" }}>
                            {i.overdueDays}d late
                            {i.lateFeeDue > 0.005 && <> · +{formatINR(i.lateFeeDue, { precise: true })} late fee</>}
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
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                          {i.status !== "paid" && (
                            <Button size="sm" variant="ghost" onClick={() => openQuickPay(i)} title="Record payment for this installment">
                              Pay
                            </Button>
                          )}
                          {recorded.map((ev) => (
                            <span key={ev.id} className="row" style={{ gap: 2 }}>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => setEditEvent(ev)}
                                title={`Edit ${ev.type === EVENT_TYPES.INTEREST_PAYMENT ? "interest" : ev.type === EVENT_TYPES.LATE_FEE ? "late fee" : "principal"} payment (${formatINR(ev.amount)})`}
                                style={{ padding: "4px 8px", borderRadius: 8 }}
                              >
                                <IconEdit width={13} height={13} />
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => setDeleteConfirm(ev)}
                                title="Delete this payment"
                                style={{ padding: "4px 8px", borderRadius: 8, color: "var(--red)" }}
                              >
                                <IconTrash width={13} height={13} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small faint" style={{ padding: "8px 14px" }}>
            ✎ edits a payment recorded against that installment · 🗑 removes it · Pay lets you pay principal, interest or both, in full or in part, plus any late fee
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
                ...(loan.lateRule === "fixed_penalty" ? [["Late fee", `${formatINR(loan.lateFixedPenalty)} / installment`]] : []),
                ...(loan.lateRule === "percentage_penalty" ? [["Late fee", `${loan.latePercentagePenalty}% of overdue`]] : []),
                ...(loan.lateRule === "additional_interest" ? [["Extra late interest", `${loan.lateAdditionalInterestRate}% / month`]] : []),
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

          <Card title="Referral, Guarantors & Security" pad style={{ marginTop: 14 }}>
            {!referrer && guarantors.length === 0 && !loan.security ? (
              <div className="small muted">None recorded.</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {referrer && (
                  <Link to={`/members/${referrer.id}`} className="row" style={{ gap: 10 }}>
                    <Avatar name={referrer.name} id={referrer.id} size="sm" />
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 13.5 }}>{referrer.name}</div>
                      <div className="small faint">Referred this loan</div>
                    </div>
                  </Link>
                )}
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
        onClose={() => setShowRepay(null)}
        preset={showRepay || {}}
      />
      <EventFormModal
        open={!!editEvent}
        onClose={() => setEditEvent(null)}
        editEvent={editEvent}
        onDelete={(ev) => {
          deleteEvent(ev.id);
          toast("Payment deleted.");
        }}
      />
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteEvent(deleteConfirm.id);
            toast("Payment deleted.");
          }
          setDeleteConfirm(null);
        }}
        title="Delete payment?"
        confirmLabel="Delete"
        danger
      >
        <p className="muted">
          This removes the {deleteConfirm?.type === EVENT_TYPES.INTEREST_PAYMENT ? "interest" : deleteConfirm?.type === EVENT_TYPES.LATE_FEE ? "late fee" : "principal"} payment
          {" "}<b>{formatINR(deleteConfirm?.amount || 0)}</b> recorded on {formatDate(deleteConfirm?.date)}.
          <br /><br />
          The installment status will re-derive automatically. This cannot be undone.
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmWriteOff}
        onClose={() => setConfirmWriteOff(false)}
        onConfirm={() => {
          addEvent({
            type: EVENT_TYPES.LOAN_WRITE_OFF,
            date: todayISO(),
            memberId: loan.memberId,
            loanId: loan.id,
            amount: view.outstandingPrincipal,
            description: "Bad debt write-off (remaining principal)",
          });
          setConfirmWriteOff(false);
          toast("Loan written off.");
        }}
        title="Write off this loan?"
        confirmLabel="Write off"
        danger
      >
        <p className="muted">
          Records a <b>bad debt write-off</b> of <b>{formatINR(view.outstandingPrincipal, { precise: true })}</b> (the principal still
          outstanding). The loan closes as defaulted and the amount is deducted from this year's profit. No cash moves. You can undo it by
          deleting the write-off from the ledger.
        </p>
      </ConfirmModal>
      {showEdit && <LoanFormModal open={showEdit} onClose={() => setShowEdit(false)} editLoan={loan} />}
    </div>
  );
}
