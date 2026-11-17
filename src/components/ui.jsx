import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./Icons.jsx";
import { avatarColor, initials } from "../lib/format.js";

// ---------------------------------------------------------------- Card
export function Card({ title, sub, actions, children, pad = true, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            <div className="card-title">{title}</div>
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {pad ? <div className="card-pad">{children}</div> : children}
    </div>
  );
}

// ------------------------------------------------------------ StatCard
export function StatCard({ label, value, foot, color = "var(--primary)", icon }) {
  return (
    <div className="stat-card" style={{ "--stat-color": color }}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
const badgeTones = {
  green: "badge-green",
  red: "badge-red",
  amber: "badge-amber",
  blue: "badge-blue",
  violet: "badge-violet",
  teal: "badge-teal",
  gray: "badge-gray",
};

export function Badge({ tone = "gray", dot = false, children, style }) {
  return (
    <span className={`badge ${badgeTones[tone] || "badge-gray"} ${dot ? "badge-dot" : ""}`} style={style}>
      {children}
    </span>
  );
}

// One colour code everywhere: green = paid / fine, orange = due, red = late.
export function StatusBadge({ status }) {
  const map = {
    active: <Badge tone="green" dot>Active</Badge>,
    inactive: <Badge tone="gray">Inactive</Badge>,
    draft: <Badge tone="gray">Draft</Badge>,
    overdue: <Badge tone="red" dot>Late</Badge>,
    completed: <Badge tone="green" dot>Closed</Badge>,
    defaulted: <Badge tone="red" dot>Not paying</Badge>,
    paid: <Badge tone="green" dot>Paid</Badge>,
    due: <Badge tone="amber" dot>Due</Badge>,
    paid_late: <Badge tone="green" dot>Paid late</Badge>,
    late: <Badge tone="red" dot>Late</Badge>,
    upcoming: <Badge tone="gray">Not due yet</Badge>,
    written_off: <Badge tone="gray">Can't recover</Badge>,
  };
  return map[status] || <Badge tone="gray">{status}</Badge>;
}

// --------------------------------------------------------------- Button
export function Button({ variant = "secondary", size, className = "", children, ...rest }) {
  const cls = [
    "btn",
    variant === "primary" ? "btn-primary" : "",
    variant === "danger" ? "btn-danger" : "",
    variant === "ghost" ? "btn-ghost" : "",
    size === "sm" ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Modal
const openModals = [];

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const overlayRef = useRef(null);

  // iPhone browsers size `vh` to the screen with the toolbars hidden, so a
  // vh-based sheet runs under the toolbar (and the keyboard) and its Save
  // button can't be reached. Pin the overlay to the area actually visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!open || !vv || !el) return;
    const apply = () => {
      el.style.setProperty("--vvh", `${vv.height}px`);
      el.style.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open]);

  // Modals can stack (e.g. Create Loan → New borrower, Manage Kopris →
  // Delete). Only the top one reacts to Escape, and the page stays locked
  // until the last one closes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry = {};
    openModals.push(entry);
    document.body.classList.add("modal-open");
    const onKey = (e) => {
      if (e.key === "Escape" && openModals[openModals.length - 1] === entry) onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(entry), 1);
      if (!openModals.length) document.body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div ref={overlayRef} className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------- EmptyState
export function EmptyState({ icon = "📭", title = "Nothing here yet", sub }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- Field
export function Field({ label, hint, children, className = "", style }) {
  return (
    <div className={`form-group ${className}`} style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function TextInput(props) {
  return <input type="text" {...props} />;
}

// Opens the number pad on phones.
export function NumberInput(props) {
  return <input type="number" step="any" inputMode="decimal" {...props} />;
}

// Two or three big buttons instead of a dropdown, e.g. Cash | Bank.
export function Choice({ value, onChange, options, label }) {
  return (
    <div className="seg seg-full" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" key={v} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- Avatar
export function Avatar({ name, id, size = "" }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ background: avatarColor(id || name) }} title={name}>
      {initials(name)}
    </span>
  );
}

// ------------------------------------------------------------ MemberCell
export function MemberCell({ name, sub, id }) {
  return (
    <div className="member-cell">
      <Avatar name={name} id={id} />
      <div>
        <div className="name">{name}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ ProgressBar
export function Progress({ value, max = 100, color }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div style={{ width: `${pct}%`, background: color || "var(--primary)" }} />
    </div>
  );
}

// --------------------------------------------------------------- Section
export function SectionTitle({ children, sub, right }) {
  return (
    <div className="spread" style={{ marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 720 }}>{children}</div>
        {sub && <div className="small faint">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// --------------------------------------------------------------- Toast
// toast("Saved") or toast("Recorded", { actions: [{ label: "Undo", onClick }], duration: 7000 })
let toastListeners = [];
let toastTimer = null;
export function toast(msg, { actions = [], duration } = {}) {
  const t = { msg, actions, id: Math.random() };
  toastListeners.forEach((cb) => cb(t));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastListeners.forEach((cb) => cb(null)), duration ?? (actions.length ? 7000 : 3600));
}
export function dismissToast() {
  clearTimeout(toastTimer);
  toastListeners.forEach((cb) => cb(null));
}

export function useToast() {
  const [t, setT] = useState(null);
  useEffect(() => {
    toastListeners.push(setT);
    return () => {
      toastListeners = toastListeners.filter((cb) => cb !== setT);
    };
  }, []);
  return t;
}

export function ToastHost() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className={`toast ${t.actions.length ? "toast-actions" : ""}`} role="status" aria-live="polite">
      <span className="toast-msg">{t.msg}</span>
      {t.actions.map((a) => (
        <button
          key={a.label}
          className="toast-btn"
          onClick={() => {
            a.onClick?.();
            dismissToast();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- ConfirmModal
export function ConfirmModal({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", danger = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm} variant={danger ? "danger" : "primary"}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}