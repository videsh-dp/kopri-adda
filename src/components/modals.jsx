import { useState, useMemo, useEffect, useRef } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Modal, Button, Field, TextInput, NumberInput } from "./ui.jsx";
import {
  INTEREST_METHODS,
  INTEREST_COLLECTION,
  PRINCIPAL_REPAYMENT,
  LATE_RULES,
  UNPAID_INTEREST_RULES,
  UNPAID_INTEREST_LABELS,
  ACCOUNTS,
  EVENT_TYPES,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
} from "../lib/constants.js";
import {
  deriveLoan,
  computeLateCharges,
  splitPayAmount,
  memberRole,
  monthlyDepositOf,
  isDepositor,
  eligibleReferrers,
  loanReferralError,
  deriveDeposits,
  addMonthsYM,
} from "../lib/calculations.js";
import { todayISO, formatINR, formatDate, formatNumber, round2, uid } from "../lib/format.js";

const rupee = (n) => formatINR(n, { precise: true });

function methodLabel(method) {
  if (method === INTEREST_METHODS.FLAT) return "Flat (on original loan principal)";
  if (method === INTEREST_METHODS.DAILY_OUTSTANDING) return "Daily outstanding (monthly rate × days in period ÷ 30)";
  return "Reducing balance (on outstanding at period start)";
}

