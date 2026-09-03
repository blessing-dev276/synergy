import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminAddPdResource, adminRemovePdResource } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";

const KIND_META = {
  pdf: { label: "Books", icon: "clipboard" },
  podcast: { label: "Podcasts", icon: "podcast" },
  video: { label: "Videos", icon: "video" },
};

function AddResourceModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [fileType, setFileType] = useState("pdf");
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isUpload = fileType === "pdf";

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `personal-development/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("resources").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    setFileUrl(path);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this resource a title.");
      return;
    }
    if (!fileUrl.trim()) {
      toast.error(isUpload ? "Upload a PDF first." : "Enter a link.");
      return;
    }
    setSaving(true);
    try {
      await adminAddPdResource(title.trim(), fileType, fileUrl.trim());
      toast.success("Added to the daily list.");
      setTitle("");
      setFileUrl("");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that resource.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Daily Resource" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pd-kind">Kind</label>
          <select id="pd-kind" value={fileType} onChange={(e) => { setFileType(e.target.value); setFileUrl(""); }}>
            <option value="pdf">Book (PDF)</option>
            <option value="podcast">Podcast (link)</option>
            <option value="video">Video (link)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pd-title">Title</label>
          <input id="pd-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {isUpload ? (
          <div className="field">
            <label>PDF file</label>
            {fileUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "8px" }}>
                <Icon name="check" size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "13.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Uploaded: {fileUrl.split("/").pop()}
                </span>
                <button type="button" className="icon-btn" title="Remove" onClick={() => setFileUrl("")}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload PDF"}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleFile} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="pd-link">Link</label>
            <input id="pd-link" placeholder="https://…" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TodaysProgressTable() {
  const { loading, error, data } = useSupabaseQuery(() => supabase.rpc("get_admin_pd_overview", {}), []);
  if (loading) return <Skeleton variant="table-row" />;
  if (error) return <ErrorState description="Couldn't load today's progress." />;
  const rows = data ?? [];

  return (
    <div className="card" style={{ marginTop: "18px" }}>
      <div className="card-title">Today's Progress</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>No active members yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Done Today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td>{r.displayName}</td>
                  <td>
                    {r.doneToday} / {r.totalToday}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PersonalDevelopmentAdmin() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const {
    loading,
    error,
    data: links,
    refetch,
  } = useSupabaseQuery(
    () => supabase.from("personal_development_resources").select("id, created_at, resources(id, title, file_type, file_url)").order("created_at"),
    [],
  );

  const remove = async (linkId) => {
    setRemovingId(linkId);
    try {
      await adminRemovePdResource(linkId);
      await refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <Skeleton variant="card" height="140px" />;
  if (error) return <ErrorState description="Couldn't load the daily list." />;

  const grouped = { pdf: [], podcast: [], video: [] };
  for (const l of links ?? []) {
    if (l.resources) grouped[l.resources.file_type]?.push(l);
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div>
            <div className="card-title" style={{ marginBottom: "2px" }}>
              Required Daily List
            </div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              Every active member sees this same list each day.
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={14} /> Add resource
          </button>
        </div>

        {Object.entries(KIND_META).map(([kind, meta]) => (
          <div key={kind} style={{ marginBottom: "14px" }}>
            <div className="rank-requirement-group-title">
              <Icon name={meta.icon} size={13} />
              {meta.label}
            </div>
            {grouped[kind].length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--slate)" }}>None yet.</div>
            ) : (
              grouped[kind].map((l) => (
                <div key={l.id} className="onboarding-item-row">
                  <div style={{ flex: 1, minWidth: 0 }}>{l.resources.title}</div>
                  <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(l.id)} disabled={removingId === l.id}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <TodaysProgressTable />

      <AddResourceModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={refetch} />
    </div>
  );
}
