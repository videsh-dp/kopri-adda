import { useRef, useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { managerUsernameTaken } from "../state/kopriStore.js";
import { SUPERADMIN } from "../lib/auth.js";
import { Card, Button, Field, Modal, TextInput, ConfirmModal, EmptyState, toast } from "../components/ui.jsx";
import { IconPlus, IconEdit, IconTrash } from "../components/Icons.jsx";

const EMPTY = { name: "", username: "", password: "", kopriName: "" };

function ManagerForm({ onClose, initial, onSave, root, editingId }) {
  const [form, setForm] = useState(initial);
  const [show, setShow] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const username = form.username.trim();
  const taken = !!username && (managerUsernameTaken(root, username, editingId) || username.toLowerCase() === SUPERADMIN.username);
  const valid = username && form.password && !taken && (editingId || form.kopriName.trim() || form.name.trim());

  return (
    <Modal
      open
      onClose={onClose}
      title={editingId ? "Edit manager" : "Add Kopri manager"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...form, username })}>
            {editingId ? "Save" : "Create manager & Kopri"}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Manager's name">
          <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Anthony Fernandes" autoFocus />
        </Field>
        {!editingId && (
          <Field label="Kopri name" hint="The manager gets this brand-new, empty Kopri. They can rename it later.">
            <TextInput value={form.kopriName} onChange={set("kopriName")} placeholder="e.g. Mapusa Welfare Kopri" />
          </Field>
        )}
        <Field label="Username (used to log in)">
          <TextInput value={form.username} onChange={set("username")} autoCapitalize="none" autoCorrect="off" autoComplete="off" />
        </Field>
        {taken && (
          <div className="small" style={{ color: "var(--red)" }}>
            That username is already taken.
          </div>
        )}
        <Field label="Password">
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <TextInput type={show ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="new-password" />
            <Button size="sm" onClick={() => setShow((v) => !v)}>
              {show ? "Hide" : "Show"}
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function Managers() {
  const { root, addManager, updateManager, deleteManager, wipeAll, importRoot } = useKopri();
  const [form, setForm] = useState(null); // null | { id?, initial }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [revealed, setRevealed] = useState({});
  const fileRef = useRef(null);
  const managers = root.managers || [];

  const save = (data) => {
    if (form.id) {
      updateManager(form.id, { name: data.name.trim() || data.username, username: data.username, password: data.password });
      toast("Manager updated");
    } else {
      addManager(data);
      toast(`Manager “${data.username}” created with an empty Kopri`);
    }
    setForm(null);
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(root, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kopri-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importRoot(JSON.parse(reader.result));
        toast("Backup restored");
      } catch {
        toast("That file isn't a valid Kopri backup");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Kopri Managers</div>
          <div className="page-sub">Each manager logs in with their own username and password and sees only their own Kopri.</div>
        </div>
        <Button variant="primary" onClick={() => setForm({ initial: EMPTY })}>
          <IconPlus /> Add manager
        </Button>
      </div>

      <Card pad={false}>
        {managers.length === 0 ? (
          <EmptyState icon="👤" title="No managers yet" sub="Add one to give someone their own fresh Kopri." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Kopri</th>
                  <th className="num">Members</th>
                  <th className="num">Loans</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const k = root.kopris.find((x) => x.id === m.kopriId);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 650 }}>{m.name}</td>
                      <td>{m.username}</td>
                      <td>
                        <button className="btn btn-sm" onClick={() => setRevealed((r) => ({ ...r, [m.id]: !r[m.id] }))}>
                          {revealed[m.id] ? m.password : "Show"}
                        </button>
                      </td>
                      <td>{k?.name}</td>
                      <td className="num">{k?.members.length ?? 0}</td>
                      <td className="num">{k?.loans.length ?? 0}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: "nowrap" }}>
                          <button
                            className="icon-btn"
                            title="Edit / reset password"
                            onClick={() => setForm({ id: m.id, initial: { name: m.name, username: m.username, password: m.password, kopriName: "" } })}
                          >
                            <IconEdit width={14} height={14} />
                          </button>
                          <button className="icon-btn" title="Delete manager" style={{ color: "var(--red)" }} onClick={() => setConfirmDelete(m)}>
                            <IconTrash width={14} height={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />
      <Card title="Data" sub="Everything is stored in this browser only — there is no server." pad>
        <div className="row">
          <Button variant="danger" onClick={() => setConfirmWipe(true)}>
            Clear demo data & start fresh
          </Button>
          <Button onClick={exportBackup}>Download backup</Button>
          <Button onClick={() => fileRef.current?.click()}>Restore backup…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Managers and their Kopris are kept when you clear demo data. Because data lives in the browser, a manager can only log in on the
          device that holds it — use <b>Download backup</b> and <b>Restore backup</b> to move everything to another device.
        </div>
      </Card>

      {form && <ManagerForm key={form.id || "new"} onClose={() => setForm(null)} initial={form.initial} editingId={form.id} root={root} onSave={save} />}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          deleteManager(confirmDelete.id, true);
          setConfirmDelete(null);
        }}
        title={`Delete manager “${confirmDelete?.name}”?`}
        confirmLabel="Delete manager & Kopri"
        danger
      >
        <p className="muted">This removes the manager's login and their Kopri with all its members, loans and ledger. This cannot be undone.</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => {
          wipeAll();
          setConfirmWipe(false);
          toast("Demo data cleared — starting fresh");
        }}
        title="Clear demo data and start fresh?"
        confirmLabel="Clear demo data"
        danger
      >
        <p className="muted">
          Deletes the sample Kopri(s) and starts one empty Kopri for you. Managers and their Kopris are not touched. This cannot be undone.
        </p>
      </ConfirmModal>
    </div>
  );
}