function CalcRow({ label, value, formula, tone, strong }) {
  return (
    <div className={`calc-row${strong ? " calc-row-total" : ""}`}>
      <div>
        <div className={strong ? "" : "calc-label"}>{label}</div>
        {formula ? <div className="calc-formula">{formula}</div> : null}
      </div>
      <div className="calc-amt" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function InterestWorking({ loan, installment, instLeft, late, split, payMode, withLate, setWithLate }) {
  const billedThisMonth = installment.interestDue;
  const carried = Number(installment.carriedIn) || 0;
  const periodInterest = Number(installment.periodInterest) || 0;
  const extraInterest = late?.lateInterest || 0;
  const penalty = late?.penalty || 0;
  const lateTotal = late?.total || 0;
  const totalInterest = round2(instLeft.interest + extraInterest);
  const installmentTotal = round2(instLeft.principal + instLeft.interest);
  const grand = round2(installmentTotal + lateTotal);

  return (
    <div className="calc-box">
      <div className="calc-head">Why this interest</div>
      <div className="calc-sub">
        Installment #{installment.index + 1} · due {formatDate(installment.dueDate)}
        {late?.asOf ? ` · paying ${formatDate(late.asOf)}` : ""}
      </div>

      <div className="calc-section-label">Scheduled interest (this installment)</div>
      <div className="small muted" style={{ marginBottom: 6 }}>
        {methodLabel(installment.interestMethod || loan.interestMethod)}
      </div>
      {installment.interestMethod === INTEREST_METHODS.FLAT || loan.interestMethod === INTEREST_METHODS.FLAT ? (
        <CalcRow
          label="This period’s interest"
          formula={`${rupee(Number(loan.principal) || 0)} original principal × ${installment.monthlyRatePct}% per month`}
          value={rupee(periodInterest)}
        />
      ) : (
        <>
          <CalcRow label="Outstanding at start of this period" value={rupee(installment.outstandingBefore)} />
          <CalcRow
            label="This period’s interest"
            formula={
              (installment.interestMethod || loan.interestMethod) === INTEREST_METHODS.DAILY_OUTSTANDING
                ? `${rupee(installment.outstandingBefore)} × ${installment.monthlyRatePct}% × ${installment.daysInPeriod} days ÷ 30`
                : `${rupee(installment.outstandingBefore)} × ${installment.monthlyRatePct}% per month`
            }
            value={rupee(periodInterest)}
          />
        </>
      )}
      {carried > 0.005 && (
        <CalcRow
          label="Plus interest accrued in earlier months of this collection"
          value={rupee(carried)}
        />
      )}
      <CalcRow label="Billed on this installment" value={rupee(billedThisMonth)} strong />
      {round2(billedThisMonth - instLeft.interest) > 0.005 && (
        <CalcRow label="Already paid on this installment" value={`− ${rupee(billedThisMonth - instLeft.interest)}`} />
      )}
      <CalcRow label="Scheduled interest still due" value={rupee(instLeft.interest)} tone="var(--text)" strong />

      {late && late.calendarDays > 0 && (
        <>
          <div className="calc-section-label">{late.isLate ? "Late period" : "Grace window"}</div>
          {late.isLate && (
            <div className="calc-late-flag">
              {late.chargeableDays} chargeable day{late.chargeableDays === 1 ? "" : "s"} past the {late.graceDays}-day grace
            </div>
          )}
          <CalcRow label="Due date" value={formatDate(late.dueDate)} />
          <CalcRow
            label={`${late.graceDays}-day grace ends`}
            value={formatDate(late.graceEnds)}
          />
          <CalcRow label="Payment date" value={formatDate(late.asOf)} />
          <CalcRow
            label="Days after due date"
            value={`${late.calendarDays} day${late.calendarDays === 1 ? "" : "s"}`}
          />
          <CalcRow label="Minus grace" value={`− ${late.graceDays}`} />
          <CalcRow
            label="Chargeable days"
            formula={`${late.chargeableDays} ÷ 30 = ${formatNumber(late.monthsLate, { precise: true })} months`}
            value={`${late.chargeableDays} days`}
            strong
          />
          <div className="small muted" style={{ margin: "6px 0 8px" }}>
            Late rule: <b>{late.lateRuleLabel}</b>
          </div>

          {late.isLate && late.lateRule === LATE_RULES.NORMAL_INTEREST && (
            <CalcRow
              label="Extra late interest"
              formula={`${rupee(late.principalBase)} unpaid principal × ${late.monthlyRatePct}% × ${late.chargeableDays} ÷ 30`}
              value={rupee(extraInterest)}
              tone="var(--amber)"
            />
          )}
          {late.isLate && late.lateRule === LATE_RULES.ADDITIONAL_INTEREST && (
            <CalcRow
              label="Extra late interest"
              formula={`${rupee(late.principalBase)} unpaid principal × (${late.monthlyRatePct}% + ${late.addRate}%) × ${late.chargeableDays} ÷ 30`}
              value={rupee(extraInterest)}
              tone="var(--amber)"
            />
          )}
          {late.isLate && late.lateRule === LATE_RULES.FIXED_PENALTY && (
            <CalcRow label="Fixed penalty (this installment)" value={rupee(penalty)} tone="var(--amber)" />
          )}
          {late.isLate && late.lateRule === LATE_RULES.PERCENTAGE_PENALTY && (
            <CalcRow
              label="Penalty"
              formula={`${late.pct}% × overdue ${rupee(late.penaltyBase)} (principal + interest still due)`}
              value={rupee(penalty)}
              tone="var(--amber)"
            />
          )}
          {late.lateRule === LATE_RULES.GRACE_ONLY && late.isLate && (
            <div className="small muted" style={{ marginBottom: 6 }}>
              After grace this loan does not add extra interest or a penalty. The interest figure stays the scheduled installment amount.
            </div>
          )}
          {!late.isLate && (
            <div className="small muted" style={{ marginBottom: 6 }}>
              Payment is still inside the {late.graceDays}-day grace window, so extra late interest is {rupee(0)}.
            </div>
          )}
        </>
      )}

      <div className="calc-section-label">How it adds up</div>
      <CalcRow label="Principal still due" value={rupee(instLeft.principal)} />
      <CalcRow label="Scheduled interest still due" value={rupee(instLeft.interest)} />
      {extraInterest > 0.005 && <CalcRow label="Extra late interest" value={rupee(extraInterest)} tone="var(--amber)" />}
      {penalty > 0.005 && <CalcRow label="Late penalty" value={rupee(penalty)} tone="var(--amber)" />}
      <CalcRow
        label="Total interest this payment"
        formula={
          extraInterest > 0.005
            ? `${rupee(instLeft.interest)} scheduled + ${rupee(extraInterest)} extra late`
            : undefined
        }
        value={rupee(totalInterest)}
        strong
      />
      <CalcRow
        label="Installment amount (principal + scheduled interest)"
        value={rupee(installmentTotal)}
        strong
      />
      {late?.alreadyCollected > 0.005 && (
        <CalcRow label="Late charges already collected on this installment" value={`− ${rupee(late.alreadyCollected)}`} />
      )}
      {lateTotal > 0.005 && (
        <CalcRow
          label="Plus late charges (separate ledger entry)"
          value={rupee(lateTotal)}
          tone="var(--amber)"
        />
      )}
      <CalcRow label="To collect today if you take everything" value={rupee(grand)} strong />

      {payMode === "pi" && split && (
        <div className="small muted" style={{ marginTop: 8 }}>
          The amount field splits as <b>scheduled interest {rupee(split.interest)}</b> first, then{" "}
          <b>principal {rupee(split.principal)}</b>
          {split.extra > 0 ? <> (includes {rupee(split.extra)} extra, booked as a principal prepayment)</> : null}
          {lateTotal > 0.005 ? ". Late charges are not mixed into that split." : null}
        </div>
      )}

      {late?.isLate && lateTotal > 0 && (
        <label className="row" style={{ gap: 8, marginTop: 10, cursor: "pointer", alignItems: "flex-start" }}>
          <input type="checkbox" checked={withLate} onChange={(e) => setWithLate(e.target.checked)} style={{ marginTop: 3 }} />
          <span className="small">
            Also collect late charges (<b>{rupee(lateTotal)}</b>) as a separate late-fee entry
          </span>
        </label>
      )}
    </div>
  );
}

// ------------------------------------------------------------ MemberForm
// Adds or edits a person's profile. Depositors pay a monthly deposit and share
// profit; borrowers only take loans (and need a member's referral).
function blankMember(rules, role) {
  return {
    name: "",
    role,
    phone: "",
    email: "",
    address: "",
    idProof: "",
    occupation: "",
    nominee: "",
    monthlyDeposit: String(rules?.defaultMonthlyDeposit ?? 5000),
    depositStartMonth: todayISO().slice(0, 7),
    joinedAt: todayISO(),
    status: "active",
    notes: "",
  };
}

export function MemberFormModal({ open, onClose, editMember = null, defaultRole = MEMBER_ROLES.DEPOSITOR, onCreated }) {
  const { state, addMember, updateMember } = useKopri();
  const makeForm = () =>
    editMember
      ? {
          ...blankMember(state.rules, memberRole(editMember)),
          ...editMember,
          role: memberRole(editMember),
          monthlyDeposit: String(monthlyDepositOf(editMember, state.rules)),
          depositStartMonth: editMember.depositStartMonth || (editMember.joinedAt || todayISO()).slice(0, 7),
        }
      : blankMember(state.rules, defaultRole);
  const [form, setForm] = useState(makeForm);
  const [initialContribution, setInitialContribution] = useState("0");

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(makeForm());
      setInitialContribution("0");
    }
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const deposits = form.role !== MEMBER_ROLES.BORROWER;
  const valid = form.name.trim().length > 0 && (!deposits || Number(form.monthlyDeposit) >= 0);

  const submit = () => {
    if (!valid) return;
    const profile = {
      ...form,
      name: form.name.trim(),
      monthlyDeposit: deposits ? Number(form.monthlyDeposit) || 0 : 0,
      depositStartMonth: deposits ? form.depositStartMonth : "",
    };
    if (editMember) {
      updateMember(editMember.id, profile);
    } else {
      const id = uid("m");
      addMember({ ...profile, id }, deposits ? Number(initialContribution) || 0 : 0);
      onCreated?.(id);
    }
    onClose();
  };

  const title = editMember ? "Edit Profile" : form.role === MEMBER_ROLES.BORROWER ? "Add Borrower" : "Add Member";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {editMember ? "Save profile" : form.role === MEMBER_ROLES.BORROWER ? "Add borrower" : "Add member"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name" className="grow">
          <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Anita Fernandes" autoFocus />
        </Field>
        <Field label="Role" hint={deposits ? "Pays a monthly deposit and shares year-end profit" : "Takes loans only, must be referred by a member"}>
          <select value={form.role} onChange={set("role")}>
            {Object.entries(MEMBER_ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={set("phone")} placeholder="98220 12345" />
        </Field>
        <Field label="Email">
          <TextInput value={form.email} onChange={set("email")} placeholder="name@example.com" />
        </Field>
        <Field label="Address" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.address} onChange={set("address")} placeholder="House, village / town, taluka" />
        </Field>
        <Field label="ID proof" hint="e.g. Aadhaar or PAN number">
          <TextInput value={form.idProof} onChange={set("idProof")} placeholder="Aadhaar XXXX 1234" />
        </Field>
        <Field label="Occupation">
          <TextInput value={form.occupation} onChange={set("occupation")} placeholder="e.g. Shop owner" />
        </Field>
        <Field label="Joined on">
          <input type="date" value={form.joinedAt} onChange={set("joinedAt")} />
        </Field>
        {editMember && (
          <Field label="Status">
            <select value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        )}

        {deposits && (
          <>
            <Field label="Monthly deposit (₹)" hint={`Due on day ${state.rules.depositDueDay}, late after day ${state.rules.depositDeadlineDay}`}>
              <NumberInput value={form.monthlyDeposit} onChange={set("monthlyDeposit")} min="0" />
            </Field>
            <Field label="Deposits start from" hint="First month a deposit is due">
              <input type="month" value={form.depositStartMonth} onChange={set("depositStartMonth")} />
            </Field>
            <Field label="Nominee">
              <TextInput value={form.nominee} onChange={set("nominee")} placeholder="Name and relation" />
            </Field>
            {!editMember && (
              <Field label="Opening deposit (₹)" hint="Optional one-off amount, not counted as a monthly deposit">
                <NumberInput value={initialContribution} onChange={(e) => setInitialContribution(e.target.value)} min="0" />
              </Field>
            )}
          </>
        )}
        <Field label="Notes" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.notes} onChange={set("notes")} placeholder="Anything worth remembering" />
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- LoanForm
export function LoanFormModal({ open, onClose, editLoan = null, presetMemberId = "" }) {
  const { state, addLoan, updateLoan } = useKopri();
  const rules = state.rules;
  const [form, setForm] = useState(() =>
    editLoan
      ? { ...editLoan }
      : {
          memberId: presetMemberId || "",
          principal: "100000",
          rate: String(rules.defaultInterestRate ?? 2),
          rateUnit: rules.defaultRateUnit || "monthly",
          interestMethod: rules.defaultInterestMethod || INTEREST_METHODS.REDUCING_BALANCE,
          interestCollection: rules.defaultInterestCollection || INTEREST_COLLECTION.MONTHLY,
          principalRepayment: rules.defaultPrincipalRepayment || PRINCIPAL_REPAYMENT.MONTHLY,
          startDate: todayISO(),
          tenureMonths: "12",
          gracePeriodDays: String(rules.gracePeriodDays ?? 5),
          lateRule: rules.lateRule || LATE_RULES.NORMAL_INTEREST,
          unpaidInterestRule: rules.unpaidInterestRule || UNPAID_INTEREST_RULES.CARRY_FORWARD,
          lateAdditionalInterestRate: String(rules.lateAdditionalInterestRate ?? 1),
          lateFixedPenalty: String(rules.lateFixedPenalty ?? 100),
          latePercentagePenalty: String(rules.latePercentagePenalty ?? 2),
          referredById: "",
          security: "",
          notes: "",
          guarantorIds: [],
        }
  );
  const [showNewBorrower, setShowNewBorrower] = useState(false);
  const people = state.members.filter((m) => m.status === "active" || m.id === form.memberId);
  const referrers = eligibleReferrers(state.members, form.memberId);
  // Editing a loan made before the rule existed shouldn't force a referral.
  const referralNeeded = state.rules.requireReferral !== false && !(editLoan && !editLoan.referredById);
  const referralError = form.memberId && referralNeeded ? loanReferralError(form, state.members, state.rules) : "";

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Custom repayment: one principal amount per month, which must add up to
  // the loan principal. Starts as an equal split whenever the size changes.
  const tenure = Math.max(0, Math.min(Math.floor(Number(form.tenureMonths) || 0), 600));
  const isCustom = form.principalRepayment === PRINCIPAL_REPAYMENT.CUSTOM;
  const [customRows, setCustomRows] = useState(() =>
    Array.isArray(editLoan?.customPrincipalSchedule) ? editLoan.customPrincipalSchedule.map(String) : []
  );
  useEffect(() => {
    if (!isCustom || tenure < 1 || customRows.length === tenure) return;
    const p = Number(form.principal) || 0;
    const base = Math.floor(p / tenure);
    setCustomRows(Array.from({ length: tenure }, (_, i) => String(i === tenure - 1 ? round2(p - base * (tenure - 1)) : base)));
  }, [isCustom, tenure]); // eslint-disable-line react-hooks/exhaustive-deps
  const customTotal = round2(customRows.reduce((a, v) => a + (Number(v) || 0), 0));
  const customOk = !isCustom || (customRows.length === tenure && Math.abs(customTotal - (Number(form.principal) || 0)) < 1);

  const valid = form.memberId && Number(form.principal) > 0 && Number(form.tenureMonths) > 0 && customOk && !referralError;

  const submit = () => {
    if (!valid) return;
    const payload = {
      memberId: form.memberId,
      principal: Number(form.principal),
      rate: Number(form.rate),
      rateUnit: form.rateUnit,
      interestMethod: form.interestMethod,
      interestCollection: form.interestCollection,
      principalRepayment: form.principalRepayment,
      startDate: form.startDate,
      tenureMonths: Number(form.tenureMonths),
      gracePeriodDays: Number(form.gracePeriodDays) || 0,
      lateRule: form.lateRule,
      unpaidInterestRule: form.unpaidInterestRule,
      lateAdditionalInterestRate: Number(form.lateAdditionalInterestRate) || 0,
      lateFixedPenalty: Number(form.lateFixedPenalty) || 0,
      latePercentagePenalty: Number(form.latePercentagePenalty) || 0,
      referredById: form.referredById || "",
      security: form.security,
      notes: form.notes,
      guarantorIds: Array.isArray(form.guarantorIds) ? form.guarantorIds : [],
      customPrincipalSchedule: isCustom ? customRows.map((v) => Number(v) || 0) : null,
    };
    if (editLoan) {
      updateLoan(editLoan.id, payload);
    } else {
      // The loan and its disbursement are booked together.
      addLoan({ ...payload, id: uid("l") }, { account: "cash", date: form.startDate, description: "Loan disbursement" });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editLoan ? "Edit Loan" : "Create Loan"}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {editLoan ? "Save changes" : "Create loan & disburse"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Borrower" className="grow">
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <select value={form.memberId} onChange={set("memberId")} style={{ flex: 1, minWidth: 0 }}>
              <option value="">Select borrower…</option>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {isDepositor(m) ? "" : " (borrower)"}
                </option>
              ))}
            </select>
            {!editLoan && (
              <Button type="button" size="sm" onClick={() => setShowNewBorrower(true)} title="Add a new borrower profile">
                + New
              </Button>
            )}
          </div>
        </Field>
        <Field
          label={referralNeeded ? "Referred by (member)" : "Referred by (optional)"}
          className="grow"
          hint={referralError && form.memberId ? referralError : "An active depositing member who vouches for the borrower"}
        >
          <select value={form.referredById || ""} onChange={set("referredById")}>
            <option value="">Select member…</option>
            {referrers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Principal (₹)">
          <NumberInput value={form.principal} onChange={set("principal")} min="0" />
        </Field>
        <Field label="Interest rate">
          <NumberInput value={form.rate} onChange={set("rate")} min="0" step="0.1" />
        </Field>
        <Field label="Rate unit">
          <select value={form.rateUnit} onChange={set("rateUnit")}>
            <option value="monthly">Per month</option>
            <option value="yearly">Per year</option>
          </select>
        </Field>

        <Field label="Interest method">
          <select value={form.interestMethod} onChange={set("interestMethod")}>
            <option value={INTEREST_METHODS.FLAT}>Flat</option>
            <option value={INTEREST_METHODS.REDUCING_BALANCE}>Reducing balance</option>
            <option value={INTEREST_METHODS.DAILY_OUTSTANDING}>Daily outstanding</option>
          </select>
        </Field>
        <Field label="Interest collected">
          <select value={form.interestCollection} onChange={set("interestCollection")}>
            <option value={INTEREST_COLLECTION.MONTHLY}>Monthly</option>
            <option value={INTEREST_COLLECTION.QUARTERLY}>Quarterly</option>
            <option value={INTEREST_COLLECTION.AT_CLOSURE}>At closure</option>
          </select>
        </Field>
        <Field label="Principal repayment">
          <select value={form.principalRepayment} onChange={set("principalRepayment")}>
            <option value={PRINCIPAL_REPAYMENT.MONTHLY}>Monthly</option>
            <option value={PRINCIPAL_REPAYMENT.QUARTERLY}>Quarterly</option>
            <option value={PRINCIPAL_REPAYMENT.LUMP_SUM}>Lump sum at end</option>
            <option value={PRINCIPAL_REPAYMENT.CUSTOM}>Custom</option>
          </select>
        </Field>
        <Field label="Tenure (months)">
          <NumberInput value={form.tenureMonths} onChange={set("tenureMonths")} min="1" />
        </Field>

        {isCustom && tenure > 0 && (
          <Field
            label="Principal due each month (₹)"
            className="grow"
            style={{ gridColumn: "1 / -1" }}
            hint={
              customOk
                ? `Adds up to ${formatINR(customTotal)}`
                : `Adds up to ${formatINR(customTotal)}, needs to equal the principal ${formatINR(Number(form.principal) || 0)}`
            }
          >
            <div className="custom-schedule">
              {customRows.map((v, i) => (
                <label key={i} className="custom-schedule-cell">
                  <span className="small muted">Month {i + 1}</span>
                  <NumberInput
                    value={v}
                    min="0"
                    onChange={(e) => setCustomRows((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))}
                  />
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label="Start date">
          <input type="date" value={form.startDate} onChange={set("startDate")} />
        </Field>
        <Field label="Grace period (days)">
          <NumberInput value={form.gracePeriodDays} onChange={set("gracePeriodDays")} min="0" />
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
          <Field label="Additional late interest (% / month)">
            <NumberInput value={form.lateAdditionalInterestRate} onChange={set("lateAdditionalInterestRate")} min="0" step="0.1" />
          </Field>
        )}
        {form.lateRule === LATE_RULES.FIXED_PENALTY && (
          <Field label="Late fee per overdue installment (₹)">
            <NumberInput value={form.lateFixedPenalty} onChange={set("lateFixedPenalty")} min="0" />
          </Field>
        )}
        {form.lateRule === LATE_RULES.PERCENTAGE_PENALTY && (
          <Field label="Late fee (% of overdue amount)">
            <NumberInput value={form.latePercentagePenalty} onChange={set("latePercentagePenalty")} min="0" step="0.1" />
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
        <Field label="Guarantors" hint="Hold Ctrl/Cmd to pick multiple">
          <select
            multiple
            value={form.guarantorIds}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                guarantorIds: Array.from(e.target.selectedOptions).map((o) => o.value),
              }))
            }
          >
            {state.members
              .filter((m) => m.id !== form.memberId && m.status === "active")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Security / collateral" className="grow">
          <TextInput value={form.security} onChange={set("security")} placeholder="e.g. Gold jewellery, property papers" />
        </Field>
        <Field label="Notes" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.notes} onChange={set("notes")} placeholder="Purpose, terms, anything" />
        </Field>
      </div>
      <MemberFormModal
        open={showNewBorrower}
        onClose={() => setShowNewBorrower(false)}
        defaultRole={MEMBER_ROLES.BORROWER}
        onCreated={(id) => setForm((f) => ({ ...f, memberId: id }))}
      />
    </Modal>
  );
}

// ------------------------------------------------------------ EventForm

// How a contribution counts toward the monthly deposit schedule:
// "auto" = oldest unpaid month, "lump" = one-off (not monthly), or "YYYY-MM".
function depositForOf(e) {
  if (e?.depositMonth) return e.depositMonth;
  return e?.lumpSum ? "lump" : "auto";
}

const monthName = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

export function EventFormModal({ open, onClose, preset = {}, editEvent = null, onDelete = null }) {
  const { state, addEvent, updateEvent } = useKopri();

  function makeForm() {
    if (editEvent) {
      // Edit mode: load the event verbatim so payment events keep their
      // installmentIndex / member / loan tagging while being edited.
      return { ...editEvent, amount: String(editEvent.amount ?? ""), depositFor: depositForOf(editEvent) };
    }
    return {
      type: EVENT_TYPES.CONTRIBUTION,
      date: todayISO(),
      amount: "1000",
      memberId: "",
      loanId: "",
      account: ACCOUNTS.CASH,
      description: "",
      sign: "positive",
      from: ACCOUNTS.CASH,
      to: ACCOUNTS.BANK,
      ...preset,
      depositFor: depositForOf(preset),
    };
  }

  const [form, setForm] = useState(makeForm);
  const [payMode, setPayMode] = useState("pi"); // quick-pay mode: "pi" | "p" | "i"

  // Re-seed the form each time the modal transitions closed → open, so a fresh
  // preset object from the calling page always wins.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(makeForm());
      setPayMode("pi");
      setWithLate(true);
    }
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // --- quick-pay: record a payment against one specific installment ---
  const isQuickPay = !editEvent && !!preset.quickPay && !!form.loanId;

  const loan = useMemo(
    () => (isQuickPay ? state.loans.find((l) => l.id === form.loanId) || null : null),
    [isQuickPay, form.loanId, state.loans]
  );
  // The installment as the ledger stands (payments, prepayments and any
  // year-end interest treatment already applied).
  const loanView = useMemo(() => (loan ? deriveLoan(loan, state.events) : null), [loan, state.events]);
  const targetIndex = preset.installmentIndex ?? -1;
  const installment = targetIndex >= 0 ? loanView?.installments[targetIndex] || null : null;

  const instLeft = useMemo(
    () => (installment ? { principal: installment.principalLeft, interest: installment.interestLeft } : { principal: 0, interest: 0 }),
    [installment]
  );

  // Late-payment charges on this installment as of the payment date, less any
  // late fee already collected on it (e.g. with an earlier part-payment).
  const late = useMemo(() => {
    if (!isQuickPay || !installment) return null;
    const c = computeLateCharges(loan, installment, instLeft.principal, instLeft.interest, form.date);
    const already = round2(installment.lateFeePaid || 0);
    return { ...c, alreadyCollected: already, total: round2(Math.max(0, c.total - already)) };
  }, [isQuickPay, installment, loan, instLeft.principal, instLeft.interest, form.date]);

  // In "Principal + interest" mode, show how the entered amount splits.
  const split = useMemo(
    () => (isQuickPay && payMode === "pi" && installment ? splitPayAmount(Number(form.amount) || 0, instLeft.principal, instLeft.interest) : null),
    [isQuickPay, payMode, installment, form.amount, instLeft.principal, instLeft.interest]
  );

  // A late fee on a monthly deposit (not on a loan) is tagged with its month.
  const isDepositFee = form.type === EVENT_TYPES.LATE_FEE && !!form.depositMonth && !form.loanId;
  const isContribution = form.type === EVENT_TYPES.CONTRIBUTION;
  const needsMember = [EVENT_TYPES.CONTRIBUTION, EVENT_TYPES.WITHDRAWAL].includes(form.type) || isDepositFee;
  const isLoanPayment =
    !isDepositFee && [EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE, EVENT_TYPES.LOAN_WRITE_OFF].includes(form.type);

  // Months the contribution can be put toward: the member's schedule so far
  // plus the next two months (advance deposits).
  const depositMember = isContribution ? state.members.find((m) => m.id === form.memberId) : null;
  const depositMonths = useMemo(() => {
    if (!depositMember || !isDepositor(depositMember)) return [];
    const d = deriveDeposits(depositMember, state.events, state.rules);
    const rows = d.months.slice(-12).map((m) => ({ month: m.month, left: m.left, status: m.status }));
    const last = rows.length ? rows[rows.length - 1].month : todayISO().slice(0, 7);
    for (let i = 1; i <= 2; i++) rows.push({ month: addMonthsYM(last, i), left: d.amount, status: "upcoming" });
    if (form.depositFor && /^\d{4}-\d{2}$/.test(form.depositFor) && !rows.some((r) => r.month === form.depositFor)) {
      rows.unshift({ month: form.depositFor, left: 0, status: "" });
    }
    return rows.reverse();
  }, [depositMember, state.events, state.rules, form.depositFor]);
  const isTransfer = form.type === EVENT_TYPES.TRANSFER;
  const isAdjustment = form.type === EVENT_TYPES.ADJUSTMENT;

  // Collect late charges with the installment payment?
  const [withLate, setWithLate] = useState(true);

  const valid =
    Number(form.amount) > 0 &&
    (isQuickPay
      ? !!installment
      : (isTransfer || isAdjustment || !needsMember || !!form.memberId) &&
        (isTransfer || isAdjustment || !isLoanPayment || !!form.loanId));

  const submit = () => {
    if (!valid) return;

    // Quick-pay against a specific installment. "Principal + interest" books
    // two linked events so the schedule, FIFO logic and reports stay exact.
    if (isQuickPay && installment) {
      const amt = Number(form.amount) || 0;
      const memberId = loan?.memberId || "";
      const desc = (form.description || "").trim() || `Installment ${installment.index + 1}`;
      const base = {
        date: form.date,
        account: form.account,
        memberId,
        loanId: form.loanId,
        installmentIndex: installment.index,
      };
      if (payMode === "pi") {
        const { principal, interest } = splitPayAmount(amt, instLeft.principal, instLeft.interest);
        if (principal > 0) {
          addEvent({ ...base, type: EVENT_TYPES.PRINCIPAL_PAYMENT, amount: principal, description: `${desc} — principal` });
        }
        if (interest > 0) {
          addEvent({ ...base, type: EVENT_TYPES.INTEREST_PAYMENT, amount: interest, description: `${desc} — interest` });
        }
      } else {
        addEvent({
          ...base,
          type: payMode === "p" ? EVENT_TYPES.PRINCIPAL_PAYMENT : EVENT_TYPES.INTEREST_PAYMENT,
          amount: amt,
          description: desc,
        });
      }
      // Late charges booked as a separate LATE_FEE event so reports stay clean.
      if (withLate && late && late.total > 0) {
        addEvent({
          ...base,
          type: EVENT_TYPES.LATE_FEE,
          amount: late.total,
          description: late.penalty > 0 && late.lateInterest > 0
            ? `Late charges: ${late.daysLate}d late — interest ${formatINR(late.lateInterest)} + penalty ${formatINR(late.penalty)}`
            : late.penalty > 0
              ? `Late penalty (${late.daysLate}d late)`
              : `Late interest (${late.daysLate}d @ ${late.rateLabel})`,
        });
      }
      onClose();
      return;
    }

    const base = {
      date: form.date,
      amount: Number(form.amount),
      account: isTransfer ? form.from : form.account,
      memberId: needsMember || isLoanPayment ? form.memberId : "",
      loanId: isLoanPayment ? form.loanId : "",
      description: form.description || (isTransfer ? "Transfer" : ""),
    };
    if (isContribution) {
      base.lumpSum = form.depositFor === "lump";
      base.depositMonth = /^\d{4}-\d{2}$/.test(form.depositFor || "") ? form.depositFor : "";
    } else if (isDepositFee) {
      base.depositMonth = form.depositMonth;
    }
    const payload = isTransfer
      ? { ...base, type: EVENT_TYPES.TRANSFER, from: form.from, to: form.to }
      : isAdjustment
        ? { ...base, type: EVENT_TYPES.ADJUSTMENT, sign: form.sign }
        : { ...base, type: form.type };

    if (editEvent) {
      updateEvent(editEvent.id, payload);
    } else {
      addEvent(payload);
    }
    onClose();
  };

  const typeOptions = [
    [EVENT_TYPES.CONTRIBUTION, "Member contribution"],
    [EVENT_TYPES.WITHDRAWAL, "Member withdrawal"],
    [EVENT_TYPES.LOAN_DISBURSEMENT, "Loan disbursement"],
    [EVENT_TYPES.PRINCIPAL_PAYMENT, "Principal repayment"],
    [EVENT_TYPES.INTEREST_PAYMENT, "Interest received"],
    [EVENT_TYPES.LATE_FEE, "Late fee / penalty"],
    [EVENT_TYPES.EXPENSE, "Expense"],
    [EVENT_TYPES.OTHER_INCOME, "Other income"],
    [EVENT_TYPES.TRANSFER, "Transfer (cash ↔ bank)"],
    [EVENT_TYPES.ADJUSTMENT, "Adjustment"],
    [EVENT_TYPES.LOAN_WRITE_OFF, "Bad debt write-off"],
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editEvent
          ? "Edit Transaction"
          : isQuickPay
            ? "Record Installment Payment"
            : isDepositFee
              ? `Deposit Late Fee · ${monthName(form.depositMonth)}`
              : "Record Transaction"
      }
      footer={
        <>
          {editEvent && onDelete && (
            <Button
              variant="danger"
              onClick={() => onDelete(editEvent)}
              style={{ marginRight: "auto" }}
            >
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {editEvent ? "Save changes" : isQuickPay ? "Record payment" : "Record"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Event type" className="grow" style={{ gridColumn: "1 / -1" }}>
          {isQuickPay ? (
            <>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "pi", label: "Principal + interest", amount: instLeft.principal + instLeft.interest },
                  { key: "p", label: "Principal only", amount: instLeft.principal },
                  { key: "i", label: "Interest only", amount: instLeft.interest },
                ].map((m) => (
                  <Button
                    key={m.key}
                    type="button"
                    size="sm"
                    variant={payMode === m.key ? "primary" : "ghost"}
                    onClick={() => {
                      setPayMode(m.key);
                      setForm((f) => ({ ...f, amount: String(round2(Math.max(m.amount, 0))) }));
                    }}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
              {installment ? (
                late?.isLate || instLeft.interest > 0 || instLeft.principal > 0 ? (
                  <InterestWorking
                    loan={loan}
                    installment={installment}
                    instLeft={instLeft}
                    late={late}
                    split={split}
                    payMode={payMode}
                    withLate={withLate}
                    setWithLate={setWithLate}
                  />
                ) : (
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Installment #{installment.index + 1} is already fully paid.
                  </div>
                )
              ) : (
                <div className="small muted" style={{ marginTop: 6 }}>
                  This loan is fully repaid.
                </div>
              )}
            </>
          ) : (
            <select value={form.type} onChange={set("type")}>
              {typeOptions.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={set("date")} />
        </Field>
        <Field label="Amount (₹)">
          <NumberInput value={form.amount} onChange={set("amount")} min="0" />
        </Field>

        {isAdjustment && (
          <Field label="Direction">
            <select value={form.sign} onChange={set("sign")}>
              <option value="positive">Add to pool (+)</option>
              <option value="negative">Deduct from pool (−)</option>
            </select>
          </Field>
        )}

        {isTransfer ? (
          <>
            <Field label="From">
              <select value={form.from} onChange={set("from")}>
                <option value={ACCOUNTS.CASH}>Cash</option>
                <option value={ACCOUNTS.BANK}>Bank</option>
              </select>
            </Field>
            <Field label="To">
              <select value={form.to} onChange={set("to")}>
                <option value={ACCOUNTS.BANK}>Bank</option>
                <option value={ACCOUNTS.CASH}>Cash</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Account">
            <select value={form.account} onChange={set("account")}>
              <option value={ACCOUNTS.CASH}>Cash</option>
              <option value={ACCOUNTS.BANK}>Bank</option>
            </select>
          </Field>
        )}

        {needsMember && (
          <Field label="Member">
            <select value={form.memberId} onChange={set("memberId")}>
              <option value="">Select member…</option>
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {isContribution && depositMonths.length > 0 && (
          <Field label="Counts as" hint="Which monthly deposit this pays">
            <select value={form.depositFor} onChange={set("depositFor")}>
              <option value="auto">Monthly deposit, oldest unpaid month first</option>
              {depositMonths.map((m) => (
                <option key={m.month} value={m.month}>
                  {monthName(m.month)}
                  {m.left > 0.5 && m.status !== "upcoming" ? ` (${formatINR(m.left)} left)` : m.status === "paid" || m.status === "paid_late" ? " (paid)" : ""}
                </option>
              ))}
              <option value="lump">One-off / lump sum (not a monthly deposit)</option>
            </select>
          </Field>
        )}

        {isLoanPayment && !isQuickPay && (
          <Field label="Loan" className="grow">
            <select
              value={form.loanId}
              onChange={(e) => {
                const loanId = e.target.value;
                const l = state.loans.find((x) => x.id === loanId);
                setForm((f) => ({ ...f, loanId, memberId: l ? l.memberId : f.memberId }));
              }}
            >
              <option value="">Select loan…</option>
              {state.loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} — {state.members.find((m) => m.id === l.memberId)?.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Description" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.description} onChange={set("description")} placeholder="Short note for the ledger" />
        </Field>
      </div>
    </Modal>
  );
}
