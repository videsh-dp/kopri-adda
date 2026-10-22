// ---------------------------------------------------------------------------
// Login — frontend-only. The super admin is fixed; managers are stored in the
// app state (browser localStorage) and created by the super admin. This only
// keeps honest users in their own Kopri; it is not real security (anyone with
// the browser's devtools can read the data). Swap for server auth with a backend.
// ---------------------------------------------------------------------------

export const SUPERADMIN = { username: "shediv", password: "shediv" };

const SESSION_KEY = "kopri:session:v1";

// Returns { role: "admin" } | { role: "manager", managerId } | null
export function authenticate(root, username, password) {
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  if (!u || !p) return null;
  if (u === SUPERADMIN.username && p === SUPERADMIN.password) return { role: "admin" };
  const m = (root.managers || []).find((x) => x.username.toLowerCase() === u && x.password === p);
  return m ? { role: "manager", managerId: m.id } : null;
}

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return s && (s.role === "admin" || (s.role === "manager" && s.managerId)) ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — session lasts until reload */
  }
}
