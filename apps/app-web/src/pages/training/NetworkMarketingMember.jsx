import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { addNmContact, updateNmContact, setNmContactStage, addNmActivityNote, removeNmContact } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Modal from "../../components/Modal.jsx";

const STAGE_META = {
  prospect: { label: "Prospect", badge: "badge-neutral" },
  invited: { label: "Invited", badge: "badge-info" },
  presented: { label: "Presented", badge: "badge-info" },
  followed_up: { label: "Followed Up", badge: "badge-warning" },
  won_customer: { label: "Won — Customer", badge: "badge-success" },
  won_distributor: { label: "Won — Distributor", badge: "badge-success" },
  lost: { label: "Lost", badge: "badge-danger" },
};
const STAGE_ORDER = Object.keys(STAGE_META);

const TABS = [
  { key: "pipeline", label: "My Pipeline" },
  { key: "products", label: "Products" },
  { key: "basics", label: "Basics" },
];

// ================= Add/Edit contact modal =================
function ContactModal({ open, onClose, products, editing, onSaved }) {
  const toast = useToast();
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [productId, setProductId] = useState(editing?.interested_product_id ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Enter the contact's name.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateNmContact(editing.id, fullName.trim(), phone.trim(), email.trim(), productId || null, notes.trim());
      } else {
        await addNmContact(fullName.trim(), phone.trim(), email.trim(), productId || null, notes.trim());
      }
      toast.success(editing ? "Contact updated." : "Contact added.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Contact" : "Add Contact"} size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="nm-name">Name</label>
          <input id="nm-name" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="nm-phone">Phone</label>
            <input id="nm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="nm-email">Email</label>
            <input id="nm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="nm-product">Interested product (optional)</label>
          <select id="nm-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">None</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nm-notes">Notes (optional)</label>
          <textarea id="nm-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddNoteModal({ open, onClose, contact, onAdded }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      toast.error("Enter a note.");
      return;
    }
    setSaving(true);
    try {
      await addNmActivityNote(contact.id, note.trim());
      setNote("");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Note for ${contact?.full_name ?? ""}`} size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="nm-note-body">Note</label>
          <textarea id="nm-note-body" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityTimeline({ contactId }) {
  const { loading, data: activities } = useSupabaseQuery(
    () => supabase.from("network_marketing_activities").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }),
    [contactId],
  );

  if (loading) return <Skeleton variant="text" height="14px" />;
  if (!activities || activities.length === 0) return <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>No activity yet.</div>;

  return (
    <ul className="rank-requirement-list" style={{ marginTop: "8px" }}>
      {activities.map((a) => (
        <li key={a.id} className="rank-requirement-row" style={{ alignItems: "flex-start" }}>
          <span className={`badge ${STAGE_META[a.stage]?.badge ?? "badge-neutral"}`} style={{ flexShrink: 0 }}>
            {STAGE_META[a.stage]?.label ?? a.stage}
          </span>
          <div style={{ flex: 1 }}>
            {a.note && <div style={{ fontSize: "13px" }}>{a.note}</div>}
            <div style={{ fontSize: "11.5px", color: "var(--slate)" }}>{new Date(a.created_at).toLocaleString()}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ContactCard({ contact, products, onChanged }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const changeStage = async (stage) => {
    if (stage === contact.stage) return;
    setBusy(true);
    try {
      await setNmContactStage(contact.id, stage, null);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${contact.full_name} from your pipeline? This deletes their activity history too.`)) return;
    setBusy(true);
    try {
      await removeNmContact(contact.id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            {contact.full_name}
          </div>
          <div style={{ fontSize: "13px", color: "var(--slate)" }}>
            {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No contact info"}
            {contact.network_marketing_products && ` · Interested in ${contact.network_marketing_products.name}`}
          </div>
          {contact.notes && <div style={{ fontSize: "13px", marginTop: "4px" }}>{contact.notes}</div>}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
          <select value={contact.stage} onChange={(e) => changeStage(e.target.value)} disabled={busy}>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
          </select>
          <button type="button" className="icon-btn" title="Edit" onClick={() => setEditOpen(true)}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={remove} disabled={busy}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setNoteOpen(true)}>
          <Icon name="plus" size={13} /> Add note
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide timeline" : "Show timeline"}
        </button>
      </div>

      {expanded && <ActivityTimeline contactId={contact.id} />}

      <ContactModal open={editOpen} onClose={() => setEditOpen(false)} products={products} editing={contact} onSaved={onChanged} />
      <AddNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} contact={contact} onAdded={onChanged} />
    </div>
  );
}

