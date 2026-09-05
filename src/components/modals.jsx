import { useState } from "react";
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
import { todayISO } from "../lib/format.js";

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
  const valid = form.memberId && Number(form.principal) > 0 && Number(form.tenureMonths) > 0;

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
    };
    if (editLoan) {
      updateLoan(editLoan.id, payload);
    } else {
      addLoan(payload);
      // create the disbursement event in the ledger
      addEvent({
        type: EVENT_TYPES.LOAN_DISBURSEMENT,
        memberId: form.memberId,
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
export function EventFormModal({ open, onClose, preset = {}, editEvent = null }) {
  const { state, addEvent, updateEvent } = useKopri();
  const [form, setForm] = useState(
    () => {
      const base = {
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
      return editEvent ? { ...base, ...editEvent } : base;
    }
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const needsMember = [EVENT_TYPES.CONTRIBUTION, EVENT_TYPES.WITHDRAWAL].includes(form.type);
  const needsLoan = [EVENT_TYPES.PRINCIPAL_PAYMENT, EVENT_TYPES.INTEREST_PAYMENT, EVENT_TYPES.LATE_FEE].includes(form.type);
  const isTransfer = form.type === EVENT_TYPES.TRANSFER;
  const isAdjustment = form.type === EVENT_TYPES.ADJUSTMENT;
  const valid = Number(form.amount) > 0 && (isTransfer || isAdjustment || !needsMember || form.memberId) && (isTransfer || isAdjustment || !needsLoan || form.loanId);

  const submit = () => {
    if (!valid) return;
    const base = {
      date: form.date,
      amount: Number(form.amount),
      account: isTransfer ? form.from : form.account,
      memberId: needsMember || needsLoan ? form.memberId : "",
      loanId: needsLoan ? form.loanId : "",
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
      title="Record Transaction"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            Record
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Event type" className="grow" style={{ gridColumn: "1 / -1" }}>
          <select value={form.type} onChange={set("type")}>
            {typeOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={set("date")} />
        </Field>
        <Field label={isTransfer ? "Amount (₹)" : isAdjustment ? `Amount (₹, ${form.sign === "negative" ? "deduct" : "add"})` : "Amount (₹)"}>
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

        {needsLoan && (
          <>
            <Field label="Loan">
              <select value={form.loanId} onChange={set("loanId")}>
                <option value="">Select loan…</option>
                {state.loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} — {state.members.find((m) => m.id === l.memberId)?.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Member">
              <select value={form.memberId} onChange={set("memberId")}>
                <option value="">Auto from loan</option>
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Description" className="grow" style={{ gridColumn: "1 / -1" }}>
          <TextInput value={form.description} onChange={set("description")} placeholder="Short note for the ledger" />
        </Field>
      </div>
    </Modal>
  );
}