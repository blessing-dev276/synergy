import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminAddOnboardingItem, adminRemoveOnboardingItem, adminSetRegistrationLink } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";

const CONTENT_STEPS = [
  { key: "business_explanation", label: "Business Explanation" },
  { key: "network_varsity", label: "Network Varsity" },
  { key: "office_policy", label: "Office Policy" },
];
const TYPE_ICON = { pdf: "clipboard", video: "video", link: "link" };

function AddItemModal({ open, onClose, step, onAdded }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [type, setType] = useState("pdf");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [filePath, setFilePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("pdf");
    setTitle("");
    setLinkUrl("");
    setFilePath("");
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `${step}/${Date.now()}-${file.name}`;
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
      await adminAddOnboardingItem(step, type, title.trim(), type === "link" ? null : filePath, type === "link" ? linkUrl.trim() : null);
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
    <Modal open={open} onClose={onClose} title="Add Onboarding Item" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="item-type">Type</label>
          <select id="item-type" value={type} onChange={(e) => { setType(e.target.value); setFilePath(""); setLinkUrl(""); }}>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
            <option value="link">Link</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="item-title">Title</label>
          <input id="item-title" autoFocus placeholder="e.g. What We Do" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {type === "link" ? (
          <div className="field">
            <label htmlFor="item-link">URL</label>
            <input id="item-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
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
            <input
              ref={fileInputRef}
              type="file"
              accept={type === "pdf" ? "application/pdf" : "video/*"}
              style={{ display: "none" }}
              onChange={handleFile}
            />
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

function RegistrationLinkCard() {
  const toast = useToast();
  const { data: settings, refetch } = useSupabaseQuery(() => supabase.from("onboarding_settings").select("registration_link").maybeSingle(), []);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const value = touched ? link : settings?.registration_link ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await adminSetRegistrationLink(value);
      toast.success("Registration link saved.");
      setTouched(false);
      await refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: "18px" }}>
      <div className="card-title">4. Registration Link</div>
      <div className="card-subtitle">The link members complete after finishing Office Policy.</div>
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

function StepSection({ step, items, onChanged }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const remove = async (id) => {
    setRemovingId(id);
    try {
      await adminRemoveOnboardingItem(id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that item.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {step.label}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add item
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>No content yet.</div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="onboarding-item-row">
            <Icon name={TYPE_ICON[it.type]} size={16} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>{it.title}</div>
            <span className="badge badge-neutral">{it.type}</span>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(it.id)} disabled={removingId === it.id}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))
      )}

      <AddItemModal open={modalOpen} onClose={() => setModalOpen(false)} step={step.key} onAdded={onChanged} />
    </div>
  );
}

function MemberProgressTable() {
  const { loading, error, data } = useSupabaseQuery(() => supabase.rpc("get_admin_onboarding_overview", {}), []);
  if (loading) return <Skeleton variant="table-row" />;
  if (error) return <ErrorState description="Couldn't load member progress." />;
  const rows = data ?? [];

  return (
    <div className="card" style={{ marginTop: "18px" }}>
      <div className="card-title">Member Progress</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>No active members yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Business Explanation</th>
                <th>Network Varsity</th>
                <th>Office Policy</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td>{r.displayName}</td>
                  <td>{r.businessExplanationAt ? new Date(r.businessExplanationAt).toLocaleDateString() : "—"}</td>
                  <td>{r.networkVarsityAt ? new Date(r.networkVarsityAt).toLocaleDateString() : "—"}</td>
                  <td>{r.officePolicyAt ? new Date(r.officePolicyAt).toLocaleDateString() : "—"}</td>
                  <td>{r.registeredAt ? new Date(r.registeredAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OnboardingAdmin() {
  const { loading, error, data: items, refetch } = useSupabaseQuery(() => supabase.from("onboarding_step_items").select("*").order("order_index"), []);

  if (loading) return <Skeleton variant="card" height="120px" />;
  if (error) return <ErrorState description="Couldn't load onboarding content." />;

  return (
    <div>
      {CONTENT_STEPS.map((step) => (
        <StepSection key={step.key} step={step} items={(items ?? []).filter((it) => it.step === step.key)} onChanged={refetch} />
      ))}
      <RegistrationLinkCard />
      <MemberProgressTable />
    </div>
  );
}
