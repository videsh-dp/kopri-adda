import { useEffect, useRef, useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Button, Field, Modal, TextInput, Avatar } from "./ui.jsx";
import { IconPlus, IconCheck, IconEdit, IconTrash, IconRefresh } from "./Icons.jsx";

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------- Dropdown
export default function KopriSwitcher() {
  const { kopris, activeKopriId, switchKopri, state } = useKopri();
  const [open, setOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const ref = useRef(null);

  const active = kopris.find((k) => k.active) || kopris[0];
  const activeName = state?.name || active?.name || "Kopri";

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    // pointerdown, not mousedown: iPhone Safari sends no mouse events for
    // taps on plain content, so the menu would never close
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="kopri-switch" style={{ position: "relative" }}>
      <button
        className="btn kopri-switch-btn"
        onClick={() => setOpen((o) => !o)}
        title="Switch Kopri / manage accounts"
        style={{ maxWidth: 220 }}
      >
        <Avatar name={activeName} id={active?.id || "k"} size="sm" />
        <span className="kopri-switch-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{activeName}</span>
        <Chevron />
      </button>

      {open && (
        <div
          className="kopri-switch-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 280,
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
            Your Kopris ({kopris.length})
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", padding: "4px 6px" }}>
            {kopris.map((k) => (
              <button
                key={k.id}
                onClick={() => {
                  switchKopri(k.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 10,
                  border: "none",
                  background: k.active ? "var(--primary-soft)" : "transparent",
                  color: k.active ? "var(--primary-text)" : "var(--text)",
                  textAlign: "left",
                  fontWeight: k.active ? 700 : 550,
                }}
              >
                <Avatar name={k.name} id={k.id} size="sm" />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                  {k.members} members · {k.loans} loans
                </span>
                {k.active && <IconCheck width={14} height={14} />}
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: 8, display: "flex", gap: 6 }}>
            <Button
              size="sm"
              variant="primary"
              className="grow"
              onClick={() => {
                setShowNew(true);
                setOpen(false);
              }}
            >
              <IconPlus width={13} height={13} /> New Kopri
            </Button>
            <Button
              size="sm"
              className="grow"
              onClick={() => {
                setShowManage(true);
                setOpen(false);
              }}
            >
              Manage…
            </Button>
          </div>
        </div>
      )}

      <NewKopriModal open={showNew} onClose={() => setShowNew(false)} />
      <ManageKoprisModal open={showManage} onClose={() => setShowManage(false)} />
    </div>
  );
}

// ------------------------------------------------------------- New Kopri
function NewKopriModal({ open, onClose }) {
  const { addKopri } = useKopri();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("empty");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addKopri(trimmed, template);
    onClose();
    setName("");
    setTemplate("empty");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a new Kopri"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Create Kopri
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Kopri name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mapusa Welfare Kopri" autoFocus />
        </Field>
        <Field label="Start with">
          <div className="row" style={{ gap: 10 }}>
            <label className="row" style={{ gap: 7, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", flex: 1, background: template === "empty" ? "var(--primary-soft)" : "var(--bg-elev)" }}>
              <input type="radio" name="template" checked={template === "empty"} onChange={() => setTemplate("empty")} />
              <div>
                <div style={{ fontWeight: 650 }}>Empty</div>
                <div className="small faint">Start clean — no members yet</div>
              </div>
            </label>
            <label className="row" style={{ gap: 7, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", flex: 1, background: template === "demo" ? "var(--primary-soft)" : "var(--bg-elev)" }}>
              <input type="radio" name="template" checked={template === "demo"} onChange={() => setTemplate("demo")} />
              <div>
                <div style={{ fontWeight: 650 }}>Demo data</div>
                <div className="small faint">Sample members & loans to explore</div>
              </div>
            </label>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------- Manage Kopris
function ManageKoprisModal({ open, onClose }) {
  const { kopris, renameKopri, deleteKopri, resetKopriDemo, switchKopri, activeKopriId } = useKopri();
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);

  const startEdit = (k) => {
    setEditingId(k.id);
    setDraftName(k.name);
  };

  const saveRename = () => {
    if (editingId && draftName.trim()) renameKopri(editingId, draftName.trim());
    setEditingId(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Kopris"
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="kopri-list">
        {kopris.map((k) => (
          <div key={k.id} className={`kopri-row ${k.active ? "active" : ""}`}>
            {editingId === k.id ? (
              <div className="kopri-row-main">
                <TextInput
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  autoFocus
                  aria-label="Kopri name"
                  style={{ flex: 1, minWidth: 0 }}
                  onKeyDown={(e) => e.key === "Enter" && saveRename()}
                />
                <Button size="sm" variant="primary" onClick={saveRename}>
                  Save
                </Button>
                <Button size="sm" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="kopri-row-main">
                <Avatar name={k.name} id={k.id} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kopri-row-name">{k.name}</div>
                  <div className="small faint">
                    {k.members} members · {k.loans} loans · {k.events} events
                  </div>
                </div>
              </div>
            )}
            <div className="kopri-row-actions">
              <button
                className="btn btn-sm"
                style={k.active ? { background: "var(--primary-soft)", borderColor: "transparent", color: "var(--primary-text)" } : {}}
                onClick={() => switchKopri(k.id)}
                disabled={k.active}
              >
                {k.active ? (
                  <>
                    <IconCheck width={13} height={13} /> Active
                  </>
                ) : (
                  "Switch"
                )}
              </button>
              <span className="grow" />
              <button className="icon-btn" title="Rename" aria-label="Rename" onClick={() => (editingId === k.id ? saveRename() : startEdit(k))}>
                <IconEdit width={16} height={16} />
              </button>
              <button
                className="icon-btn"
                title="Reset to demo data"
                aria-label="Reset to demo data"
                onClick={() => setConfirmReset(k)}
              >
                <IconRefresh width={16} height={16} />
              </button>
              <button
                className="icon-btn"
                title={kopris.length <= 1 ? "Can't delete the last Kopri" : "Delete Kopri"}
                aria-label="Delete Kopri"
                style={{ color: kopris.length <= 1 ? "var(--text-faint)" : "var(--red)", opacity: kopris.length <= 1 ? 0.4 : 1 }}
                disabled={kopris.length <= 1}
                onClick={() => setConfirmDelete(k)}
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="small faint" style={{ marginTop: 10 }}>
        The active Kopri is highlighted — every page shows its data. Data for each Kopri is stored separately in this browser; when a backend arrives each Kopri becomes an isolated account ("tenant").
      </div>
      {confirmReset && (
        <Modal
          open
          onClose={() => setConfirmReset(null)}
          title={`Reset “${confirmReset.name}”?`}
          footer={
            <>
              <Button onClick={() => setConfirmReset(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetKopriDemo(confirmReset.id);
                  setConfirmReset(null);
                }}
              >
                Reset to demo
              </Button>
            </>
          }
        >
          <p className="muted">Its current members, loans and ledger will be replaced with the demo data. This cannot be undone.</p>
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title={`Delete “${confirmDelete.name}”?`}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteKopri(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <p className="muted">
            This removes the Kopri and all its data (members, loans, ledger, rules) from this browser. {activeKopriId === confirmDelete.id && "It is the active Kopri — you'll be switched to another."} This cannot be undone.
          </p>
        </Modal>
      )}
    </Modal>
  );
}