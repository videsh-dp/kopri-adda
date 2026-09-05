// ---------------------------------------------------------------------------
// Kopri Store — pure root state for a multi-Kopri ("multi-tenant") app.
//
// Root shape:
//   {
//     version: 2,
//     settings: { theme },
//     activeKopriId,
//     kopris: [ Book, ... ]      // one Book per Kopri (future: one tenant schema)
//   }
//
// A Book is exactly what the single-Kopri app used to persist:
//   { id, name, rules, members, loans, events, yearEnds }
//
// No React here — pure functions, unit-testable, portable to the backend.
// ---------------------------------------------------------------------------

import { DEFAULT_RULES } from "../lib/constants.js";
import { uid, todayISO } from "../lib/format.js";
import { buildDemoState } from "../lib/demoData.js";

export const ROOT_VERSION = 2;
export const DEFAULT_KOPRI_NAME = "My Kopri";

// ---------------------------------------------------------------------------
// Book construction
// ---------------------------------------------------------------------------

export function createBook({ name = DEFAULT_KOPRI_NAME, template = "empty" } = {}) {
  const base = { id: uid("k"), name, createdAt: todayISO() };
  if (template === "demo") {
    const demo = buildDemoState(name);
    return { ...base, ...demo };
  }
  const rules = { ...DEFAULT_RULES, kopriName: name };
  return { ...base, rules, members: [], loans: [], events: [], yearEnds: [] };
}

export function demoBook(name = "Sunrise Kopri") {
  const demo = buildDemoState(name);
  return { id: uid("k"), name, createdAt: todayISO(), ...demo };
}

// ---------------------------------------------------------------------------
// Migration — legacy single-Kopri state → root shape
// ---------------------------------------------------------------------------

export function isRoot(raw) {
  return !!raw && typeof raw === "object" && Array.isArray(raw.kopris) && raw.kopris.length > 0;
}

export function migrateRoot(raw) {
  // Already root-shaped (v2)?
  if (isRoot(raw)) {
    return sanitizeRoot(raw);
  }
  // Legacy single-Kopri state (v1): { version, rules, members, loans, events, yearEnds, settings }
  if (raw && typeof raw === "object" && Array.isArray(raw.events)) {
    const name = raw.rules?.kopriName || raw.name || DEFAULT_KOPRI_NAME;
    const book = {
      id: raw.kopriId || uid("k"),
      name,
      rules: raw.rules || { ...DEFAULT_RULES, kopriName: name },
      members: raw.members || [],
      loans: raw.loans || [],
      events: raw.events || [],
      yearEnds: raw.yearEnds || [],
    };
    return sanitizeRoot({
      version: ROOT_VERSION,
      settings: raw.settings || { theme: "light" },
      activeKopriId: book.id,
      kopris: [book],
    });
  }
  return null;
}

export function sanitizeRoot(root) {
  if (!root || !Array.isArray(root.kopris) || root.kopris.length === 0) return null;
  const kopris = root.kopris.map((b) => ({ ...b, name: b.name || b.rules?.kopriName || DEFAULT_KOPRI_NAME }));
  const activeKopriId = kopris.some((k) => k.id === root.activeKopriId) ? root.activeKopriId : kopris[0].id;
  return {
    version: ROOT_VERSION,
    settings: root.settings || { theme: "light" },
    activeKopriId,
    kopris,
  };
}

export function seedRoot() {
  const book = demoBook();
  return sanitizeRoot({ version: ROOT_VERSION, settings: { theme: "light" }, activeKopriId: book.id, kopris: [book] });
}

// ---------------------------------------------------------------------------
// Book-level reducer — the old single-Kopri reducer, unchanged semantics
// ---------------------------------------------------------------------------

