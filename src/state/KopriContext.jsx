import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadState, saveState, clearState, subscribeToStorageChanges, getDataHash } from "../lib/storage.js";
import { rootReducer, seedRoot, activeBook, dataHash } from "./kopriStore.js";

const KopriContext = createContext(null);

function init() {
  const stored = loadState();
  return stored || seedRoot();
}

// ---------------------------------------------------------------------------
export function KopriProvider({ children }) {
  const [root, dispatch] = useReducer(rootReducer, undefined, init);
  const [ready, setReady] = useState(false);
  const rootRef = useRef(root);

  // The active Kopri's book merged with global settings.
  // Every page reads `state.members`, `state.rules`, `state.yearEnds`,
  // `state.settings.theme`, … — so they keep working unchanged across Kopris.
  const state = useMemo(() => {
    const book = activeBook(root);
    if (!book) return null;
    return { ...book, settings: root.settings };
  }, [root]);

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
        dispatch({ type: "LOAD_FROM_TAB", root: otherRoot });
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
      kopris,
      activeKopriId: root.activeKopriId,
      dataHash: dataHash(root),

      // --- Tenant management ---
      addKopri: (name, template = "empty") => dispatch({ type: "ADD_KOPRI", name, template }),
      switchKopri: (id) => dispatch({ type: "SET_ACTIVE_KOPRI", id }),
      renameKopri: (id, name) => dispatch({ type: "RENAME_KOPRI", id, name }),
      deleteKopri: (id) => dispatch({ type: "DELETE_KOPRI", id }),
      resetKopriDemo: (id) => dispatch({ type: "RESET_KOPRI_DEMO", id: id ?? root.activeKopriId }),
      wipeAll: () => {
        clearState();
        dispatch({ type: "WIPE_ALL" });
      },

      // --- Active-book helpers (route to the active Kopri automatically) ---
      resetDemo: () => dispatch({ type: "RESET_KOPRI_DEMO", id: root.activeKopriId }),
      clearAll: () => {
        clearState();
        dispatch({ type: "WIPE_ALL" });
      },
      addMember: (member, openingContribution) => dispatch({ type: "ADD_MEMBER", member, openingContribution }),
      updateMember: (id, patch) => dispatch({ type: "UPDATE_MEMBER", id, patch }),
      deleteMember: (id) => dispatch({ type: "DELETE_MEMBER", id }),
      addLoan: (loan) => dispatch({ type: "ADD_LOAN", loan }),
      updateLoan: (id, patch) => dispatch({ type: "UPDATE_LOAN", id, patch }),
      addEvent: (event) => dispatch({ type: "ADD_EVENT", event }),
      deleteEvent: (id) => dispatch({ type: "DELETE_EVENT", id }),
      updateEvent: (id, patch) => dispatch({ type: "UPDATE_EVENT", id, patch }),
      updateRules: (rules) => dispatch({ type: "UPDATE_RULES", rules }),
      saveYearEnd: (yearEnd) => dispatch({ type: "SAVE_YEAR_END", yearEnd }),
      settleYearEnd: (year, date) => dispatch({ type: "SETTLE_YEAR_END", year, date }),
      setTheme: (theme) => dispatch({ type: "SET_THEME", theme }),
    }),
    [state, root, kopris]
  );

  return <KopriContext.Provider value={value}>{children}</KopriContext.Provider>;
}

export function useKopri() {
  const ctx = useContext(KopriContext);
  if (!ctx) throw new Error("useKopri must be used inside <KopriProvider>");
  return ctx;
}