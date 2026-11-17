import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { collectionList, paymentEvents, whatsappLink, receiptText, reminderText } from "../lib/collect.js";
import { formatINR, formatDate, todayISO, round2 } from "../lib/format.js";
import { Avatar, Button, Modal, toast } from "../components/ui.jsx";
import { EventFormModal } from "../components/modals.jsx";
import { IconCheck, IconChat, IconMore, IconSearch, IconPlus } from "../components/Icons.jsx";
import { EVENT_TYPES } from "../lib/constants.js";

const ACCOUNT_KEY = "kopri.collectAccount";
const readAccount = () => {
  try {
    return localStorage.getItem(ACCOUNT_KEY) === "bank" ? "bank" : "cash";
  } catch {
    return "cash";
  }
};

const monthLong = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

export function StatusPill({ status, children }) {
  return <span className={`status-pill ${status}`}>{children}</span>;
}

function whenText(item, today) {
  if (item.status === "paid") return "Paid";
  if (item.status === "late") return item.daysLate > 0 ? `Late · ${item.daysLate} day${item.daysLate === 1 ? "" : "s"}` : "Late";
  if (item.dueDate > today) return `Due ${formatDate(item.dueDate).slice(0, -5)}`;
  return "Due now";
}

function openWhatsApp(phone, text) {
  window.open(whatsappLink(phone, text), "_blank", "noopener");
}

