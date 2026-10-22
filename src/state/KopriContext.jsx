import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadState, saveState, subscribeToStorageChanges, getDataHash } from "../lib/storage.js";
import { rootReducer, seedRoot, dataHash, ROOT_ACTIONS } from "./kopriStore.js";
import { authenticate, loadSession, saveSession } from "../lib/auth.js";

const KopriContext = createContext(null);

function init() {
  const stored = loadState();
  return stored || seedRoot();
}

// ---------------------------------------------------------------------------
export function KopriProvider({ children }) {
  const [root, rawDispatch] = useReducer(rootReducer, undefined, init);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(loadSession);
  const rootRef = useRef(root);

  // A manager session is valid only while that manager still exists.
  const manager = session?.role === "manager" ? (root.managers || []).find((m) => m.id === session.managerId) : null;
  const role = session?.role === "admin" ? "admin" : manager ? "manager" : null;
  const managerKopriId = manager?.kopriId;

  // A manager only ever works on their own Kopri: kopri-scoped actions are
  // pinned to it, whatever the shared "active Kopri" currently is.
  const dispatch = useCallback(
    (action) => rawDispatch(managerKopriId && !ROOT_ACTIONS.has(action.type) ? { ...action, kopriId: managerKopriId } : action),
    [managerKopriId]
  );

  const login = useCallback((username, password) => {
    const next = authenticate(rootRef.current, username, password);
    if (!next) return false;
    saveSession(next);
    setSession(next);
    return true;
  }, []);
  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  // The active Kopri's book merged with global settings.
  // Every page reads `state.members`, `state.rules`, `state.yearEnds`,
  // `state.settings.theme`, … — so they keep working unchanged across Kopris.
  const state = useMemo(() => {
    const id = managerKopriId || root.activeKopriId;
    const book = root.kopris.find((k) => k.id === id) || root.kopris[0];
    if (!book) return null;
    return { ...book, settings: root.settings };
  }, [root, managerKopriId]);

  // Persist on every change (localStorage + session cookie)
  useEffect(() => {
    rootRef.current = root;
    try {
      saveState(root);
    } catch {
      /* storage may be unavailable (private mode) — app still works in-memory */
    }
  }, [root]);

  // Cross-tab sync
  useEffect(() => {
    const unsub = subscribeToStorageChanges((otherRoot) => {
      if (otherRoot && getDataHash(otherRoot) !== getDataHash(rootRef.current)) {
        rawDispatch({ type: "LOAD_FROM_TAB", root: otherRoot });
      }
    });
    setReady(true);
    return unsub;
  }, []);

  // Apply theme class on <html>
  useEffect(() => {
    const theme = root.settings?.theme || "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [root.settings?.theme]);

  // Kopri list for the switcher UI
  const kopris = useMemo(
    () =>
      root.kopris.map((k) => ({
        id: k.id,
        name: k.name,
        members: k.members.length,
        loans: k.loans.length,
        events: k.events.length,
        active: k.id === root.activeKopriId,
      })),
    [root]
  );

  const value = useMemo(
    () => ({
      state,
      root,
      dispatch,
      ready,
      role,
      isAdmin: role === "admin",
      manager,
      login,
      logout,
      kopris,
      activeKopriId: state?.id,
      dataHash: dataHash(root),

      // --- Tenant management ---
      addKopri: (name, template = "empty") => dispatch({ type: "ADD_KOPRI", name, template }),
      switchKopri: (id) => dispatch({ type: "SET_ACTIVE_KOPRI", id }),
      renameKopri: (id, name) => dispatch({ type: "RENAME_KOPRI", id, name }),
      deleteKopri: (id) => dispatch({ type: "DELETE_KOPRI", id }),
      resetKopriDemo: (id) => dispatch({ type: "RESET_KOPRI_DEMO", id: id ?? root.activeKopriId }),
      clearKopri: (id) => dispatch({ type: "RESET_KOPRI_EMPTY", id: id ?? state?.id }),
      addManager: (m) => dispatch({ type: "ADD_MANAGER", ...m }),
      updateManager: (id, patch) => dispatch({ type: "UPDATE_MANAGER", id, patch }),
      deleteManager: (id, deleteKopri = true) => dispatch({ type: "DELETE_MANAGER", id, deleteKopri }),
      importRoot: (data) => dispatch({ type: "IMPORT_ROOT", root: data }),
      wipeAll: () => dispatch({ type: "WIPE_ALL" }),

      // --- Active-book helpers (route to the active Kopri automatically) ---
      resetDemo: () => dispatch({ type: "RESET_KOPRI_DEMO", id: state?.id }),
      clearAll: () => dispatch({ type: "WIPE_ALL" }),
      addMember: (member, openingContribution) => dispatch({ type: "ADD_MEMBER", member, openingContribution }),
      updateMember: (id, patch) => dispatch({ type: "UPDATE_MEMBER", id, patch }),
      deleteMember: (id) => dispatch({ type: "DELETE_MEMBER", id }),
      addLoan: (loan, disbursement) => dispatch({ type: "ADD_LOAN", loan, disbursement }),
      updateLoan: (id, patch) => dispatch({ type: "UPDATE_LOAN", id, patch }),
      addEvent: (event) => dispatch({ type: "ADD_EVENT", event }),
      deleteEvent: (id) => dispatch({ type: "DELETE_EVENT", id }),
      updateEvent: (id, patch) => dispatch({ type: "UPDATE_EVENT", id, patch }),
      updateRules: (rules) => dispatch({ type: "UPDATE_RULES", rules }),
      saveYearEnd: (yearEnd) => dispatch({ type: "SAVE_YEAR_END", yearEnd }),
      settleYearEnd: (year, date) => dispatch({ type: "SETTLE_YEAR_END", year, date }),
      setTheme: (theme) => dispatch({ type: "SET_THEME", theme }),
    }),
    [state, root, kopris, role, manager, dispatch, login, logout]
  );

  return <KopriContext.Provider value={value}>{children}</KopriContext.Provider>;
}

export function useKopri() {
  const ctx = useContext(KopriContext);
  if (!ctx) throw new Error("useKopri must be used inside <KopriProvider>");
  return ctx;
}