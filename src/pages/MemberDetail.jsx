import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { deriveMember, deriveLoan, sortLedger, deriveDeposits, isDepositor, memberRole } from "../lib/calculations.js";
import { formatINR, formatDate, round2, todayISO } from "../lib/format.js";
import { Card, StatCard, StatusBadge, Button, Badge, MemberCell, Avatar, Progress, EmptyState } from "../components/ui.jsx";
import { EventFormModal, MemberFormModal } from "../components/modals.jsx";
import { IconPlus, IconArrow, IconCash } from "../components/Icons.jsx";
import { EVENT_TYPES, MEMBER_ROLE_LABELS } from "../lib/constants.js";
import { toast } from "../components/ui.jsx";

const monthName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useKopri();
  const [showEvent, setShowEvent] = useState(null); // preset for the event modal
  const [quickRecord, setQuickRecord] = useState(null); // preset with loanId + memberId pre-filled
  const [showEdit, setShowEdit] = useState(false);
  const [allMonths, setAllMonths] = useState(false);

  const member = state.members.find((m) => m.id === id);
  const view = useMemo(() => (member ? deriveMember(member, state.events, state.loans) : null), [member, state.events, state.loans]);

  const loans = useMemo(
    () => state.loans.filter((l) => l.memberId === id).map((l) => deriveLoan(l, state.events)),
    [state.loans, state.events, id]
  );
  const deposits = useMemo(
    () => (member ? deriveDeposits(member, state.events, state.rules) : null),
    [member, state.events, state.rules]
  );
  const referredLoans = useMemo(() => state.loans.filter((l) => l.referredById === id), [state.loans, id]);
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
      LOAN_WRITE_OFF: "Write-off",
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
          <Button size="sm" variant="ghost" onClick={() => setShowEdit(true)}>
            Edit profile
          </Button>
          {isDepositor(member) && (
            <Button
              size="sm"
              onClick={() => {
                setShowEvent({
                  type: EVENT_TYPES.CONTRIBUTION,
                  memberId: id,
                  amount: String(deposits.arrears > 0 ? deposits.arrears : deposits.amount || 1000),
                  description: "Monthly deposit",
                });
                setQuickRecord(null);
              }}
            >
              <IconPlus /> Deposit
            </Button>
          )}
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
              {(member.address || member.occupation || member.idProof || member.nominee) && (
                <div className="small muted" style={{ marginTop: 2 }}>
                  {[member.address, member.occupation, member.idProof, member.nominee && `Nominee: ${member.nominee}`].filter(Boolean).join(" · ")}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={member.status} />
                <Badge tone={isDepositor(member) ? "violet" : "gray"} style={{ marginLeft: 5 }}>
                  {MEMBER_ROLE_LABELS[memberRole(member)]}
                </Badge>
                {isDepositor(member) && <Badge tone="gray" style={{ marginLeft: 5 }}>{formatINR(deposits.amount)}/month</Badge>}
                {referredLoans.length > 0 && <Badge tone="blue" style={{ marginLeft: 5 }}>Referred {referredLoans.length} loan{referredLoans.length > 1 ? "s" : ""}</Badge>}
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

      {isDepositor(member) && (
        <Card
          title="Monthly Deposits"
          sub={`${formatINR(deposits.amount)} due on day ${state.rules.depositDueDay}, late after day ${state.rules.depositDeadlineDay}`}
          pad={false}
          actions={
            deposits.months.length > 6 ? (
              <Button size="sm" variant="ghost" onClick={() => setAllMonths((v) => !v)}>
                {allMonths ? "Show recent" : `Show all ${deposits.months.length} months`}
              </Button>
            ) : null
          }
        >
          {deposits.lateMonths > 0 && (
            <div className="alert alert-red" style={{ margin: "12px 14px 0" }}>
              <b>
                {deposits.lateMonths} month{deposits.lateMonths === 1 ? "" : "s"} unpaid after the deadline — {formatINR(deposits.arrears)} in arrears
                {deposits.lateFeesDue > 0 && <> plus {formatINR(deposits.lateFeesDue)} late fees</>}.
              </b>
            </div>
          )}
          {deposits.months.length === 0 ? (
            <EmptyState icon="🗓️" title="No deposits scheduled" sub="Set a monthly deposit amount in the profile." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Due date</th>
                    <th>Deadline</th>
                    <th className="num">Deposit</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                    <th className="num">Late fee</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...deposits.months]
                    .reverse()
                    .slice(0, allMonths ? undefined : 6)
                    .map((m) => (
                      <tr key={m.month} className={m.status === "late" ? "row-late" : ""}>
                        <td style={{ fontWeight: 650 }}>{monthName(m.month)}</td>
                        <td className="muted">{formatDate(m.dueDate)}</td>
                        <td className="muted">{formatDate(m.deadline)}</td>
                        <td className="num">{formatINR(m.expected)}</td>
                        <td className="num">
                          {formatINR(m.paid)}
                          {m.paidDate && <div className="small faint">{formatDate(m.paidDate)}</div>}
                        </td>
                        <td>
                          <StatusBadge status={m.status} />
                        </td>
                        <td className="num">
                          {m.lateFee > 0 ? (
                            m.lateFeeDue > 0 ? <span className="amount-neg">{formatINR(m.lateFeeDue)}</span> : <span className="small muted">paid</span>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          {m.left > 0.5 && (
                            <Button
                              size="sm"
                              variant={m.status === "late" ? "primary" : "ghost"}
                              onClick={() =>
                                setShowEvent({
                                  type: EVENT_TYPES.CONTRIBUTION,
                                  memberId: id,
                                  amount: String(m.left),
                                  depositMonth: m.month,
                                  date: todayISO(),
                                  description: `Monthly deposit, ${monthName(m.month)}`,
                                })
                              }
                            >
                              Pay
                            </Button>
                          )}
                          {m.lateFeeDue > 0.005 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setShowEvent({
                                  type: EVENT_TYPES.LATE_FEE,
                                  memberId: id,
                                  loanId: "",
                                  amount: String(m.lateFeeDue),
                                  depositMonth: m.month,
                                  date: todayISO(),
                                  description: `Late fee on ${monthName(m.month)} deposit`,
                                })
                              }
                            >
                              Collect fee
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

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
                        {l.effectiveStatus === "overdue" || l.effectiveStatus === "active" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextInstallment = l.installments.find(
                                (i) => i.status === "due" || i.status === "overdue"
                              );
                              const amt = round2(nextInstallment ? nextInstallment.principalLeft + nextInstallment.interestLeft : l.outstandingPrincipal);
                              setShowEvent({
                                memberId: id,
                                loanId: l.id,
                                amount: String(amt),
                                date: new Date().toISOString().slice(0, 10),
                                description: `Pay ${nextInstallment ? `installment #${nextInstallment.index + 1}` : "loan repayment"}`,
                                quickPay: true,
                                installmentIndex: nextInstallment ? nextInstallment.index : undefined,
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

      <MemberFormModal open={showEdit} onClose={() => setShowEdit(false)} editMember={member} />
      <EventFormModal
        open={!!showEvent}
        onClose={() => { setShowEvent(null); setQuickRecord(null); }}
        preset={showEvent || {}}
      />
    </div>
  );
}