function bookReducer(book, action) {
  switch (action.type) {
    case "ADD_MEMBER": {
      const member = { id: uid("m"), joinedAt: todayISO(), status: "active", notes: "", phone: "", email: "", ...action.member };
      let events = book.events;
      const opening = Number(action.openingContribution) || 0;
      if (opening > 0) {
        events = [
          ...events,
          {
            id: uid("ev"),
            date: todayISO(),
            type: "MEMBER_CONTRIBUTION",
            memberId: member.id,
            amount: opening,
            account: "cash",
            reference: "",
            description: "Opening contribution",
            createdAt: new Date().toISOString(),
          },
        ];
      }
      return { ...book, members: [...book.members, member], events };
    }

    case "UPDATE_MEMBER":
      return { ...book, members: book.members.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)) };

    case "DELETE_MEMBER": {
      const hasHistory = book.events.some((e) => e.memberId === action.id);
      if (hasHistory) return book; // refuse: has ledger history — mark inactive instead
      return { ...book, members: book.members.filter((m) => m.id !== action.id) };
    }

    case "ADD_LOAN": {
      const loan = { id: uid("l"), status: "active", guarantorIds: [], security: "", notes: "", gracePeriodDays: 5, ...action.loan };
      return { ...book, loans: [...book.loans, loan] };
    }

    case "UPDATE_LOAN":
      return { ...book, loans: book.loans.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) };

    case "ADD_EVENT": {
      const ev = {
        id: uid("ev"),
        date: todayISO(),
        account: "cash",
        memberId: "",
        loanId: "",
        reference: "",
        description: "",
        createdAt: new Date().toISOString(),
        ...action.event,
      };
      return { ...book, events: [...book.events, ev] };
    }

    case "DELETE_EVENT":
      return { ...book, events: book.events.filter((e) => e.id !== action.id) };

    case "UPDATE_EVENT":
      return {
        ...book,
        events: book.events.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e
        ),
      };

    case "UPDATE_RULES":
      return { ...book, rules: { ...book.rules, ...action.rules } };

    case "SAVE_YEAR_END": {
      const y = action.yearEnd;
      const rest = (book.yearEnds || []).filter((x) => x.year !== y.year);
      const allocationEvents = y.allocations
        .filter((a) => a.profitShare > 0.5)
        .map((a) => ({
          id: uid("ev"),
          date: y.yearEndDate,
          type: "PROFIT_ALLOCATION",
          memberId: a.memberId,
          amount: a.profitShare,
          account: "cash",
          reference: "",
          description: `FY ${y.year} profit allocation`,
          createdAt: new Date().toISOString(),
        }));
      const withoutOld = book.events.filter((e) => !(e.type === "PROFIT_ALLOCATION" && e.date === y.yearEndDate));
      return { ...book, yearEnds: [...rest, { ...y, settled: false }], events: [...withoutOld, ...allocationEvents] };
    }

    case "SETTLE_YEAR_END": {
      const y = (book.yearEnds || []).find((x) => x.year === action.year);
      if (!y || y.settled) return book;
      const settlementEvents = y.allocations
        .filter((a) => a.settlement > 0.5)
        .map((a) => ({
          id: uid("ev"),
          date: action.date || todayISO(),
          type: "MEMBER_SETTLEMENT",
          memberId: a.memberId,
          amount: a.settlement,
          account: "cash",
          reference: "",
          description: `FY ${y.year} settlement payout (capital + profit)`,
          createdAt: new Date().toISOString(),
        }));
      return {
        ...book,
        yearEnds: book.yearEnds.map((x) => (x.year === action.year ? { ...x, settled: true, settledDate: action.date || todayISO() } : x)),
        events: [...book.events, ...settlementEvents],
      };
    }

    default:
      return book;
  }
}

// ---------------------------------------------------------------------------
// Root reducer
// ---------------------------------------------------------------------------

export function rootReducer(root, action) {
  switch (action.type) {
    // --- Tenant (Kopri) management ---

    case "ADD_KOPRI": {
      const book = createBook({ name: action.name, template: action.template });
      return {
        ...root,
        activeKopriId: book.id,
        kopris: [...root.kopris, book],
      };
    }

    case "SET_ACTIVE_KOPRI": {
      if (!root.kopris.some((k) => k.id === action.id)) return root;
      return { ...root, activeKopriId: action.id };
    }

    case "RENAME_KOPRI": {
      return {
        ...root,
        kopris: root.kopris.map((k) => (k.id === action.id ? { ...k, name: action.name, rules: { ...k.rules, kopriName: action.name } } : k)),
      };
    }

    case "DELETE_KOPRI": {
      if (root.kopris.length <= 1) return root; // always keep at least one Kopri
      const kopris = root.kopris.filter((k) => k.id !== action.id);
      const activeKopriId = root.activeKopriId === action.id ? kopris[0].id : root.activeKopriId;
      return { ...root, kopris, activeKopriId };
    }

    case "RESET_KOPRI_DEMO": {
      // Replace the contents of one Kopri with fresh demo data (keep id + name)
      return {
        ...root,
        kopris: root.kopris.map((k) => {
          if (k.id !== action.id) return k;
          const demo = buildDemoState(k.name);
          return { id: k.id, name: k.name, createdAt: k.createdAt, ...demo };
        }),
      };
    }

    case "WIPE_ALL": {
      const book = createBook({ name: DEFAULT_KOPRI_NAME, template: "empty" });
      return sanitizeRoot({ version: ROOT_VERSION, settings: root.settings, activeKopriId: book.id, kopris: [book] });
    }

    // --- Global settings ---

    case "SET_THEME":
      return { ...root, settings: { ...root.settings, theme: action.theme } };

    case "SET_SETTINGS":
      return { ...root, settings: { ...root.settings, ...action.patch } };

    case "LOAD_FROM_TAB": {
      // Cross-tab update: take incoming kopris but keep this tab's theme preference
      const incoming = sanitizeRoot(action.root);
      if (!incoming) return root;
      return { ...incoming, settings: { ...incoming.settings, theme: root.settings.theme } };
    }

    default: {
      // Kopri-scoped actions: resolve target book (action.kopriId ?? active) and apply
      const targetId = action.kopriId ?? root.activeKopriId;
      return {
        ...root,
        kopris: root.kopris.map((k) => (k.id === targetId ? bookReducer(k, action) : k)),
      };
    }
  }
}

export function activeBook(root) {
  return root?.kopris?.find((k) => k.id === root.activeKopriId) || root?.kopris?.[0] || null;
}

export function dataHash(root) {
  let h = 5381;
  const s = (root?.kopris || [])
    .map((k) => `${k.id}:${k.events.length}|${k.members.length}|${k.loans.length}|${(k.yearEnds || []).length}`)
    .join(",");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}