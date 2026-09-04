import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  adminAddLevelLearnItem,
  adminRemoveLevelLearnItem,
  adminAddLevelChecklistItem,
  adminRemoveLevelChecklistItem,
  adminSetLevelRegistrationLink,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";

const LEVEL_KEY = "prospect";
const TYPE_ICON = { pdf: "clipboard", video: "video", link: "link" };
const SIGNAL_LABEL = {
  manual: "Self-reported",
  profile_complete: "Auto: profile complete",
  skills_identified: "Auto: skills identified",
  goals_set: "Auto: goals submitted",
  sponsor_assigned: "Auto: sponsor assigned",
};

function AddLearnItemModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [type, setType] = useState("link");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [filePath, setFilePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setLinkUrl("");
    setFilePath("");
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `${LEVEL_KEY}-learn/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("onboarding").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    setFilePath(path);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this item a title.");
      return;
    }
    if (type === "link" && !linkUrl.trim()) {
      toast.error("Enter a link URL.");
      return;
    }
    if (type !== "link" && !filePath) {
      toast.error(`Upload a ${type} file first.`);
      return;
    }
    setSaving(true);
    try {
      await adminAddLevelLearnItem(LEVEL_KEY, type, title.trim(), type === "link" ? null : filePath, type === "link" ? linkUrl.trim() : null);
      toast.success("Item added.");
      reset();
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Learn Item" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="l1-type">Type</label>
          <select
            id="l1-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setFilePath("");
              setLinkUrl("");
            }}
          >
            <option value="link">Link</option>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="l1-title">Title</label>
          <input id="l1-title" autoFocus placeholder="e.g. Synergy Orientation" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {type === "link" ? (
          <div className="field">
            <label htmlFor="l1-link">URL</label>
            <input id="l1-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label>{type === "pdf" ? "PDF file" : "Video file"}</label>
            {filePath ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "8px" }}>
                <Icon name="check" size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "13.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Uploaded: {filePath.split("/").pop()}
                </span>
                <button type="button" className="icon-btn" title="Remove" onClick={() => setFilePath("")}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : `Upload ${type}`}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept={type === "pdf" ? "application/pdf" : "video/*"} style={{ display: "none" }} onChange={handleFile} />
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Saving…" : "Add Item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LearnSection({ items, refetch }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const remove = async (id) => {
    setRemovingId(id);
    try {
      await adminRemoveLevelLearnItem(id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that item.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            Learn
          </div>
          <div className="card-subtitle" style={{ marginBottom: 0 }}>
            Ordered, one unlocks after the previous is marked done.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add item
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>No content yet.</div>
      ) : (
        items.map((it, i) => (
          <div key={it.id} className="onboarding-item-row">
            <span style={{ fontSize: "12px", color: "var(--slate)", width: "18px", flexShrink: 0 }}>{i + 1}</span>
            <Icon name={TYPE_ICON[it.type]} size={16} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>{it.title}</div>
            <span className="badge badge-neutral">{it.type}</span>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(it.id)} disabled={removingId === it.id}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))
      )}
      <AddLearnItemModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={refetch} />
    </div>
  );
}

function AddChecklistItemModal({ open, onClose, section, onAdded }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [signal, setSignal] = useState("manual");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this item a title.");
      return;
    }
    setSaving(true);
    try {
      await adminAddLevelChecklistItem(LEVEL_KEY, section, title.trim(), signal);
      toast.success("Item added.");
      setTitle("");
      setSignal("manual");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add ${section === "practice" ? "Practice" : "Work"} Item`} size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="cl-title">Title</label>
          <input id="cl-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-signal">Tracking</label>
          <select id="cl-signal" value={signal} onChange={(e) => setSignal(e.target.value)}>
            {Object.entries(SIGNAL_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ChecklistSection({ title, section, items, refetch }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const remove = async (id) => {
    setRemovingId(id);
    try {
      await adminRemoveLevelChecklistItem(id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that item.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {title}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add item
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>Nothing yet.</div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="onboarding-item-row">
            <div style={{ flex: 1, minWidth: 0 }}>{it.title}</div>
            <span className="badge badge-neutral">{SIGNAL_LABEL[it.signal] ?? it.signal}</span>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(it.id)} disabled={removingId === it.id}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))
      )}
      <AddChecklistItemModal open={modalOpen} onClose={() => setModalOpen(false)} section={section} onAdded={refetch} />
    </div>
  );
}

function RegistrationCard() {
  const toast = useToast();
  const { data: settings, refetch } = useSupabaseQuery(() => supabase.from("level_registration").select("registration_link, training_levels!inner(key)").eq("training_levels.key", LEVEL_KEY).maybeSingle(), []);
  const [link, setLink] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const value = touched ? link : settings?.registration_link ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await adminSetLevelRegistrationLink(LEVEL_KEY, value);
      toast.success("Registration link saved.");
      setTouched(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">Registration Link</div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          placeholder="https://…"
          value={value}
          onChange={(e) => {
            setLink(e.target.value);
            setTouched(true);
          }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function MemberProgressTable() {
  const { loading, error, data } = useSupabaseQuery(() => supabase.rpc("get_admin_level_overview", { p_level_key: LEVEL_KEY }), []);
  if (loading) return <Skeleton variant="table-row" />;
  if (error) return <ErrorState description="Couldn't load member progress." />;
  const rows = data ?? [];

  return (
    <div className="card">
      <div className="card-title">Member Progress</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>No active members yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Registration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>
                <td>{r.displayName}</td>
                <td>{r.registrationStatus ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Level1ProspectAdmin() {
  const {
    loading,
    error,
    data: level,
    refetch,
  } = useSupabaseQuery(() => supabase.rpc("get_my_level_progress", { p_level_key: LEVEL_KEY }), []);

  if (loading) return <Skeleton variant="card" height="180px" />;
  if (error) return <ErrorState description="Couldn't load this level." />;

  return (
    <div>
      <LearnSection items={level.learn} refetch={refetch} />
      <ChecklistSection title="Practice" section="practice" items={level.practice} refetch={refetch} />
      <ChecklistSection title="Work" section="work" items={level.work} refetch={refetch} />
      <RegistrationCard />
      <MemberProgressTable />
    </div>
  );
}
