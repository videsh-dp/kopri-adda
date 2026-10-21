import { useEffect, useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Card, Field, Button, Modal } from "../components/ui.jsx";
import {
  INTEREST_METHODS,
  INTEREST_COLLECTION,
  PRINCIPAL_REPAYMENT,
  LATE_RULES,
  UNPAID_INTEREST_RULES,
  UNPAID_INTEREST_LABELS,
  PROFIT_DISTRIBUTION,
  DEPOSIT_LATE_FEE,
} from "../lib/constants.js";

const RATE_UNIT_OPTIONS = [
  ["monthly", "Per month"],
  ["yearly", "Per year"],
];

export default function Rules() {
  const { state, updateRules, resetDemo, clearAll } = useKopri();
  const [form, setForm] = useState(() => {
    const { kopriName, ...rest } = state.rules || {};
    return { ...rest };
  });
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Reload the form whenever the active Kopri's rules change (switch Kopri, reset demo, …)
  useEffect(() => {
    const { kopriName, ...rest } = state.rules || {};
    void kopriName;
    setForm({ ...rest });
  }, [state.rules]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const save = () => {
    const { kopriName, ...rest } = form;
    void kopriName;
    updateRules(rest);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify((() => {
    const { kopriName, ...rest } = state.rules || {};
    return rest;
  })());

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Kopri Rules</div>
          <div className="page-sub">Every Kopri works differently — configure yours here. Used as defaults for new loans.</div>
        </div>
        <div className="row">
          {saved && <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ Saved</span>}
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save rules
          </Button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card title="Identity" sub={`Rules for “${state?.name || "this Kopri"}”`} pad>
          <div className="form-grid">
            <Field label="Financial year start" hint="MM-DD — year-end runs to the day before this date">
              <input value={form.financialYearStart} onChange={set("financialYearStart")} placeholder="04-01" />
            </Field>
          </div>
          <div className="alert alert-blue" style={{ marginTop: 10 }}>
            <div className="small">
              Rename this Kopri or switch to another one from the <b>Kopri menu</b> in the top bar. Each Kopri keeps its own rules, members,
              loans and ledger.
            </div>
          </div>
        </Card>

        <Card title="Monthly Deposits" sub="When depositors pay, and what happens if they're late" pad>
          <div className="form-grid">
            <Field label="Default monthly deposit (₹)" hint="Each member can have their own amount">
              <input type="number" min="0" value={form.defaultMonthlyDeposit} onChange={set("defaultMonthlyDeposit")} />
            </Field>
            <Field label="Due on day" hint="Day of the month the deposit falls due">
              <input type="number" min="1" max="31" value={form.depositDueDay} onChange={set("depositDueDay")} />
            </Field>
            <Field label="Deadline day" hint="Unpaid after this day = late (e.g. 15)">
              <input type="number" min="1" max="31" value={form.depositDeadlineDay} onChange={set("depositDeadlineDay")} />
            </Field>
            <Field label="Late fee on deposits">
              <select value={form.depositLateFeeType} onChange={set("depositLateFeeType")}>
                <option value={DEPOSIT_LATE_FEE.NONE}>None, only highlight late months</option>
                <option value={DEPOSIT_LATE_FEE.FIXED}>Fixed amount per late month</option>
                <option value={DEPOSIT_LATE_FEE.PERCENTAGE}>Percentage of the month's deposit</option>
              </select>
            </Field>
            {form.depositLateFeeType === DEPOSIT_LATE_FEE.FIXED && (
              <Field label="Late fee per month (₹)">
                <input type="number" min="0" value={form.depositLateFeeFixed} onChange={set("depositLateFeeFixed")} />
              </Field>
            )}
            {form.depositLateFeeType === DEPOSIT_LATE_FEE.PERCENTAGE && (
              <Field label="Late fee (% of deposit)">
                <input type="number" min="0" step="0.1" value={form.depositLateFeePercent} onChange={set("depositLateFeePercent")} />
              </Field>
            )}
          </div>
          {Number(form.depositDeadlineDay) < Number(form.depositDueDay) && (
            <div className="small muted" style={{ marginTop: 8 }}>
              The deadline day is before the due day, so the deadline falls in the following month.
            </div>
          )}
        </Card>

        <Card title="Lending Rules" sub="Who can get a loan" pad>
          <label className="row" style={{ gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={form.requireReferral !== false}
              onChange={(e) => setForm((f) => ({ ...f, requireReferral: e.target.checked }))}
              style={{ marginTop: 3 }}
            />
            <span>
              <b>Loans only through a member's referral</b>
              <div className="small muted">
                Every new loan must name an active depositing member who referred the borrower. Borrowers don't have to be members themselves.
              </div>
            </span>
          </label>
        </Card>

        <Card title="Interest Defaults" sub="Applied when creating a new loan" pad>
          <div className="form-grid">
            <Field label="Default interest rate">
              <input type="number" step="0.1" value={form.defaultInterestRate} onChange={set("defaultInterestRate")} />
            </Field>
            <Field label="Rate unit">
              <select value={form.defaultRateUnit} onChange={set("defaultRateUnit")}>
                {RATE_UNIT_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Interest method">
              <select value={form.defaultInterestMethod} onChange={set("defaultInterestMethod")}>
                <option value={INTEREST_METHODS.FLAT}>Flat</option>
                <option value={INTEREST_METHODS.REDUCING_BALANCE}>Reducing balance</option>
                <option value={INTEREST_METHODS.DAILY_OUTSTANDING}>Daily outstanding</option>
              </select>
            </Field>
            <Field label="Interest collection">
              <select value={form.defaultInterestCollection} onChange={set("defaultInterestCollection")}>
                <option value={INTEREST_COLLECTION.MONTHLY}>Monthly</option>
                <option value={INTEREST_COLLECTION.QUARTERLY}>Quarterly</option>
                <option value={INTEREST_COLLECTION.AT_CLOSURE}>At closure</option>
              </select>
            </Field>
            <Field label="Principal repayment">
              <select value={form.defaultPrincipalRepayment} onChange={set("defaultPrincipalRepayment")}>
                <option value={PRINCIPAL_REPAYMENT.MONTHLY}>Monthly</option>
                <option value={PRINCIPAL_REPAYMENT.QUARTERLY}>Quarterly</option>
                <option value={PRINCIPAL_REPAYMENT.LUMP_SUM}>Lump sum at end</option>
                <option value={PRINCIPAL_REPAYMENT.CUSTOM}>Custom</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Late Payment" sub="What happens when an installment is missed" pad>
          <div className="form-grid">
            <Field label="Grace period (days)">
              <input type="number" min="0" value={form.gracePeriodDays} onChange={set("gracePeriodDays")} />
            </Field>
            <Field label="Late payment rule">
              <select value={form.lateRule} onChange={set("lateRule")}>
                <option value={LATE_RULES.GRACE_ONLY}>Grace period only</option>
                <option value={LATE_RULES.NORMAL_INTEREST}>Normal interest continues</option>
                <option value={LATE_RULES.ADDITIONAL_INTEREST}>Additional interest</option>
                <option value={LATE_RULES.FIXED_PENALTY}>Fixed penalty</option>
                <option value={LATE_RULES.PERCENTAGE_PENALTY}>Percentage penalty</option>
              </select>
            </Field>
            {form.lateRule === LATE_RULES.ADDITIONAL_INTEREST && (
              <Field label="Additional interest rate (% / month)">
                <input type="number" step="0.1" value={form.lateAdditionalInterestRate} onChange={set("lateAdditionalInterestRate")} />
              </Field>
            )}
            {form.lateRule === LATE_RULES.FIXED_PENALTY && (
              <Field label="Fixed penalty per overdue installment (₹)">
                <input type="number" value={form.lateFixedPenalty} onChange={set("lateFixedPenalty")} />
              </Field>
            )}
            {form.lateRule === LATE_RULES.PERCENTAGE_PENALTY && (
              <Field label="Penalty (% of overdue amount)">
                <input type="number" step="0.1" value={form.latePercentagePenalty} onChange={set("latePercentagePenalty")} />
              </Field>
            )}
            <Field label="Unpaid interest at year end" hint="Applied on the Year End page when the allocation is saved">
              <select value={form.unpaidInterestRule} onChange={set("unpaidInterestRule")}>
                {Object.entries(UNPAID_INTEREST_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Year-End Profit" sub="How profit is split after expenses, reserve and manager charges" pad>
          <div className="form-grid">
            <Field label="Reserve rate (% of gross profit)">
              <input type="number" step="0.5" value={form.reserveRate} onChange={set("reserveRate")} />
            </Field>
            <Field label="Manager's charges (% of gross profit)">
              <input type="number" step="0.5" value={form.managerChargesRate} onChange={set("managerChargesRate")} />
            </Field>
            <Field label="Profit distribution method" className="grow">
              <select value={form.profitDistribution} onChange={set("profitDistribution")}>
                <option value={PROFIT_DISTRIBUTION.EQUAL}>Equal shares for all members</option>
                <option value={PROFIT_DISTRIBUTION.CURRENT_CONTRIBUTION}>Share of current capital</option>
                <option value={PROFIT_DISTRIBUTION.AVERAGE_CONTRIBUTION}>Share of average contribution</option>
                <option value={PROFIT_DISTRIBUTION.CONTRIBUTION_X_TIME}>Contribution × time held</option>
                <option value={PROFIT_DISTRIBUTION.CUSTOM}>Custom (manual)</option>
              </select>
            </Field>
          </div>
          <div className="alert alert-blue" style={{ marginTop: 14 }}>
            <div className="small">
              <b>How allocation works:</b> distributable profit = interest + penalties + other income − expenses − bad debt − reserve −
              manager charges. Then the distribution method above decides each member's share.
            </div>
          </div>
        </Card>
      </div>

      <Card title="Data & Storage" sub="This Kopri's data lives in this browser (localStorage + a session cookie). No server yet." pad>
        <div className="row">
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset this Kopri to demo data
          </Button>
          <Button variant="danger" onClick={() => setConfirmWipe(true)}>
            Wipe ALL Kopris & start fresh
          </Button>
          <span className="small faint">
            {state.members.length} members · {state.loans.length} loans · {state.events.length} ledger events · FY start{" "}
            {state.rules.financialYearStart}
          </span>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Use the <b>Kopri menu</b> (top bar) to add, switch, rename or delete Kopris. When we introduce the backend, each Kopri becomes an
          isolated account and its events migrate to PostgreSQL.
        </div>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset this Kopri to demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                const { kopriName, ...rest } = state.rules || {};
                void kopriName;
                setForm({ ...rest });
                setConfirmReset(false);
              }}
            >
              Reset demo
            </Button>
          </>
        }
      >
        <p className="muted">
          Replaces <b>{state?.name}</b>'s data with the fresh demo dataset (members, loans, ledger, year-end history). Other Kopris are
          untouched.
        </p>
      </Modal>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Wipe ALL Kopris?"
        footer={
          <>
            <Button onClick={() => setConfirmWipe(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                clearAll();
                const { kopriName, ...rest } = state.rules || {};
                void kopriName;
                setForm({ ...rest });
                setConfirmWipe(false);
              }}
            >
              Wipe everything
            </Button>
          </>
        }
      >
        <p className="muted">
          Deletes every Kopri and all their data from this browser, then starts one fresh empty Kopri. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}