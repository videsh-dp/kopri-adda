import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { formatDate, todayISO } from "../lib/format.js";
import { useInstallApp } from "../lib/pwa.js";
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
  IconCalendar,
  IconMore,
  IconBack,
  IconArrowUp,
  IconInstall,
  IconClose,
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

const ALL = NAV.flatMap((s) => s.items);
// Phone bottom tab bar: the four daily screens, everything else under "More".
const TABS = [
  { to: "/", label: "Home", icon: IconDashboard, end: true },
  { to: "/members", label: "Members", icon: IconUsers },
  { to: "/deposits", label: "Deposits", icon: IconCalendar },
  { to: "/loans", label: "Loans", icon: IconLoan },
];
const MORE = ALL.filter((i) => !TABS.some((t) => t.to === i.to));

const matches = (item, path) => (item.end ? path === item.to : path === item.to || path.startsWith(item.to + "/"));

function ThemeToggle() {
  const { state, setTheme } = useKopri();
  const dark = state.settings?.theme === "dark";
  return (
    <button
      className="icon-btn"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function InstallHint({ mode, install, onDone }) {
  if (mode === "prompt") {
    return (
      <button className="btn btn-primary btn-sm" onClick={async () => (await install()) && onDone?.()}>
        Install
      </button>
    );
  }
  if (mode === "ios") {
    return <span className="small">Tap Share, then “Add to Home Screen”.</span>;
  }
  return null;
}

function MoreSheet({ open, onClose }) {
  const { state, setTheme } = useKopri();
  const location = useLocation();
  const { mode, install } = useInstallApp();
  const dark = state.settings?.theme === "dark";
  const rules = state.rules || {};

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="More">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">More</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="sheet-list">
          {MORE.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`sheet-row ${matches(item, location.pathname) ? "active" : ""}`}
              onClick={onClose}
            >
              <span className="sheet-row-icon">
                <item.icon width={20} height={20} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="sheet-list">
          <button className="sheet-row" onClick={() => setTheme(dark ? "light" : "dark")}>
            <span className="sheet-row-icon">{dark ? <IconSun width={20} height={20} /> : <IconMoon width={20} height={20} />}</span>
            {dark ? "Light mode" : "Dark mode"}
          </button>
          {(mode === "prompt" || mode === "ios") && (
            <div className="sheet-row static">
              <span className="sheet-row-icon">
                <IconInstall width={20} height={20} />
              </span>
              <span className="grow">
                Install as an app
                {mode === "ios" && <span className="sheet-row-hint">Tap Share, then “Add to Home Screen”.</span>}
              </span>
              {mode === "prompt" && <InstallHint mode={mode} install={install} />}
            </div>
          )}
        </div>
        <div className="sheet-foot">
          FY starts {formatDate(`${todayISO().slice(0, 4)}-${rules.financialYearStart || "04-01"}`).slice(0, -5)} · data stored on this device
        </div>
      </div>
    </>
  );
}

function InstallBanner() {
  const { mode, install } = useInstallApp();
  const KEY = "kopri.installBannerDismissed";
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed || (mode !== "prompt" && mode !== "ios")) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="install-banner">
      <div className="install-banner-icon">
        <IconInstall width={20} height={20} />
      </div>
      <div className="grow">
        <div style={{ fontWeight: 700 }}>Use Kopri like an app</div>
        <div className="small">
          {mode === "ios" ? "Tap Share, then “Add to Home Screen”." : "Add it to your home screen. It works offline too."}
        </div>
      </div>
      {mode === "prompt" && (
        <button className="btn btn-primary btn-sm" onClick={async () => (await install()) && dismiss()}>
          Install
        </button>
      )}
      <button className="icon-btn" onClick={dismiss} aria-label="Dismiss">
        <IconClose />
      </button>
    </div>
  );
}

export default function Layout() {
  const { state } = useKopri();
  const location = useLocation();
  const navigate = useNavigate();
  const rules = state.rules || {};
  const path = location.pathname;
  const activePage = ALL.find((i) => matches(i, path));
  const kopriName = state?.name || rules.kopriName || "Kopri Manager";
  const { mode: installMode, install } = useInstallApp();

  // Detail screens (/loans/:id, /members/:id) get a back arrow in the app bar.
  const isDetail = /^\/(loans|members)\/[^/]+/.test(path);
  const parent = isDetail ? "/" + path.split("/")[1] : null;
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(parent);
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = MORE.some((i) => matches(i, path));

  // Close the sheet and jump to the top when the route changes, like a native app.
  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [path]);

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
          {installMode === "prompt" && (
            <button className="btn btn-sm" style={{ marginBottom: 10, width: "100%" }} onClick={install}>
              <IconInstall /> Install app
            </button>
          )}
          <div>FY starts {formatDate(`${todayISO().slice(0, 4)}-${rules.financialYearStart || "04-01"}`).slice(0, -5)}</div>
          <div style={{ marginTop: 2 }}>Stored locally in this browser</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {isDetail && (
            <button className="icon-btn topbar-back" onClick={goBack} aria-label="Back">
              <IconBack width={20} height={20} />
            </button>
          )}
          <h1>{activePage?.label || "Kopri Manager"}</h1>
          <span className="topbar-meta">{formatDate(todayISO())}</span>
          <div className="topbar-spacer" />
          <KopriSwitcher />
          <span className="topbar-theme">
            <ThemeToggle />
          </span>
        </header>
        <main className="content">
          <InstallBanner />
          <Outlet />
        </main>

        <button
          className={`scroll-top ${showScrollTop ? "visible" : ""}`}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
        >
          <IconArrowUp />
        </button>
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab-item ${isActive ? "active" : ""}`}>
            <span className="tab-pill">
              <item.icon width={22} height={22} />
            </span>
            <span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
        <button className={`tab-item ${moreActive || moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          <span className="tab-pill">
            <IconMore width={22} height={22} />
          </span>
          <span className="tab-label">More</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={closeMore} />
    </div>
  );
}
