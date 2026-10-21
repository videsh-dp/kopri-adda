# Kopri Manager

A web app for managing **multiple Kopris** (Goan community lending pools / *confres*): groups of members pool deposits, the pool lends the money out at interest, and at year-end every depositor gets their capital back plus a share of the profit earned.

Built as a **frontend-only prototype** — React + Vite, no server. All data is stored in the browser via **localStorage**, with a small **session cookie** tracking the saved state (the pattern we'll later swap for a real auth token when a backend is introduced). Each Kopri is an isolated "account" (a tenant), managed from a switcher in the top bar — the same shape a multi-tenant database will use.

## Run it

Requires **Node.js 18+** (tested on Node 22).

```bash
npm install     # first time only
npm run dev     # start the dev server
```

Open the printed URL — by default **http://localhost:5173** — in your browser.

The app opens pre-loaded with a **realistic demo Kopri** (7 members, 5 loans in various states — active, overdue, completed — plus contributions, repayments, expenses and last year's settlement). Everything is editable.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run test:store` | Unit tests for the multi-Kopri store (no browser) |
| `npm run test:manager` | End-to-end manager workflow in headless Chrome: rules, members, borrower, deposits and late fees, referred loan, every pay mode, year end with the manager's share (dev server running) |
| `npm run test:ui` | End-to-end UI test in headless Chrome (needs `CHROME_PATH` if Chrome isn't in the default location, and the dev server running) |

## Running multiple Kopris

- The **Kopri menu** (top bar, next to the theme toggle) lists every Kopri. Click one to switch — every page instantly shows that Kopri's data.
- **New Kopri…** starts another pool, empty or seeded with demo data.
- **Manage…** renames Kopris, resets one to demo data, or deletes one (the last Kopri can't be deleted).
- Rules, members, loans, ledger events and year-end records are fully **isolated per Kopri**. Global settings (like the theme) are shared.
- Existing single-Kopri data (from earlier versions of the app) is **migrated automatically** on first load.

## The Kopri lifecycle this app models

1. **Members deposit** money — monthly contributions and lump sums are recorded as ledger events.
2. The pool **lends** to borrowers at interest (default 2%/month, configurable).
3. Borrowers repay **principal + interest** on a schedule (monthly, quarterly, or lump sum; flat or reducing-balance interest).
4. **Year-end**: interest + penalties + other income − expenses − bad debt − reserve − manager charges = **distributable profit**, split among members (equal, by current capital, by average contribution, or contribution × time) and paid out as settlements.

## Features

- **Dashboard** — pool assets, outstanding loans, interest received/receivable, overdue alerts, 12-month cash-flow chart, loan portfolio breakdown, recent transactions
- **Members & borrowers** — profiles with role (depositor, borrower, or both), address, ID proof, occupation, nominee; borrowers don't have to be members; full statement (every event + running derived balance)
- **Monthly deposits** — configurable due day and deadline (e.g. due 1st, late after 15th), per-member monthly amount, optional late fee (fixed or %), a month-by-month grid that highlights unpaid months, and pay buttons per month
- **Loans** — every new loan must be referred by an active depositing member (rule can be switched off); create loans with full terms, a configurable late fee per loan, late fees shown as they build up, repayment schedule table, per-installment status (paid/due/overdue with grace periods), record repayments, guarantors & security
- **Ledger** — every financial event, filterable and searchable, with running pool balance
- **Cash & Bank** — cash vs bank balances, transfers between them
- **Year-End** — profit waterfall (income → expenses → reserve → manager charges → distributable), profit allocation per member, save allocation (creates ledger events), settle payouts (members' capital + profit, and the manager's share)
- **Reports** — outstanding loans, overdue, member capital, contributions, interest, full-ledger CSV export
- **Kopri Rules** — everything configurable: interest rate/method/collection, principal repayment, grace period, late rules, unpaid-interest handling, reserve & manager charge rates, profit distribution method
- **Multiple Kopris** — switch between isolated pools from the top bar; each keeps its own rules, members, loans and ledger
- Modern financial-dashboard UI: desktop sidebar + mobile bottom nav, light/dark theme, Indian ₹ formatting

## Architecture

```
src/
├── lib/
│   ├── constants.js        Domain enums + default Kopri rules
│   ├── calculations.js     ★ Pure financial engine (no React/DOM/storage)
│   ├── storage.js          localStorage + session-cookie persistence (v2 root, v1 migration)
│   ├── demoData.js         Demo seed (dates generated relative to today)
│   └── format.js           ₹/date/percent helpers
├── state/
│   ├── kopriStore.js       ★ Pure multi-Kopri root: tenants, isolation, migration
│   └── KopriContext.jsx    Provider: exposes the active Kopri as `state`
├── components/             Layout, Kopri switcher, icons, UI kit, form modals
└── pages/                  One file per screen (routes in App.jsx)
```

### Multi-Kopri state shape

```
root = {
  version: 2,
  settings: { theme },            // global
  activeKopriId,
  kopris: [ Book, Book, … ]       // one isolated Book per Kopri
}

Book = { id, name, rules, members, loans, events, yearEnds }
```

Every Kopri-scoped action routes to the active book by default; the switcher dispatches explicit `kopriId`s. `state` (what pages read) is simply the active Book merged with the global settings, so page code never needs to know which Kopri it's looking at.

### Event/ledger-driven design

Balances are **never stored** — they're always *derived* from the event stream. Every financial action is an immutable event in the ledger (`MEMBER_CONTRIBUTION`, `LOAN_DISBURSEMENT`, `PRINCIPAL_PAYMENT`, `INTEREST_PAYMENT`, `LATE_FEE`, `EXPENSE`, `PROFIT_ALLOCATION`, `MEMBER_SETTLEMENT`, …). A member's capital is the sum of their contribution/withdrawal events; a loan's outstanding amount is principal minus repayment events. This keeps the books auditable and prevents drift — every number on screen can be traced back to individual transactions.

### Why this matters for the backend

`lib/calculations.js`, `lib/constants.js` and `state/kopriStore.js` are 100% pure — they take state in, produce derived numbers out, touch nothing global. When we add Node.js + PostgreSQL:

1. The same calculation and store engines port over unchanged as the server-side service.
2. Events become the database's transaction table (append-only, like a real ledger).
3. Each Kopri becomes a row/tenant in the database — `kopris` becomes a `kopris` table and every Book collection becomes a table with `kopri_id`.
4. The reducer actions become REST endpoints 1:1 (`POST /kopris`, `POST /kopris/:id/members`, `POST /events`, `POST /year-ends/:year/settle`, …).
5. The session cookie becomes the auth token; localStorage state-loading becomes API calls.

## Storage

- **localStorage** — full root state under the `kopri:state:v2` key (multiple Kopris, each with rules, members, loans, events, year-end records).
- **Migration** — state saved by earlier single-Kopri versions (`kopri:state:v1`) is wrapped into the root shape automatically on first load; the v1 key is removed.
- **Session cookie** `kopri_session` — small metadata (app version, last-saved timestamp, data hash, Kopri count) kept under the ~4 KB cookie limit. Used to detect data changes across tabs.
- Changes sync automatically between open tabs.
- **Kopri Rules → Data & Storage** has *Reset this Kopri to demo data* and *Wipe ALL Kopris & start fresh* buttons.

## Roadmap

- [x] V1 prototype: UI + localStorage + cookie (this app)
- [x] Multiple Kopris: isolated pools with a switcher (this app)
- [ ] Node.js + PostgreSQL backend (events table, same calc + store engines server-side, `kopri_id` on every table)
- [ ] Auth (login/session via the cookie), multi-user roles (manager, member), Kopri invitations
- [ ] Loan custom schedules (per-installment editing), daily-outstanding interest precision
- [ ] Reminders/notifications for overdue installments
