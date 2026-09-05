// ---------------------------------------------------------------------------
// Formatting helpers — Indian ₹ number formatting, dates, percentages
// ---------------------------------------------------------------------------

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const numPrecise = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(value, { precise = false, signed = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatter = precise ? inrPrecise : inr;
  let out = formatter.format(Math.abs(value));
  if (signed) {
    out = value < 0 ? `-${out}` : `+${out}`;
  }
  return out;
}

export function formatNumber(value, { precise = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return (precise ? numPrecise : num).format(value);
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

// Date handling — store dates as "YYYY-MM-DD" everywhere.
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateShort(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetween(isoA, isoB) {
  const [ya, ma, da] = isoA.split("-").map(Number);
  const [yb, mb, db] = isoB.split("-").map(Number);
  const a = new Date(ya, ma - 1, da);
  const b = new Date(yb, mb - 1, db);
  return Math.round((b - a) / 86400000);
}

export function monthsBetween(isoA, isoB) {
  const [ya, ma] = isoA.split("-").map(Number);
  const [yb, mb] = isoB.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

// Add days to a date (for due date + grace period)
export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isOverdue(dueISO, graceDays, today = todayISO()) {
  return daysBetween(dueISO, today) > graceDays;
}

// Month label like "Apr 2026" from an ISO date
export function monthLabel(iso) {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function avatarColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}