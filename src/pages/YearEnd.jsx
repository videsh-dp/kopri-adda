import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { computeYearEnd } from "../lib/calculations.js";
import { formatINR, formatDate, todayISO } from "../lib/format.js";
import { Card, StatCard, Button, Badge, Avatar, EmptyState, Modal, toast } from "../components/ui.jsx";
import { PROFIT_DISTRIBUTION } from "../lib/constants.js";

export default function YearEnd() {
  const { state, saveYearEnd, settleYearEnd } = useKopri();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [confirmAllocate, setConfirmAllocate] = useState(false);
  // Financial year end = 31 March of the following calendar year
  const fyEnd = `${Number(year) + 1}-03-31`;

  const result = useMemo(() => computeYearEnd(state, fyEnd), [state, fyEnd]);
  const memberById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);
  const existing = state.yearEnds?.find((y) => y.year === year);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const distributionLabel = {
    [PROFIT_DISTRIBUTION.EQUAL]: "Equal shares",
    [PROFIT_DISTRIBUTION.CURRENT_CONTRIBUTION]: "Share of current capital",
    [PROFIT_DISTRIBUTION.AVERAGE_CONTRIBUTION]: "Share of average contribution",
    [PROFIT_DISTRIBUTION.CONTRIBUTION_X_TIME]: "Contribution × time held",
    [PROFIT_DISTRIBUTION.CUSTOM]: "Custom (manual)",
  }[state.rules.profitDistribution];

  const waterfall = [
    ["Interest collected", result.interestCollected, true],
    ["Penalties / late fees", result.penaltiesCollected, true],
    ["Other income", result.otherIncome, true],
    ["Expenses", result.expenses, false],
    ["Bad debt write-offs", result.badDebt, false],
    ["Gross profit", result.grossProfit, null],
    ["Reserve (reserve rate)", result.reserve, false],
    ["Manager's charges", result.managerCharges, false],
    ["Distributable profit", result.distributable, null],
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="page-title">Year-End Settlement</div>
          <div className="page-sub">
            Financial year {year}–{Number(year) + 1} · profit split: <b>{distributionLabel}</b> (change in Kopri Rules)
          </div>
        </div>
        <div className="row">
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 110 }}>
            {[String(new Date().getFullYear() - 1), String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].map((y) => (
              <option key={y} value={y}>
                FY {y}
              </option>
            ))}
          </select>
          {existing?.settled ? (
            <Badge tone="green" dot>
              Settled {formatDate(existing.settledDate)}
            </Badge>
          ) : existing ? (
            <Badge tone="amber" dot>
              Allocated, not settled
            </Badge>
          ) : (
            <Badge tone="gray">Not yet computed</Badge>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Gross profit" value={formatINR(result.grossProfit)} foot={`${year}–${Number(year) + 1} FY`} color="var(--green)" />
        <StatCard label="Reserve held" value={formatINR(result.reserve)} foot={`${state.rules.reserveRate || 0}% of gross`} color="var(--amber)" />
        <StatCard label="Manager charges" value={formatINR(result.managerCharges)} foot={`${state.rules.managerChargesRate || 0}% of gross`} color="var(--violet)" />
        <StatCard label="Distributable profit" value={formatINR(result.distributable)} foot={`${result.allocations.length} members eligible`} color="var(--primary)" />
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <Card title="Profit Waterfall" sub="From income collected to what members split" pad className="grow">
          <div className="stack" style={{ gap: 0 }}>
            {waterfall.map(([label, value, type], i) => {
              const isTotal = type === null;
              return (
                <div
                  key={label}
                  className="spread"
                  style={{
                    padding: "9px 4px",
                    borderBottom: i < waterfall.length - 1 ? "1px solid var(--border)" : "none",
                    ...(isTotal ? { background: "var(--bg-soft)", borderRadius: 8, padding: "10px 12px", margin: "2px 0" } : {}),
                  }}
                >
                  <span style={{ fontWeight: isTotal ? 750 : 550, color: isTotal ? "var(--text)" : "var(--text-soft)" }}>{label}</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: isTotal ? 800 : 650,
                      fontSize: isTotal ? 15 : 13.5,
                      color: type === null ? "var(--text)" : type ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {type === null ? "" : type ? "+ " : "− "}
                    {formatINR(value)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="divider" />
          <div className="small muted">
            Reserve and manager charges are configurable percentages of gross profit in{" "}
            <Link to="/rules" style={{ fontWeight: 650, color: "var(--primary-text)" }}>
              Kopri Rules
            </Link>
            .
          </div>
        </Card>

        <Card title="Profit Allocation" sub="How the distributable profit is split" pad className="grow" style={{ flex: 1.4 }}>
          {result.allocations.length === 0 ? (
            <EmptyState icon="🎯" title="No eligible members" sub="Members need positive capital to receive a share." />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {result.allocations
                .slice()
                .sort((a, b) => b.profitShare - a.profitShare)
                .map((a) => {
                  const m = memberById[a.memberId];
                  const pct = result.distributable > 0 ? ((a.profitShare / result.distributable) * 100).toFixed(1) : "0";
                  return (
                    <div key={a.memberId} className="spread" style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                      <div className="member-cell">
                        <Avatar name={m?.name || "?"} id={a.memberId} size="sm" />
                        <div>
                          <div style={{ fontWeight: 650, fontSize: 13.5 }}>{m?.name || "Unknown"}</div>
                          <div className="small faint">
                            capital {formatINR(a.capital)} · avg {formatINR(a.averageContribution)}/yr
                          </div>
                        </div>
                      </div>
                      <div className="num">
                        <div style={{ fontWeight: 750 }}>{formatINR(a.profitShare)}</div>
                        <div className="small faint">{pct}% of profit</div>
                      </div>
                    </div>
                  );
                })}
              <div className="spread" style={{ padding: "10px 4px 0" }}>
                <span className="small muted">Total distributed</span>
                <b className="mono">{formatINR(result.allocations.reduce((s, a) => s + a.profitShare, 0))}</b>
              </div>
            </div>
          )}

          <div className="divider" />
          <div className="spread">
            <div className="small muted">
              {existing ? (
                existing.settled ? (
                  <>Members have been paid — settlement recorded {formatDate(existing.settledDate)}.</>
                ) : (
                  <>Allocation saved. Settle to create payouts (capital + profit) in the ledger.</>
                )
              ) : (
                <>Preview only — nothing has been recorded yet.</>
              )}
            </div>
            <div className="row">
              {!existing && (
                <Button variant="primary" onClick={() => setConfirmAllocate(true)} disabled={result.distributable <= 0}>
                  Save allocation
                </Button>
              )}
              {existing && !existing.settled && (
                <Button variant="primary" onClick={() => setConfirmSettle(true)}>
                  Settle & payout
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Settlement Summary" sub="What each member receives at year end — capital back plus their profit share" pad>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Capital</th>
                <th className="num">Profit share</th>
                <th className="num">Total payout</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.allocations
                .slice()
                .sort((a, b) => b.settlement - a.settlement)
                .map((a) => {
                  const m = memberById[a.memberId];
                  return (
                    <tr key={a.memberId}>
                      <td>
                        <Link to={`/members/${a.memberId}`} style={{ fontWeight: 650 }}>
                          {m?.name || "Unknown"}
                        </Link>
                      </td>
                      <td className="num">{formatINR(a.capital)}</td>
                      <td className="num" style={{ color: "var(--green)", fontWeight: 650 }}>
                        +{formatINR(a.profitShare)}
                      </td>
                      <td className="num" style={{ fontWeight: 750 }}>
                        {formatINR(a.settlement)}
                      </td>
                      <td>{existing?.settled ? <Badge tone="green">Paid</Badge> : <Badge tone="gray">Pending</Badge>}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirm allocation */}
      <Modal
        open={confirmAllocate}
        onClose={() => setConfirmAllocate(false)}
        title="Save profit allocation?"
        footer={
          <>
            <Button onClick={() => setConfirmAllocate(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                saveYearEnd({ ...result, year: String(year) });
                setConfirmAllocate(false);
                toast("Allocation saved — profit events added to the ledger.");
              }}
            >
              Save allocation
            </Button>
          </>
        }
      >
        <p className="muted">
          This records <b>{formatINR(result.distributable)}</b> of distributable profit as a <b>PROFIT_ALLOCATION</b> event per member in
          the ledger. You can still edit allocations by reopening this page — the events are replaced, never duplicated.
        </p>
      </Modal>

      {/* Confirm settle */}
      <Modal
        open={confirmSettle}
        onClose={() => setConfirmSettle(false)}
        title={`Settle FY ${year} payouts?`}
        footer={
          <>
            <Button onClick={() => setConfirmSettle(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                settleYearEnd(String(year), todayISO());
                setConfirmSettle(false);
                toast("FY settled — payouts recorded in the ledger.");
              }}
            >
              Confirm settlement
            </Button>
          </>
        }
      >
        <p className="muted">
          Creates a <b>MEMBER_SETTLEMENT</b> ledger event for each member with their full payout: capital + profit share, paid out of the
          pool's cash. Total payout: <b>{formatINR(result.allocations.reduce((s, a) => s + a.settlement, 0))}</b>.
        </p>
      </Modal>
    </div>
  );
}