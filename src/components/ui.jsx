import { useEffect, useState } from "react";
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

export function StatusBadge({ status }) {
  const map = {
    active: <Badge tone="green" dot>Active</Badge>,
    inactive: <Badge tone="gray">Inactive</Badge>,
    draft: <Badge tone="gray">Draft</Badge>,
    overdue: <Badge tone="red" dot>Overdue</Badge>,
    completed: <Badge tone="teal" dot>Completed</Badge>,
    defaulted: <Badge tone="red" dot>Defaulted</Badge>,
    paid: <Badge tone="green">Paid</Badge>,
    due: <Badge tone="amber">Due</Badge>,
    paid_late: <Badge tone="amber">Paid late</Badge>,
    late: <Badge tone="red" dot>Late</Badge>,
    upcoming: <Badge tone="gray">Upcoming</Badge>,
    written_off: <Badge tone="gray">Written off</Badge>,
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
export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
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

export function NumberInput(props) {
  return <input type="number" step="any" {...props} />;
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
let toastListeners = [];
export function toast(msg) {
  toastListeners.forEach((cb) => cb(msg));
  setTimeout(() => toastListeners.forEach((cb) => cb("»")), 3600);
  setTimeout(() => toastListeners.forEach((cb) => cb(null)), 3700);
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const idx = toastListeners.length;
    toastListeners.push(setMsg);
    return () => {
      toastListeners.splice(idx, 1);
    };
  }, []);
  return msg;
}

export function ToastHost() {
  const msg = useToast();
  if (!msg) return null;
  return (
    <div
      className="toast"
      style={{
        position: "fixed",
        bottom: 84,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: "10px 18px",
        boxShadow: "var(--shadow-lg)",
        zIndex: 200,
        fontWeight: 600,
        fontSize: 13.5,
        color: "var(--text)",
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      {msg}
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