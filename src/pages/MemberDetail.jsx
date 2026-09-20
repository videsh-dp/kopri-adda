import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveMember, deriveLoan, sortLedger } from "../lib/calculations.js";
import { formatINR, formatDate } from "../lib/format.js";
import { Card, StatCard, StatusBadge, Button, Badge, MemberCell, Avatar, Progress, EmptyState } from "../components/ui.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconPlus, IconArrow, IconCash } from "../components/Icons.jsx";
import { EVENT_TYPES } from "../lib/constants.js";
import { toast } from "../components/ui.jsx";

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useKopri();
  const [showEvent, setShowEvent] = useState(null); // preset for the event modal
  const [quickRecord, setQuickRecord] = useState(null); // preset with loanId + memberId pre-filled

  const member = state.members.find((m) => m.id === id);
  const view = useMemo(() => (member ? deriveMember(member, state.events, state.loans) : null), [member, state.events, state.loans]);

  const loans = useMemo(
    () => state.loans.filter((l) => l.memberId === id).map((l) => deriveLoan(l, state.events)),
    [state.loans, state.events, id]
  );
  const ledger = useMemo(
    () => sortLedger(state.events.filter((e) => e.memberId === id)),
    [state.events, id]
  );

  if (!member || !view) {
    return (
      <div>
        <EmptyState icon="🔍" title="Member not found" sub="They may have been removed." />
        <div style={{ textAlign: "center" }}>
          <Button onClick={() => navigate("/members")}>← Back to members</Button>
        </div>
      </div>
    );
  }

  const eventLabel = (t) =>
    ({
      MEMBER_CONTRIBUTION: "Contribution",
      MEMBER_WITHDRAWAL: "Withdrawal",
      LOAN_DISBURSEMENT: "Disbursement",
      PRINCIPAL_PAYMENT: "Principal repaid",
      INTEREST_PAYMENT: "Interest paid",
      LATE_FEE: "Late fee",
      PROFIT_ALLOCATION: "Profit allocated",
      MEMBER_SETTLEMENT: "Settlement",
      ADJUSTMENT: "Adjustment",
    }[t] || t);

  return (
    <div className="stack">
      <div className="spread">
        <Link to="/members" className="btn btn-ghost btn-sm">
          <IconArrow style={{ transform: "rotate(180deg)" }} /> Members
        </Link>
        <div className="row">
          <Button size="sm" onClick={() => { setShowEvent({ type: EVENT_TYPES.CONTRIBUTION, memberId: id }); setQuickRecord(null); }}>
            <IconPlus /> Contribution
          </Button>
          <Button size="sm" variant="danger" onClick={() => { setShowEvent({ type: EVENT_TYPES.WITHDRAWAL, memberId: id }); setQuickRecord(null); }}>
            Withdrawal
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setQuickRecord({ memberId: id }); setShowEvent({}); }}>
            <IconPlus /> Record transaction
          </Button>
        </div>
      </div>

      <Card>
        <div className="spread">
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={member.name} id={member.id} size="lg" />
            <div>
              <div style={{ fontSize: 19, fontWeight: 750 }}>{member.name}</div>
              <div className="small muted">
                {member.phone && <>📞 {member.phone} · </>}
                {member.email && <>{member.email} · </>}
                joined {formatDate(member.joinedAt)}
              </div>
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={member.status} />
                {view.activeLoans > 0 && <Badge tone="blue" style={{ marginLeft: 5 }}>{view.activeLoans} active loans</Badge>}
              </div>
            </div>
          </div>
          <div className="kpi-row">
            <div className="kpi">
              <b>{formatINR(view.capital)}</b>
              Current capital
            </div>
            <div className="kpi">
              <b>{formatINR(view.entitlement)}</b>
              Entitlement (incl. profit)
            </div>
            <div className="kpi">
              <b>{formatINR(view.outstandingTotal)}</b>
              Loans outstanding
            </div>
            <div className="kpi">
              <b className={view.overdueTotal > 0 ? "amount-neg" : ""}>{formatINR(view.overdueTotal)}</b>
              Overdue
            </div>
          </div>
        </div>
      </Card>

      <div className="stat-grid">
        <StatCard label="Total contributed" value={formatINR(view.contributions)} foot="All MEMBER_CONTRIBUTION events" color="var(--green)" />
        <StatCard label="Withdrawn" value={formatINR(view.withdrawals)} foot="All MEMBER_WITHDRAWAL events" color="var(--red)" />
        <StatCard label="Profit allocated" value={formatINR(view.profitAllocated)} foot="Year-end allocations" color="var(--violet)" />
        <StatCard label="Settled (payouts)" value={formatINR(view.settled)} foot="Year-end settlements paid" color="var(--teal)" />
      </div>

      <Card title="Loans" sub="All loans taken by this member" pad={false}>
        {loans.length === 0 ? (
          <EmptyState icon="🏦" title="No loans" sub="This member hasn't borrowed yet." />
        ) : (
          <div className="table-wrap sticky-header">
            <table className="data">
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Principal</th>
                  <th>Rate</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Repaid %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="row-link" onClick={() => navigate(`/loans/${l.id}`)}>
                    <td className="muted mono">{l.id.toUpperCase()}</td>
                    <td>{formatINR(l.principal)}</td>
                    <td className="muted">
                      {l.rate}% / {l.rateUnit === "yearly" ? "yr" : "mo"} · {l.interestMethod.replace("_", " ")}
                    </td>
                    <td className="muted">{formatDate(l.startDate)}</td>
                    <td>
                      <StatusBadge status={l.effectiveStatus} />
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
                      <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                        <Link to={`/loans/${l.id}`} className="btn btn-sm btn-ghost">
                          Details →
                        </Link>
                        {l.status === "overdue" || l.status === "due" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              const amt = Math.max(l.principalLeft + l.interestLeft, 1);
                              const nextInstallment = l.installments.find(
                                (i) => i.status === "due" || i.status === "overdue"
                              );
                              setShowEvent({
                                memberId: id,
                                loanId: l.id,
                                amount: String(amt),
                                date: new Date().toISOString().slice(0, 10),
                                description: `Pay ${nextInstallment ? `installment #${nextInstallment.index + 1}` : "loan repayment"}`,
                                quickPay: true,
                              });
                              setQuickRecord({ memberId: id, loanId: l.id });
                              toast(`Recording repayment for ${l.id.toUpperCase()}.`);
                            }}
                            disabled={l.outstandingPrincipal <= 0.5}
                          >
                            <IconCash width={13} height={13} />
                            Pay
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Statement" sub={`${ledger.length} ledger events — balance is always derived`} pad={false}>
        {ledger.length === 0 ? (
          <EmptyState icon="🧾" title="No activity yet" />
        ) : (
          <div className="table-wrap sticky-header">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th className="num">Running capital</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  const rows = [];
                  for (const e of [...ledger].reverse()) {
                    const isIn = ["MEMBER_CONTRIBUTION", "PROFIT_ALLOCATION"].includes(e.type) || (e.type === "ADJUSTMENT" && e.sign !== "negative");
                    const isOut = ["MEMBER_WITHDRAWAL", "MEMBER_SETTLEMENT"].includes(e.type) || (e.type === "ADJUSTMENT" && e.sign === "negative");
                    if (isIn) running += Number(e.amount) || 0;
                    if (isOut) running -= Number(e.amount) || 0;
                    rows.push({ e, isIn, isOut, running });
                  }
                  return rows.map(({ e, isIn, isOut, running }) => (
                    <tr key={e.id}>
                      <td className="muted">{formatDate(e.date)}</td>
                      <td>
                        <Badge tone={isIn ? "green" : isOut ? "red" : "gray"}>{eventLabel(e.type)}</Badge>
                      </td>
                      <td className="muted">{e.description || ""}</td>
                      <td className={`num ${isIn ? "amount-pos" : isOut ? "amount-neg" : "amount-mut"}`}>
                        {e.type === "TRANSFER" ? "↔" : isIn ? "+" : isOut ? "−" : ""}
                        {formatINR(e.amount)}
                      </td>
                      <td className="num mono" style={{ fontWeight: 650 }}>
                        {formatINR(running)}
                      </td>
                      <td className="num">
                        {e.type === "ADJUSTMENT" && (
                          <span className="small faint">{e.sign === "negative" ? "deduct" : "add"}</span>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EventFormModal
        open={!!showEvent}
        onClose={() => { setShowEvent(null); setQuickRecord(null); }}
        preset={showEvent || {}}
        editEvent={quickRecord}
      />
    </div>
  );
}