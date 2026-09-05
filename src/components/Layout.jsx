import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { formatDate, todayISO } from "../lib/format.js";
import KopriSwitcher from "./KopriSwitcher.jsx";
import {
  IconDashboard,
  IconUsers,
  IconLoan,
  IconLedger,
  IconBank,
  IconYearEnd,
  IconReport,
  IconRules,
  IconSun,
  IconMoon,
} from "./Icons.jsx";

const NAV = [
  { section: "Overview", items: [{ to: "/", label: "Dashboard", icon: IconDashboard, end: true }] },
  {
    section: "People & Loans",
    items: [
      { to: "/members", label: "Members", icon: IconUsers },
      { to: "/loans", label: "Loans", icon: IconLoan },
    ],
  },
  {
    section: "Money",
    items: [
      { to: "/ledger", label: "Ledger", icon: IconLedger },
      { to: "/cash-bank", label: "Cash & Bank", icon: IconBank },
      { to: "/year-end", label: "Year End", icon: IconYearEnd },
    ],
  },
  {
    section: "Setup",
    items: [
      { to: "/reports", label: "Reports", icon: IconReport },
      { to: "/rules", label: "Kopri Rules", icon: IconRules },
    ],
  },
];

const MOBILE = NAV.flatMap((s) => s.items);

function ThemeToggle() {
  const { state, setTheme } = useKopri();
  const dark = state.settings?.theme === "dark";
  return (
    <button
      className="icon-btn"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

export default function Layout() {
  const { state } = useKopri();
  const location = useLocation();
  const rules = state.rules || {};
  const activePage = MOBILE.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  const kopriName = state?.name || rules.kopriName || "Kopri Manager";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">K</div>
          <div>
          <div className="brand-name">{kopriName}</div>
          <div className="brand-sub">Community lending pool</div>
          </div>
        </div>

        {NAV.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div>FY starts {formatDate(`${todayISO().slice(0, 4)}-${rules.financialYearStart || "04-01"}`).slice(0, -5)}</div>
          <div style={{ marginTop: 2 }}>Stored locally in this browser</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{activePage?.label || "Kopri Manager"}</h1>
          <span className="topbar-meta">{formatDate(todayISO())}</span>
          <div className="topbar-spacer" />
          <KopriSwitcher />
          <ThemeToggle />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav">
        {MOBILE.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
            <item.icon width={20} height={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}