export default function Collect() {
  const { state, addEvent, deleteEvent } = useKopri();
  const today = todayISO();
  const kopriName = state.name || state.rules.kopriName || "Kopri";
  const [account, setAccountState] = useState(readAccount);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [menuFor, setMenuFor] = useState(null); // row whose "more" menu is open
  const [preset, setPreset] = useState(null); // EventFormModal preset for "other amount"
  const [showOther, setShowOther] = useState(false);

  const setAccount = (a) => {
    setAccountState(a);
    try {
      localStorage.setItem(ACCOUNT_KEY, a);
    } catch {
      /* ignore */
    }
  };

  const list = useMemo(() => collectionList(state, today), [state, today]);
  const q = query.trim().toLowerCase();
  const filter = (i) =>
    (!q || i.member.name.toLowerCase().includes(q)) &&
    (kind === "all" || (kind === "emi" ? i.kind === "emi" : i.kind !== "emi"));
  const rows = list.toCollect.filter(filter);
  const paidRows = list.paid.filter(filter);

  const markPaid = (item) => {
    const events = paymentEvents(item, { date: today, account });
    events.forEach((e) => addEvent(e));
    const name = item.member.name.split(" ")[0];
    toast(`${formatINR(item.amount)} from ${name} recorded`, {
      actions: [
        { label: "Undo", onClick: () => events.forEach((e) => deleteEvent(e.id)) },
        { label: "Send receipt", onClick: () => openWhatsApp(item.member.phone, receiptText({ kopriName, item, amount: item.amount, date: today })) },
      ],
    });
  };

  const openOtherAmount = (item) => {
    setMenuFor(null);
    if (item.kind === "emi") {
      setPreset({
        quickPay: true,
        memberId: item.member.id,
        loanId: item.loan.id,
        installmentIndex: item.installment.index,
        amount: String(round2(item.base)),
        date: today,
        account,
        description: `Installment ${item.installment.index + 1}`,
      });
    } else if (item.kind === "deposit") {
      setPreset({
        type: EVENT_TYPES.CONTRIBUTION,
        memberId: item.member.id,
        amount: String(item.base),
        depositMonth: item.month,
        date: today,
        account,
        description: `Monthly deposit, ${monthLong(item.month)}`,
      });
    } else {
      setPreset({
        type: EVENT_TYPES.LATE_FEE,
        memberId: item.member.id,
        loanId: "",
        amount: String(item.lateFee),
        depositMonth: item.month,
        date: today,
        account,
        description: `Late fee on ${monthLong(item.month)} deposit`,
      });
    }
  };

  const hasPeople = state.members.length > 0;

  return (
    <div className="stack">
      <div className="collect-head">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <div className="page-title">To collect · {monthLong(list.month)}</div>
            <div className="page-sub">Tap the green button when someone pays. You can undo it straight away.</div>
          </div>
          <Button onClick={() => setShowOther(true)}>
            <IconPlus /> Record other money
          </Button>
        </div>

        <div className="collect-summary">
          <div className="collect-sum">
            <div className="collect-sum-label">Still to collect</div>
            <div className="collect-sum-value">{formatINR(list.totals.toCollect)}</div>
            <div className="small faint">{list.toCollect.length} payment{list.toCollect.length === 1 ? "" : "s"}</div>
          </div>
          <div className="collect-sum late">
            <div className="collect-sum-label">Late</div>
            <div className="collect-sum-value">{formatINR(list.totals.late)}</div>
            <div className="small faint">{list.totals.lateCount} payment{list.totals.lateCount === 1 ? "" : "s"}</div>
          </div>
          <div className="collect-sum paid">
            <div className="collect-sum-label">Collected this month</div>
            <div className="collect-sum-value">{formatINR(list.totals.collected)}</div>
            <div className="small faint">{list.paid.length} paid</div>
          </div>
        </div>

        <div className="collect-tools">
          <label className="search" style={{ position: "relative" }}>
            <IconSearch style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a name"
              aria-label="Find a name"
              style={{ paddingLeft: 36, width: "100%" }}
            />
          </label>
          <div className="seg" role="group" aria-label="Show">
            {[
              ["all", "All"],
              ["deposit", "Deposits"],
              ["emi", "Loan EMIs"],
            ].map(([k, l]) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} aria-pressed={kind === k}>
                {l}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted">Money received in</span>
            <div className="seg" role="group" aria-label="Money received in">
              {[
                ["cash", "Cash"],
                ["bank", "Bank / UPI"],
              ].map(([k, l]) => (
                <button key={k} className={account === k ? "on" : ""} onClick={() => setAccount(k)} aria-pressed={account === k}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!hasPeople ? (
        <div className="collect-done" style={{ background: "var(--primary-soft)", color: "var(--primary-text)" }}>
          No members yet. <Link to="/members" style={{ textDecoration: "underline" }}>Add your first member</Link> to start collecting.
        </div>
      ) : rows.length === 0 ? (
        <div className="collect-done">
          {q || kind !== "all" ? "Nothing to collect for this filter." : "Everyone has paid for this month. 🎉"}
        </div>
      ) : (
        <div className="collect-list">
          {rows.map((item) => (
            <div key={item.key} className={`collect-row ${item.status}`} data-key={item.key}>
              <div className="collect-row-top">
                <Avatar name={item.member.name} id={item.member.id} />
                <div className="collect-row-who">
                  <div className="collect-row-name">
                    <Link to={item.kind === "emi" ? `/loans/${item.loan.id}` : `/members/${item.member.id}`}>{item.member.name}</Link>
                  </div>
                  <div className="collect-row-what">
                    {item.title} · <StatusPill status={item.status}>{whenText(item, today)}</StatusPill>
                  </div>
                </div>
                <div className="collect-row-amt">
                  {formatINR(item.amount)}
                  {item.lateFee > 0.005 && item.base > 0 && <span className="small">incl. {formatINR(item.lateFee)} late fee</span>}
                </div>
              </div>
              <div className="collect-row-actions">
                <Button className="btn-paid" onClick={() => markPaid(item)}>
                  <IconCheck width={20} height={20} /> Paid {formatINR(item.amount)}
                </Button>
                <Button
                  className="btn-wa"
                  onClick={() => openWhatsApp(item.member.phone, reminderText({ kopriName, item, today }))}
                  aria-label={`Send ${item.member.name} a WhatsApp reminder`}
                  title="Send a WhatsApp reminder"
                >
                  <IconChat width={18} height={18} /> Remind
                </Button>
                <Button className="btn-more" onClick={() => setMenuFor(item)} aria-label="More choices">
                  <IconMore width={20} height={20} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paidRows.length > 0 && (
        <>
          <div className="collect-section-title">
            <StatusPill status="paid">Paid this month</StatusPill>
            <span className="small faint">{paidRows.length}</span>
          </div>
          <div className="card">
            {paidRows.map((item) => (
              <div key={item.key} className="collect-paid-row">
                <Avatar name={item.member.name} id={item.member.id} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>{item.member.name}</div>
                  <div className="small muted">{item.title}</div>
                </div>
                <div className="num" style={{ fontWeight: 700, color: "var(--green)" }}>{formatINR(item.amount)}</div>
                <Button
                  size="sm"
                  className="btn-wa"
                  style={{ minHeight: 38 }}
                  onClick={() => openWhatsApp(item.member.phone, receiptText({ kopriName, item, amount: item.amount, date: item.paidDate || today }))}
                  title="Send a WhatsApp receipt"
                >
                  <IconChat width={16} height={16} /> Receipt
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? `${menuFor.member.name} · ${menuFor.title}` : ""}>
        {menuFor && (
          <div className="menu-list">
            <button onClick={() => openOtherAmount(menuFor)}>
              <span>
                Paid a different amount or on another date
                <span className="small muted">Part payment, interest only, or an earlier date</span>
              </span>
            </button>
            <button
              onClick={() => {
                openWhatsApp(menuFor.member.phone, reminderText({ kopriName, item: menuFor, today }));
                setMenuFor(null);
              }}
            >
              <span>
                Send WhatsApp reminder
                <span className="small muted">{menuFor.member.phone ? `To ${menuFor.member.phone}` : "No phone saved, you pick the contact"}</span>
              </span>
            </button>
            <Link to={`/members/${menuFor.member.id}`} onClick={() => setMenuFor(null)}>
              Open {menuFor.member.name.split(" ")[0]}'s page
            </Link>
            {menuFor.kind === "emi" && (
              <Link to={`/loans/${menuFor.loan.id}`} onClick={() => setMenuFor(null)}>
                Open the loan
              </Link>
            )}
          </div>
        )}
      </Modal>

      <EventFormModal open={!!preset} onClose={() => setPreset(null)} preset={preset || {}} />
      <EventFormModal open={showOther} onClose={() => setShowOther(false)} preset={{ account }} />
    </div>
  );
}
