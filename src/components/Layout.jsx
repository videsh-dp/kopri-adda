import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
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
  IconMenu,
  IconRefresh,
  IconCalendar,
} from "./Icons.jsx";

const NAV = [
  { section: "Overview", items: [{ to: "/", label: "Dashboard", icon: IconDashboard, end: true }] },
  {
    section: "People & Loans",
    items: [
      { to: "/members", label: "Members", icon: IconUsers },
      { to: "/deposits", label: "Deposits", icon: IconCalendar },
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

const ADMIN_NAV = {
  section: "Admin",
  items: [{ to: "/managers", label: "Managers", icon: IconUsers }],
};

// The four pages used most on a phone sit in the bottom bar; everything else is under "More".
const PRIMARY_PATHS = ["/", "/members", "/deposits", "/loans"];

function IconLogout(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

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
  const { state, isAdmin, manager, logout } = useKopri();
  const location = useLocation();
  const nav = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
  const allItems = nav.flatMap((s) => s.items);
  const primary = PRIMARY_PATHS.map((to) => allItems.find((i) => i.to === to));
  const whoLabel = isAdmin ? "Super admin" : manager?.name;
  const rules = state.rules || {};
  const activePage = allItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  const kopriName = state?.name || rules.kopriName || "Kopri Manager";

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const toggleMobileMenu = () => setShowMobileMenu((v) => !v);
  const closeMobileMenu = () => setShowMobileMenu(false);

  // Scroll-to-top button: show when scrolled down
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

        {nav.map((section) => (
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
          <div style={{ fontWeight: 650, color: "var(--text-soft)" }}>{whoLabel}</div>
          <div>FY starts {formatDate(`${todayISO().slice(0, 4)}-${rules.financialYearStart || "04-01"}`).slice(0, -5)}</div>
          <div style={{ marginTop: 2 }}>Stored locally in this browser</div>
          <button className="btn btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={logout}>
            <IconLogout /> Log out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Menu" aria-expanded={showMobileMenu}>
            <IconMenu />
          </button>
          <h1>{activePage?.label || "Kopri Manager"}</h1>
          {!isAdmin && <span className="topbar-kopri">{kopriName}</span>}
          <span className="topbar-meta">{formatDate(todayISO())}</span>
          <div className="topbar-spacer" />
          {isAdmin && <KopriSwitcher />}
          <ThemeToggle />
        </header>
        <main className="content">
          <Outlet />
        </main>

        <button
          className={`scroll-top ${showScrollTop ? "visible" : ""}`}
          onClick={scrollToTop}
          aria-label="Scroll to top"
        >
          <IconRefresh />
        </button>
      </div>

      {showMobileMenu && <div className="mobile-menu-overlay" onClick={closeMobileMenu} />}
      {showMobileMenu && (
        <div className="more-sheet" role="dialog" aria-label="All pages">
          <div className="more-sheet-head">
            <div>
              <div style={{ fontWeight: 700 }}>{whoLabel}</div>
              <div className="small faint">{kopriName}</div>
            </div>
            <button className="btn btn-sm" onClick={() => { closeMobileMenu(); logout(); }}>
              <IconLogout /> Log out
            </button>
          </div>
          {nav.map((section) => (
            <div key={section.section}>
              <div className="nav-section-label" style={{ padding: "10px 4px 6px" }}>{section.section}</div>
              <div className="more-grid">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => "more-item" + (isActive ? " active" : "")}
                    onClick={closeMobileMenu}
                  >
                    <item.icon width={20} height={20} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <nav className="mobile-nav">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={closeMobileMenu}
          >
            <item.icon width={20} height={20} />
            {item.label}
          </NavLink>
        ))}
        <button type="button" className={showMobileMenu || !primary.includes(activePage) ? "active" : ""} onClick={toggleMobileMenu}>
          <IconMenu width={20} height={20} />
          More
        </button>
      </nav>
    </div>
  );
}
