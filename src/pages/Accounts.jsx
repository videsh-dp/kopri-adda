import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKopri } from "../state/KopriContext.jsx";
import { financialYearBounds, financialYearOf } from "../lib/calculations.js";
import { buildAccountTree, collectEntries, findNode, nodePath, eventLabel } from "../lib/accountTree.js";
import { formatINR, formatDate, todayISO } from "../lib/format.js";
import { Card, StatCard, Modal, Button, EmptyState } from "../components/ui.jsx";

const PAGE = 40;

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function TreeRow({ n, depth, expanded, toggle, onOpen, color }) {
  const hasKids = n.children.length > 0;
  const open = expanded.has(n.id);
  return (
    <>
      <div
        className={`acct-row depth-${Math.min(depth, 4)} ${n.muted ? "muted-row" : ""} ${depth === 0 ? "acct-group" : ""}`}
        style={{ "--indent": `${depth * 16}px`, "--group-color": color }}
        data-node={n.id}
      >
        {hasKids ? (
          <button className="acct-toggle" onClick={() => toggle(n.id)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${n.label}`}>
            <Chevron open={open} />
          </button>
        ) : (
          <span className="acct-toggle acct-leaf" aria-hidden="true">
            •
          </span>
        )}
        <button className="acct-main" onClick={() => onOpen(n.id)}>
          <span className="acct-label">
            {n.label}
            {hasKids && depth > 0 && <span className="acct-count">{n.children.length}</span>}
          </span>
          {n.sub && <span className="acct-sub">{n.sub}</span>}
        </button>
        <button className={`acct-amount ${n.tone === "red" ? "neg" : ""} ${Math.abs(n.amount) < 0.005 ? "zero" : ""}`} onClick={() => onOpen(n.id)} tabIndex={-1}>
          {formatINR(n.amount)}
        </button>
      </div>
      {hasKids && open && n.children.map((c) => <TreeRow key={c.id} n={c} depth={depth + 1} expanded={expanded} toggle={toggle} onOpen={onOpen} color={color} />)}
    </>
  );
}

function AccountDetail({ groups, id, onOpen, onClose, periodLabel }) {
  const [limit, setLimit] = useState(PAGE);
  const n = id ? findNode(groups, id) : null;
  const path = id ? nodePath(groups, id) || [] : [];
  const entries = useMemo(() => (n ? collectEntries(n) : []), [n]);
  if (!n) return null;
  const top = path[0];
  const isFlow = top?.kind === "flow";
  const shown = entries.slice(0, limit);

  return (
    <Modal open onClose={onClose} title={n.label} wide>
      <div className="acct-detail">
        {path.length > 1 && (
          <div className="acct-crumbs">
            {path.slice(0, -1).map((p) => (
              <button key={p.id} onClick={() => onOpen(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="acct-hero" style={{ "--group-color": top?.color }}>
          <div className={`acct-hero-amount ${n.tone === "red" ? "neg" : ""}`}>{formatINR(n.amount)}</div>
          <div className="small muted">
            {n.sub || top?.sub}
            {isFlow ? ` · ${periodLabel}` : " · as of today"}
          </div>
        </div>

        {n.note && <div className="small muted">{n.note}</div>}

        {n.facts?.length > 0 && (
          <div className="acct-facts">
            {n.facts.map(([k, v]) => (
              <div key={k} className="spread">
                <span className="muted">{k}</span>
                <b className={`num ${v < 0 ? "amount-neg" : ""}`}>{formatINR(v)}</b>
              </div>
            ))}
          </div>
        )}

        {n.children.length > 0 && (
          <div>
            <div className="acct-section-title">Sub-accounts</div>
            <div className="acct-kids">
              {n.children.map((c) => (
                <button key={c.id} className={`acct-kid ${c.muted ? "muted-row" : ""}`} onClick={() => onOpen(c.id)}>
                  <span className="acct-kid-main">
                    <span className="acct-label">{c.label}</span>
                    {c.sub && <span className="acct-sub">{c.sub}</span>}
                  </span>
                  <span className={`num acct-kid-amt ${c.tone === "red" ? "neg" : ""}`}>{formatINR(c.amount)}</span>
                  {Math.abs(n.amount) > 0.005 && (
                    <span className="acct-share" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(100, (c.amount / n.amount) * 100))}%` }} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="acct-section-title">
            Transactions <span className="faint">({entries.length})</span>
          </div>
          {entries.length === 0 ? (
            <div className="small faint">No transactions{isFlow ? ` in ${periodLabel.toLowerCase()}` : ""}.</div>
          ) : (
            <div className="acct-txns">
              {shown.map(({ event: e, effect }) => (
                <div key={e.id} className="acct-txn">
                  <div className="acct-txn-main">
                    <div className="acct-txn-type">{eventLabel(e.type)}</div>
                    <div className="small faint">
                      {formatDate(e.date)}
                      {e.description ? ` · ${e.description}` : ""}
                    </div>
                  </div>
                  <div className={`num acct-txn-amt ${effect > 0 ? "amount-pos" : effect < 0 ? "amount-neg" : "amount-mut"}`}>
                    {effect > 0 ? "+" : effect < 0 ? "−" : ""}
                    {formatINR(effect === 0 ? e.amount : Math.abs(effect))}
                  </div>
                </div>
              ))}
              {entries.length > limit && (
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more ({entries.length - limit} left)
                </Button>
              )}
            </div>
          )}
        </div>

        {n.link && (
          <Link to={n.link.to} className="btn btn-primary" onClick={onClose} style={{ alignSelf: "flex-start" }}>
            {n.link.label} →
          </Link>
        )}
      </div>
    </Modal>
  );
}

export default function Accounts() {
  const { state } = useKopri();
  const fyStart = state.rules.financialYearStart || "04-01";
  const fy = financialYearOf(todayISO(), fyStart);
  const { yearStart, yearEndDate } = financialYearBounds(fy, fyStart);
  const [periodKey, setPeriodKey] = useState("fy");
  const period = periodKey === "fy" ? { from: yearStart, to: yearEndDate } : null;
  const fyLabel = `FY ${fy}-${String(fy + 1).slice(2)}`;
  const periodLabel = periodKey === "fy" ? fyLabel : "All time";

  const tree = useMemo(() => buildAccountTree(state, period), [state, periodKey, yearStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const [expanded, setExpanded] = useState(() => new Set(["assets", "funds", "income", "expenses", "shared"]));
  const [selected, setSelected] = useState(null);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allIds = useMemo(() => {
    const ids = [];
    const walk = (n) => {
      if (n.children.length) ids.push(n.id);
      n.children.forEach(walk);
    };
    tree.groups.forEach(walk);
    return ids;
  }, [tree]);

  const { totals } = tree;
  const empty = state.events.length === 0 && state.members.length === 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-sub">Every account as a tree. Tap a line to see its details and transactions.</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Total assets" value={formatINR(totals.assets)} foot="Cash, bank and loans out" color="var(--primary)" />
        <StatCard label="Owed to members" value={formatINR(totals.memberBalances)} foot="Deposits plus profit owed" color="var(--violet)" />
        <StatCard label="Kopri surplus" value={formatINR(totals.surplus)} foot="Profit not yet shared out" color="var(--teal)" />
        <StatCard label={`Net profit · ${periodLabel}`} value={formatINR(totals.netProfit)} foot={`${formatINR(totals.income)} income − ${formatINR(totals.expenses)} expenses`} color="var(--green)" />
      </div>

      <div className="toolbar acct-toolbar" style={{ marginTop: 18 }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
          {[
            ["fy", `This year (${fyLabel})`],
            ["all", "All time"],
          ].map(([k, label]) => (
            <button key={k} className={`tab ${periodKey === k ? "active" : ""}`} onClick={() => setPeriodKey(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="grow" />
        <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(allIds))}>
          Expand all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
          Collapse all
        </Button>
      </div>

      <Card pad={false}>
        {empty ? (
          <EmptyState icon="🌳" title="No accounts yet" sub="Add members and record deposits or loans to see the account tree." />
        ) : (
          <div className="acct-tree" role="tree">
            {tree.groups.map((g) => (
              <TreeRow key={g.id} n={g} depth={0} expanded={expanded} toggle={toggle} onOpen={setSelected} color={g.color} />
            ))}
          </div>
        )}
      </Card>

      <div className="small faint" style={{ marginTop: 10 }}>
        Assets {formatINR(totals.assets)} = owed to members {formatINR(totals.memberBalances)} + kopri surplus {formatINR(totals.surplus)}. Assets and
        members' funds are as of today; income, expenses and profit shared are for {periodKey === "fy" ? fyLabel : "all time"}.
      </div>

      {selected && (
        <AccountDetail key={selected} groups={tree.groups} id={selected} onOpen={setSelected} onClose={() => setSelected(null)} periodLabel={periodLabel} />
      )}
    </div>
  );
}
