import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { depositSummary, financialYearOf, financialYearBounds, addMonthsYM } from "../lib/calculations.js";
import { formatINR, formatDate, todayISO } from "../lib/format.js";
import { Card, StatCard, Button, EmptyState, MemberCell } from "../components/ui.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconWarning } from "../components/Icons.jsx";
import { EVENT_TYPES, DEPOSIT_LATE_FEE } from "../lib/constants.js";

const monthShort = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short" });
};
const monthLong = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const STATUS_LABEL = {
  paid: "Paid on time",
  paid_late: "Paid late",
  late: "Unpaid after deadline",
  due: "Due",
  upcoming: "Not due yet",
};

export function lateFeeRuleText(rules) {
  if (rules.depositLateFeeType === DEPOSIT_LATE_FEE.FIXED) return `${formatINR(rules.depositLateFeeFixed)} late fee per month`;
  if (rules.depositLateFeeType === DEPOSIT_LATE_FEE.PERCENTAGE) return `${rules.depositLateFeePercent}% late fee`;
  return "no late fee";
}

export default function Deposits() {
  const { state } = useKopri();
  const navigate = useNavigate();
  const rules = state.rules;
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const [fy, setFy] = useState(() => financialYearOf(today, rules.financialYearStart));
  const [preset, setPreset] = useState(null);

  const { yearStart } = financialYearBounds(fy, rules.financialYearStart);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonthsYM(yearStart.slice(0, 7), i)), [yearStart]);
  const summary = useMemo(() => depositSummary(state, thisMonth, today), [state, thisMonth, today]);

  const rows = useMemo(
    () =>
      summary.rows
        .map((r) => ({ ...r, byMonth: Object.fromEntries(r.deposits.months.map((m) => [m.month, m])) }))
        .filter((r) => months.some((ym) => r.byMonth[ym]))
        .sort((a, b) => b.deposits.arrears - a.deposits.arrears || a.member.name.localeCompare(b.member.name)),
    [summary, months]
  );

  const openCell = (member, m) => {
    if (m.left > 0.5) {
      setPreset({
        type: EVENT_TYPES.CONTRIBUTION,
        memberId: member.id,
        amount: String(m.left),
        depositMonth: m.month,
        date: today,
        description: `Monthly deposit, ${monthLong(m.month)}`,
      });
    } else if (m.lateFeeDue > 0.005) {
      setPreset({
        type: EVENT_TYPES.LATE_FEE,
        memberId: member.id,
        loanId: "",
        amount: String(m.lateFeeDue),
        depositMonth: m.month,
        date: today,
        description: `Late fee on ${monthLong(m.month)} deposit`,
      });
    } else {
      navigate(`/members/${member.id}`);
    }
  };

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-title">Monthly Deposits</div>
          <div className="page-sub">
            Due on day {rules.depositDueDay} of each month, late after day {rules.depositDeadlineDay} · {lateFeeRuleText(rules)} ·{" "}
            <Link to="/rules" style={{ textDecoration: "underline" }}>
              change
            </Link>
          </div>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => setFy(fy - 1)}>
            ← FY {fy - 1}
          </Button>
          <b style={{ minWidth: 96, textAlign: "center" }}>{yearStart.slice(5) === "01-01" ? `FY ${fy}` : `FY ${fy}–${String(fy + 1).slice(2)}`}</b>
          <Button size="sm" onClick={() => setFy(fy + 1)}>
            FY {fy + 1} →
          </Button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          label={`Collected · ${monthLong(thisMonth)}`}
          value={formatINR(summary.collected)}
          foot={`of ${formatINR(summary.expected)} expected`}
          color="var(--green)"
        />
        <StatCard
          label="Unpaid this month"
          value={summary.unpaid.length}
          foot={summary.unpaid.length ? summary.unpaid.map((u) => u.member.name.split(" ")[0]).join(", ") : "Everyone has paid"}
          color="var(--amber)"
        />
        <StatCard label="Total arrears" value={formatINR(summary.arrears)} foot={`${summary.lateMembers.length} member(s) behind`} color="var(--red)" />
        <StatCard label="Late fees due" value={formatINR(summary.lateFeesDue)} foot={lateFeeRuleText(rules)} color="var(--violet)" />
      </div>

      {summary.lateMembers.length > 0 && (
        <div className="alert alert-red">
          <IconWarning width={18} height={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>Late deposits:</b>{" "}
            {summary.lateMembers.map((r, i) => (
              <span key={r.member.id}>
                {i > 0 && " · "}
                <Link to={`/members/${r.member.id}`} style={{ textDecoration: "underline" }}>
                  {r.member.name}
                </Link>{" "}
                ({r.deposits.lateMonths} month{r.deposits.lateMonths === 1 ? "" : "s"}, {formatINR(r.deposits.arrears)})
              </span>
            ))}
          </div>
        </div>
      )}

      <Card title="Deposit grid" sub="Click a red or amber month to record the deposit, or a paid-late month to collect its late fee" pad={false}>
        {rows.length === 0 ? (
          <EmptyState icon="🗓️" title="No deposits scheduled in this year" sub="Add depositing members with a monthly deposit amount." />
        ) : (
          <div className="table-wrap">
            <table className="data deposit-grid">
              <thead>
                <tr>
                  <th>Member</th>
                  {months.map((ym) => (
                    <th key={ym} className={`num ${ym === thisMonth ? "dg-now" : ""}`}>
                      {monthShort(ym)}
                    </th>
                  ))}
                  <th className="num">Arrears</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.member.id}>
                    <td>
                      <Link to={`/members/${r.member.id}`}>
                        <MemberCell name={r.member.name} sub={`${formatINR(r.deposits.amount)}/month`} id={r.member.id} />
                      </Link>
                    </td>
                    {months.map((ym) => {
                      const m = r.byMonth[ym];
                      if (!m) return <td key={ym} className="num faint">·</td>;
                      const title = `${monthLong(ym)}: ${STATUS_LABEL[m.status]}. Due ${formatDate(m.dueDate)}, deadline ${formatDate(m.deadline)}. Paid ${formatINR(m.paid)} of ${formatINR(m.expected)}${m.paidDate ? ` on ${formatDate(m.paidDate)}` : ""}${m.lateFeeDue > 0 ? `. Late fee due ${formatINR(m.lateFeeDue)}` : ""}`;
                      return (
                        <td key={ym} className="num">
                          <button className={`dg-cell dg-${m.status}`} title={title} onClick={() => openCell(r.member, m)}>
                            {m.status === "paid" || m.status === "paid_late" ? "✓" : m.paid > 0 ? formatINR(m.paid) : m.status === "upcoming" ? "–" : "✕"}
                            {m.lateFeeDue > 0.005 && <span className="dg-fee" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 700 }}>
                      {r.deposits.arrears > 0 ? <span className="amount-neg">{formatINR(r.deposits.arrears)}</span> : <span className="faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="dg-legend small muted">
          <span><i className="dg-cell dg-paid">✓</i> Paid on time</span>
          <span><i className="dg-cell dg-paid_late">✓</i> Paid late</span>
          <span><i className="dg-cell dg-due">✕</i> Due, before deadline</span>
          <span><i className="dg-cell dg-late">✕</i> Unpaid after deadline</span>
          <span><i className="dg-cell dg-upcoming">–</i> Not due yet</span>
          <span><i className="dg-cell dg-paid_late">✓<span className="dg-fee" /></i> Late fee to collect</span>
        </div>
      </Card>

      <EventFormModal open={!!preset} onClose={() => setPreset(null)} preset={preset || {}} />
    </div>
  );
}