function PipelineTab() {
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");

  const {
    loading,
    error,
    data: contacts,
    refetch,
  } = useSupabaseQuery(
    () => user && supabase.from("network_marketing_contacts").select("*, network_marketing_products(id, name)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    [user?.id],
  );

  const { data: products } = useSupabaseQuery(() => supabase.from("network_marketing_products").select("id, name").order("name"), []);

  if (loading) return <Skeleton variant="card" height="100px" />;
  if (error) return <ErrorState description="Couldn't load your pipeline." />;

  const visible = (contacts ?? []).filter((c) => stageFilter === "all" || c.stage === stageFilter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className={`btn ${stageFilter === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStageFilter("all")}>
            All ({contacts?.length ?? 0})
          </button>
          {STAGE_ORDER.map((s) => {
            const count = (contacts ?? []).filter((c) => c.stage === s).length;
            if (count === 0) return null;
            return (
              <button key={s} type="button" className={`btn ${stageFilter === s ? "btn-primary" : "btn-secondary"}`} onClick={() => setStageFilter(s)}>
                {STAGE_META[s].label} ({count})
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} /> Add contact
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon name="users" size={26} />} title="No contacts yet" description="Add your first prospect to start working your pipeline." />
        </div>
      ) : (
        visible.map((c) => <ContactCard key={c.id} contact={c} products={products} onChanged={refetch} />)
      )}

      <ContactModal open={addOpen} onClose={() => setAddOpen(false)} products={products} onSaved={refetch} />
    </div>
  );
}

function ProductsTab() {
  const { loading, error, data: products } = useSupabaseQuery(() => supabase.from("network_marketing_products").select("*").order("created_at", { ascending: false }), []);
  if (loading) return <Skeleton variant="card" height="80px" />;
  if (error) return <ErrorState description="Couldn't load products." />;
  if (!products || products.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Icon name="briefcase" size={26} />} title="No products yet" description="Your office hasn't added any products yet." />
      </div>
    );
  }
  return (
    <div>
      {products.map((p) => (
        <div key={p.id} className="card" style={{ marginBottom: "10px" }}>
          <div className="card-title" style={{ marginBottom: p.description ? "4px" : 0 }}>
            {p.name}
          </div>
          {p.description && <div style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "6px" }}>{p.description}</div>}
          {p.link_url && (
            <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Open ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function BasicsTab() {
  const { loading, error, data: basics } = useSupabaseQuery(() => supabase.from("network_marketing_basics").select("*").order("created_at", { ascending: false }), []);
  if (loading) return <Skeleton variant="card" height="80px" />;
  if (error) return <ErrorState description="Couldn't load basics." />;
  if (!basics || basics.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Icon name="book" size={26} />} title="No basics yet" description="Your office hasn't added any foundational training links yet." />
      </div>
    );
  }
  return (
    <div>
      {basics.map((b) => (
        <div key={b.id} className="card" style={{ marginBottom: "10px" }}>
          <div className="card-title" style={{ marginBottom: b.description ? "4px" : 0 }}>
            {b.title}
          </div>
          {b.description && <div style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "6px" }}>{b.description}</div>}
          {b.link_url && (
            <a href={b.link_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Open ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function NetworkMarketingMember() {
  const [tab, setTab] = useState("pipeline");

  return (
    <div>
      <div className="page-tabs" style={{ marginBottom: "16px" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`page-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "pipeline" && <PipelineTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "basics" && <BasicsTab />}
    </div>
  );
}
