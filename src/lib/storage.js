// ---------------------------------------------------------------------------
// Persistence layer — localStorage for full root state + a session cookie.
//
// v1 stored a single Kopri under  kopri:state:v1
// v2 stores multiple Kopris ("tenants") under kopri:state:v2 and migrates v1.
//
// Cookies have a ~4KB size limit, so we never stuff the whole dataset into
// one. The cookie carries a small session marker (app version, last saved
// timestamp, a hash of the data) — the pattern we'll replace with a real
// auth/session token once a server + DB are introduced.
// ---------------------------------------------------------------------------

import { ROOT_VERSION, migrateRoot, dataHash } from "../state/kopriStore.js";

const LS_KEY = "kopri:state:v2";
const LEGACY_KEY = "kopri:state:v1";
const COOKIE_NAME = "kopri_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function loadState() {
  // Try the current (v2, root) key first
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const root = migrateRoot(JSON.parse(raw));
      if (root) return root;
    }
  } catch (err) {
    console.warn("Kopri: failed to read localStorage (v2)", err);
  }
  // Migrate legacy single-Kopri state (v1) if present
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const root = migrateRoot(JSON.parse(raw));
      if (root) {
        localStorage.setItem(LS_KEY, JSON.stringify(root));
        localStorage.removeItem(LEGACY_KEY);
        writeSessionCookie(root);
        return root;
      }
    }
  } catch (err) {
    console.warn("Kopri: failed to migrate legacy state", err);
  }
  return null;
}

export function saveState(root) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(root));
    writeSessionCookie(root);
  } catch (err) {
    console.warn("Kopri: failed to write localStorage", err);
  }
}

export function clearState() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LEGACY_KEY);
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`;
  } catch (err) {
    console.warn("Kopri: failed to clear storage", err);
  }
}

// --- Session cookie ---------------------------------------------------------

function writeSessionCookie(root) {
  const payload = {
    app: "kopri-manager",
    version: ROOT_VERSION,
    savedAt: new Date().toISOString(),
    kopris: root.kopris.length,
    dataHash: dataHash(root),
  };
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; Max-Age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch (err) {
    console.warn("Kopri: failed to write session cookie", err);
  }
}

export function readSessionCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function getDataHash(root) {
  return dataHash(root);
}

// Listen for changes from other tabs (same-origin) and reload root state.
export function subscribeToStorageChanges(callback) {
  const handler = (e) => {
    if (e.key === LS_KEY && e.newValue) {
      try {
        callback(migrateRoot(JSON.parse(e.newValue)));
      } catch {
        /* ignore malformed cross-tab writes */
      }
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}