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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        title="Switch Kopri / manage accounts"
        style={{ maxWidth: 220 }}
      >
        <Avatar name={activeName} id={active?.id || "k"} size="sm" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{activeName}</span>
        <Chevron />
      </button>

      {open && (
        <div
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
      wide
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Kopri</th>
              <th className="num">Members</th>
              <th className="num">Loans</th>
              <th className="num">Events</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {kopris.map((k) => (
              <tr key={k.id}>
                <td>
                  {editingId === k.id ? (
                    <div className="row" style={{ gap: 6 }}>
                      <TextInput value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus style={{ maxWidth: 220 }} onKeyDown={(e) => e.key === "Enter" && saveRename()} />
                      <Button size="sm" variant="primary" onClick={saveRename}>
                        Save
                      </Button>
                      <Button size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="member-cell">
                      <Avatar name={k.name} id={k.id} size="sm" />
                      <div style={{ fontWeight: 650 }}>{k.name}</div>
                    </div>
                  )}
                </td>
                <td className="num">{k.members}</td>
                <td className="num">{k.loans}</td>
                <td className="num">{k.events}</td>
                <td>
                  <button
                    className="btn btn-sm"
                    style={k.active ? { background: "var(--primary-soft)", borderColor: "transparent", color: "var(--primary-text)" } : {}}
                    onClick={() => {
                      switchKopri(k.id);
                    }}
                  >
                    {k.active ? <IconCheck width={13} height={13} /> : "Switch"}
                  </button>
                </td>
                <td>
                  <div className="row" style={{ gap: 5 }}>
                    <button className="icon-btn" title="Rename" style={{ width: 30, height: 30 }} onClick={() => (editingId === k.id ? saveRename() : startEdit(k))}>
                      <IconEdit width={14} height={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Reset to demo data"
                      style={{ width: 30, height: 30 }}
                      onClick={() => {
                        if (window.confirm(`Reset “${k.name}” to demo data? Its current members, loans and ledger will be replaced.`)) resetKopriDemo(k.id);
                      }}
                    >
                      <IconRefresh width={14} height={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title={kopris.length <= 1 ? "Can't delete the last Kopri" : "Delete Kopri"}
                      style={{ width: 30, height: 30, color: kopris.length <= 1 ? "var(--text-faint)" : "var(--red)", opacity: kopris.length <= 1 ? 0.4 : 1 }}
                      disabled={kopris.length <= 1}
                      onClick={() => setConfirmDelete(k)}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="small faint" style={{ marginTop: 10 }}>
        The active Kopri is highlighted — every page shows its data. Data for each Kopri is stored separately in this browser; when a backend arrives each Kopri becomes an isolated account ("tenant").
      </div>
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