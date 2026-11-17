// First-run setup: three short steps for a new kopri.
//   1. Name, monthly deposit and its due date
//   2. Usual loan interest and the referral rule
//   3. Add the first members (name + mobile)
import { useEffect, useRef, useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Modal, Button, Field, TextInput, NumberInput, Choice, Avatar } from "./ui.jsx";
import { MEMBER_ROLES } from "../lib/constants.js";
import { formatINR, todayISO, uid } from "../lib/format.js";

const STEPS = ["Your kopri", "Loans", "Members"];

export default function SetupGuide({ open, onClose }) {
  const { state, activeKopriId, renameKopri, updateRules, addMember } = useKopri();
  const rules = state.rules;
  const [step, setStep] = useState(0);
  const initial = () => ({
    name: state.name || rules.kopriName || "",
    deposit: String(rules.defaultMonthlyDeposit ?? 1000),
    dueDay: String(rules.depositDueDay ?? 1),
    deadlineDay: String(rules.depositDeadlineDay ?? 15),
    rate: String(rules.defaultInterestRate ?? 2),
    rateUnit: rules.defaultRateUnit || "monthly",
    grace: String(rules.gracePeriodDays ?? 5),
    referral: rules.requireReferral !== false ? "yes" : "no",
  });
  const [f, setF] = useState(initial);
  const [person, setPerson] = useState({ name: "", phone: "", role: MEMBER_ROLES.DEPOSITOR });
  const [added, setAdded] = useState([]);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(0);
      setAdded([]);
      setPerson({ name: "", phone: "", role: MEMBER_ROLES.DEPOSITOR });
      setF(initial());
    }
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const day = (v) => Math.min(28, Math.max(1, Math.floor(Number(v) || 1)));
  const ok0 = f.name?.trim() && Number(f.deposit) >= 0;
  const ok1 = Number(f.rate) >= 0;

  const saveStep = () => {
    if (step === 0) {
      if (f.name.trim() !== state.name) renameKopri(activeKopriId, f.name.trim());
      updateRules({
        defaultMonthlyDeposit: Number(f.deposit) || 0,
        depositDueDay: day(f.dueDay),
        depositDeadlineDay: day(f.deadlineDay),
      });
    } else if (step === 1) {
      updateRules({
        defaultInterestRate: Number(f.rate) || 0,
        defaultRateUnit: f.rateUnit,
        gracePeriodDays: Math.max(0, Math.floor(Number(f.grace) || 0)),
        requireReferral: f.referral === "yes",
      });
    }
    setStep(step + 1);
  };

  const addPerson = () => {
    const name = person.name.trim();
    if (!name) return;
    const deposits = person.role !== MEMBER_ROLES.BORROWER;
    addMember({
      id: uid("m"),
      name,
      phone: person.phone.trim(),
      role: person.role,
      monthlyDeposit: deposits ? Number(f.deposit) || 0 : 0,
      depositStartMonth: deposits ? todayISO().slice(0, 7) : "",
      joinedAt: todayISO(),
    });
    setAdded((a) => [...a, { name, role: person.role }]);
    setPerson((p) => ({ ...p, name: "", phone: "" }));
  };

  const finish = () => {
    updateRules({ setupDone: true });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={finish}
      title="Set up your kopri"
      footer={
        <>
          {step === 0 ? <Button onClick={finish}>Skip for now</Button> : <Button onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 2 ? (
            <Button variant="primary" onClick={saveStep} disabled={step === 0 ? !ok0 : !ok1}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={finish}>
              {added.length ? "Done" : "Finish, add members later"}
            </Button>
          )}
        </>
      }
    >
      <div className="wizard-steps" aria-label={`Step ${step + 1} of 3`}>
        {STEPS.map((l, i) => (
          <span key={l} className={i === step ? "on" : i < step ? "done" : ""}>
            {i + 1}. {l}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="form-grid">
          <Field label="Kopri name" className="grow" style={{ gridColumn: "1 / -1" }}>
            <TextInput value={f.name} onChange={set("name")} placeholder="e.g. Mapusa Friends Kopri" />
          </Field>
          <Field label="Monthly deposit per member (₹)" className="grow" style={{ gridColumn: "1 / -1" }} hint="You can change it for one person later">
            <NumberInput value={f.deposit} onChange={set("deposit")} min="0" />
          </Field>
          <Field label="Deposit due on day" hint="of each month">
            <NumberInput value={f.dueDay} onChange={set("dueDay")} min="1" max="28" step="1" inputMode="numeric" />
          </Field>
          <Field label="Late after day" hint="after this day it shows red">
            <NumberInput value={f.deadlineDay} onChange={set("deadlineDay")} min="1" max="28" step="1" inputMode="numeric" />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="form-grid">
          <Field label="Usual loan interest (%)">
            <NumberInput value={f.rate} onChange={set("rate")} min="0" step="0.1" />
          </Field>
          <Field label="Interest per">
            <Choice
              label="Interest per"
              value={f.rateUnit}
              onChange={(v) => setF((x) => ({ ...x, rateUnit: v }))}
              options={[
                ["monthly", "Month"],
                ["yearly", "Year"],
              ]}
            />
          </Field>
          <Field label="Days allowed after an EMI's due date" hint="Before it counts as late">
            <NumberInput value={f.grace} onChange={set("grace")} min="0" step="1" inputMode="numeric" />
          </Field>
          <Field label="Must a member recommend every loan?">
            <Choice
              label="Must a member recommend every loan?"
              value={f.referral}
              onChange={(v) => setF((x) => ({ ...x, referral: v }))}
              options={[
                ["yes", "Yes"],
                ["no", "No"],
              ]}
            />
          </Field>
          <div className="small muted" style={{ gridColumn: "1 / -1" }}>
            Late fees, profit split and the financial year can be changed any time in Settings.
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="small muted">
            Add each person with their mobile number (for WhatsApp). Members pay {formatINR(Number(f.deposit) || 0)} a month. You can add more details later.
          </div>
          <div className="form-grid">
            <Field label="Name" className="grow" style={{ gridColumn: "1 / -1" }}>
              <TextInput
                value={person.name}
                onChange={(e) => setPerson((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
                placeholder="e.g. Anita Fernandes"
              />
            </Field>
            <Field label="Mobile number">
              <input
                type="tel"
                inputMode="tel"
                value={person.phone}
                onChange={(e) => setPerson((p) => ({ ...p, phone: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
                placeholder="98220 12345"
              />
            </Field>
            <Field label="Type">
              <Choice
                label="Type"
                value={person.role}
                onChange={(v) => setPerson((p) => ({ ...p, role: v }))}
                options={[
                  [MEMBER_ROLES.DEPOSITOR, "Member"],
                  [MEMBER_ROLES.BORROWER, "Borrower only"],
                ]}
              />
            </Field>
          </div>
          <Button onClick={addPerson} disabled={!person.name.trim()} style={{ minHeight: 46 }}>
            + Add {person.name.trim() || "this person"}
          </Button>
          {added.length > 0 && (
            <div className="card">
              {added.map((p, i) => (
                <div key={i} className="collect-paid-row">
                  <Avatar name={p.name} id={p.name} />
                  <div className="grow" style={{ fontWeight: 650 }}>
                    {p.name}
                  </div>
                  <span className="small muted">{p.role === MEMBER_ROLES.BORROWER ? "Borrower" : "Member"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
