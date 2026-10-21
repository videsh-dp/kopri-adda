import { useState, useMemo, useEffect, useRef } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Modal, Button, Field, TextInput, NumberInput } from "./ui.jsx";
import {
  INTEREST_METHODS,
  INTEREST_COLLECTION,
  PRINCIPAL_REPAYMENT,
  LATE_RULES,
  UNPAID_INTEREST_RULES,
  ACCOUNTS,
  EVENT_TYPES,
} from "../lib/constants.js";
import { buildSchedule, computeLateCharges, splitPayAmount } from "../lib/calculations.js";
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
export function MemberFormModal({ open, onClose }) {
  const { addMember } = useKopri();
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [initialContribution, setInitialContribution] = useState("0");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const amt = Number(initialContribution) || 0;
    addMember({ ...form, name: form.name.trim() }, amt);
    onClose();
    setForm({ name: "", phone: "", email: "", notes: "" });
    setInitialContribution("0");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Member"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            Add member
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Anita Fernandes" autoFocus />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={set("phone")} placeholder="98220 12345" />
        </Field>
        <Field label="Email">
          <TextInput value={form.email} onChange={set("email")} placeholder="name@example.com" />
        </Field>
        <Field label="Opening contribution (₹)" hint="Optional — records a MEMBER_CONTRIBUTION event">
          <NumberInput value={initialContribution} onChange={(e) => setInitialContribution(e.target.value)} min="0" />
        </Field>
        <Field label="Notes" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.notes} onChange={set("notes")} placeholder="Anything worth remembering" />
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- LoanForm
export function LoanFormModal({ open, onClose, editLoan = null, presetMemberId = "" }) {
  const { state, addLoan, updateLoan, addEvent } = useKopri();
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
          security: "",
          notes: "",
          guarantorIds: [],
        }
  );

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

  const valid = form.memberId && Number(form.principal) > 0 && Number(form.tenureMonths) > 0 && customOk;

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
      security: form.security,
      notes: form.notes,
      guarantorIds: Array.isArray(form.guarantorIds) ? form.guarantorIds : [],
      customPrincipalSchedule: isCustom ? customRows.map((v) => Number(v) || 0) : null,
    };
    if (editLoan) {
      updateLoan(editLoan.id, payload);
    } else {
      const loanId = uid("l");
      addLoan({ ...payload, id: loanId });
      // create the disbursement event in the ledger
      addEvent({
        type: EVENT_TYPES.LOAN_DISBURSEMENT,
        memberId: form.memberId,
        loanId,
        amount: Number(form.principal),
        account: "cash",
        date: form.startDate,
        description: "Loan disbursement",
      });
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
          <select value={form.memberId} onChange={set("memberId")}>
            <option value="">Select member…</option>
            {state.members.map((m) => (
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
        <Field label="Unpaid interest at year end">
          <select value={form.unpaidInterestRule} onChange={set("unpaidInterestRule")}>
            <option value={UNPAID_INTEREST_RULES.CARRY_FORWARD}>Carry forward</option>
            <option value={UNPAID_INTEREST_RULES.SEPARATE_OUTSTANDING}>Separate outstanding</option>
            <option value={UNPAID_INTEREST_RULES.CAPITALIZE}>Capitalize into principal</option>
            <option value={UNPAID_INTEREST_RULES.WRITE_OFF}>Write off</option>
            <option value={UNPAID_INTEREST_RULES.MANUAL}>Manual</option>
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
              .filter((m) => m.id !== form.memberId)
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
    </Modal>
  );
}

// ------------------------------------------------------------ EventForm

export function EventFormModal({ open, onClose, preset = {}, editEvent = null, onDelete = null }) {
  const { state, addEvent, updateEvent } = useKopri();

  function makeForm() {
    if (editEvent) {
      // Edit mode: load the event verbatim so payment events keep their
      // installmentIndex / member / loan tagging while being edited.
      return { ...editEvent, amount: String(editEvent.amount ?? "") };
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
  const schedule = useMemo(() => (loan ? buildSchedule(loan) : []), [loan]);
  const targetIndex = preset.installmentIndex ?? -1;
  const installment = targetIndex >= 0 ? schedule[targetIndex] || null : null;

  // Paid-so-far per installment (principal/interest) from tagged payment events.
  const paidByInstallment = useMemo(() => {
    const arr = [];
    if (!isQuickPay) return arr;
    for (const ev of state.events) {
      if (ev.loanId !== form.loanId) continue;
      const idx = ev.installmentIndex;
      if (idx === undefined || idx === null) continue;
      arr[idx] = arr[idx] || { principal: 0, interest: 0 };
      if (ev.type === EVENT_TYPES.PRINCIPAL_PAYMENT) arr[idx].principal += Number(ev.amount) || 0;
      else if (ev.type === EVENT_TYPES.INTEREST_PAYMENT) arr[idx].interest += Number(ev.amount) || 0;
    }
    return arr;
  }, [isQuickPay, form.loanId, state.events]);

  const instLeft = useMemo(() => {
    if (!installment) return { principal: 0, interest: 0 };
    const paid = paidByInstallment[installment.index] || { principal: 0, interest: 0 };
    return {
      principal: round2(Math.max(installment.principalDue - paid.principal, 0)),
      interest: round2(Math.max(installment.interestDue - paid.interest, 0)),
    };
  }, [installment, paidByInstallment]);

  // Late-payment charges on this installment as of the payment date.
  const late = useMemo(
    () => (isQuickPay && installment ? computeLateCharges(loan, installment, instLeft.principal, instLeft.interest, form.date) : null),
    [isQuickPay, installment, loan, instLeft.principal, instLeft.interest, form.date]
  );

  // In "Principal + interest" mode, show how the entered amount splits.
  const split = useMemo(
    () => (isQuickPay && payMode === "pi" && installment ? splitPayAmount(Number(form.amount) || 0, instLeft.principal, instLeft.interest) : null),
    [isQuickPay, payMode, installment, form.amount, instLeft.principal, instLeft.interest]
  );

  const needsMember = [EVENT_TYPES.CONTRIBUTION, EVENT_TYPES.WITHDRAWAL].includes(form.type);
  const isLoanPayment = [EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE, EVENT_TYPES.LOAN_WRITE_OFF].includes(form.type);
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
      title={editEvent ? "Edit Transaction" : isQuickPay ? "Record Installment Payment" : "Record Transaction"}
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
