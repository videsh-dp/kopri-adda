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
          <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Menu">
            <IconMenu />
          </button>
          <h1>{activePage?.label || "Kopri Manager"}</h1>
          <span className="topbar-meta">{formatDate(todayISO())}</span>
          <div className="topbar-spacer" />
          <KopriSwitcher />
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

      {showMobileMenu && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
      )}
      <nav className={"mobile-nav" + (showMobileMenu ? " open" : "")}>
        {MOBILE.map((item) => (
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
      </nav>
    </div>
  );
}