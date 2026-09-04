import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminAddNmProduct, adminRemoveNmProduct, adminAddNmBasic, adminRemoveNmBasic } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";

function AddLinkModal({ open, onClose, title, nameLabel, onSubmit }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(`Enter a ${nameLabel.toLowerCase()}.`);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(name.trim(), description.trim(), linkUrl.trim());
      setName("");
      setDescription("");
      setLinkUrl("");
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="nm-admin-name">{nameLabel}</label>
          <input id="nm-admin-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nm-admin-desc">Description (optional)</label>
          <textarea id="nm-admin-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nm-admin-link">Link (optional)</label>
          <input id="nm-admin-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
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

function CuratedListCard({ heading, subtitle, table, columns, onAdd, onRemove }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const {
    loading,
    error,
    data: rows,
    refetch,
  } = useSupabaseQuery(() => supabase.from(table).select("*").order("created_at", { ascending: false }), [table]);

  const remove = async (id) => {
    try {
      await onRemove(id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            {heading}
          </div>
          <div className="card-subtitle" style={{ marginBottom: 0 }}>
            {subtitle}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>

      {loading && <Skeleton variant="table-row" />}
      {error && <ErrorState description="Couldn't load that list." />}
      {!loading && !error && (!rows || rows.length === 0) && <div style={{ fontSize: "13px", color: "var(--slate)" }}>Nothing added yet.</div>}
      {!loading &&
        !error &&
        rows?.map((r) => (
          <div key={r.id} className="onboarding-item-row">
            <div style={{ flex: 1, minWidth: 0 }}>{r[columns.name]}</div>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(r.id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}

      <AddLinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={heading}
        nameLabel={columns.nameLabel}
        onSubmit={async (name, description, linkUrl) => {
          await onAdd(name, description, linkUrl);
          refetch();
        }}
      />
    </div>
  );
}

export default function NetworkMarketingAdmin() {
  return (
    <div>
      <p style={{ color: "var(--slate)", marginBottom: "16px" }}>
        Curate the products and foundational training links members see. Each member manages their own contacts and activity in their personal pipeline —
        that stays private to them.
      </p>
      <CuratedListCard
        heading="Products"
        subtitle="Shown when a member logs a contact's interest."
        table="network_marketing_products"
        columns={{ name: "name", nameLabel: "Product name" }}
        onAdd={adminAddNmProduct}
        onRemove={adminRemoveNmProduct}
      />
      <CuratedListCard
        heading="Basics"
        subtitle="Foundational training links, e.g. Sound Health, Cool Wealth."
        table="network_marketing_basics"
        columns={{ name: "title", nameLabel: "Title" }}
        onAdd={adminAddNmBasic}
        onRemove={adminRemoveNmBasic}
      />
    </div>
  );
}
