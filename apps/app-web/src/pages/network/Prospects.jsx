import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { addProspect, setProspectStatus, logProspectActivity } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";
import Modal from "../../components/Modal.jsx";
import NetworkTabs from "../../components/NetworkTabs.jsx";

const STATUSES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up_scheduled", label: "Follow-up scheduled" },
  { key: "presented", label: "Presented" },
  { key: "joined", label: "Joined" },
  { key: "not_interested", label: "Not interested" },
];
const STATUS_BADGE = {
  new: "badge-neutral",
  contacted: "badge-info",
  follow_up_scheduled: "badge-warning",
  presented: "badge-info",
  joined: "badge-success",
  not_interested: "badge-neutral",
};
const ACTIVITY_TYPES = [
  { key: "call", label: "Call" },
  { key: "message", label: "Message" },
  { key: "meeting", label: "Meeting" },
  { key: "presentation", label: "Presentation" },
  { key: "follow_up", label: "Follow-up" },
  { key: "note", label: "Note" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function AddProspectModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addProspect(name.trim(), phone.trim(), whatsapp.trim(), source.trim(), notes.trim());
      toast.success("Prospect added.");
      setName("");
      setPhone("");
      setWhatsapp("");
      setSource("");
      setNotes("");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that prospect.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a prospect">
      <form onSubmit={submit}>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        <div className="field">
          <label>How you know them</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. referral, social media" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
          {saving ? "Adding…" : "Add prospect"}
        </button>
      </form>
    </Modal>
  );
}

function LogActivityModal({ prospectId, onClose, onLogged }) {
  const toast = useToast();
  const [activityType, setActivityType] = useState("call");
  const [activityNote, setActivityNote] = useState("");
  const [activityFollowUp, setActivityFollowUp] = useState("");
  const [logging, setLogging] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLogging(true);
    try {
      await logProspectActivity(prospectId, activityType, activityNote.trim(), activityFollowUp || null);
      toast.success("Activity logged.");
      onLogged();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't log that activity.");
    } finally {
      setLogging(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Log Activity">
      <form onSubmit={submit}>
        <div className="field">
          <label>Activity type</label>
          <select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input value={activityNote} onChange={(e) => setActivityNote(e.target.value)} />
        </div>
        <div className="field">
          <label>Next follow-up date</label>
          <input type="date" value={activityFollowUp} onChange={(e) => setActivityFollowUp(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={logging}>
            {logging ? "Logging…" : "Log activity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProspectRow({ prospect, expanded, onToggle, onChanged }) {
  const toast = useToast();
  const [status, setStatus] = useState(prospect.status);
  const [followUp, setFollowUp] = useState(prospect.next_follow_up_at ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const { data: activities, refetch: refetchActivities } = useSupabaseQuery(
    () => expanded && supabase.from("prospect_activities").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false }),
    [prospect.id, expanded],
  );

  const saveStatus = async () => {
    setSavingStatus(true);
    try {
      await setProspectStatus(prospect.id, status, followUp || null, "");
      toast.success("Status updated.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const overdue = prospect.next_follow_up_at && prospect.next_follow_up_at < todayStr() && !["joined", "not_interested"].includes(prospect.status);
  const dueToday = prospect.next_follow_up_at === todayStr() && !["joined", "not_interested"].includes(prospect.status);

  return (
    <div className="card-elevated" style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{prospect.name}</div>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
            {prospect.phone || prospect.whatsapp || "No contact info"}
            {prospect.next_follow_up_at && ` · Follow up ${new Date(prospect.next_follow_up_at).toLocaleDateString()}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {overdue && <span className="badge badge-danger">Overdue</span>}
          {dueToday && !overdue && <span className="badge badge-warning">Due today</span>}
          <span className={`badge ${STATUS_BADGE[prospect.status]}`}>{STATUSES.find((s) => s.key === prospect.status)?.label}</span>
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={15} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
          {prospect.notes && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>{prospect.notes}</p>}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: 1, minWidth: "160px" }}>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} title="Next follow-up date" />
            <button type="button" className="btn btn-secondary" onClick={saveStatus} disabled={savingStatus}>
              {savingStatus ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="row-meta" style={{ marginBottom: "8px" }}>
            Activity
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
            {(activities ?? []).length === 0 && <li style={{ fontSize: "13px", color: "var(--slate)" }}>No activity logged yet.</li>}
            {(activities ?? []).map((a) => (
              <li key={a.id} style={{ fontSize: "13px" }}>
                <strong>{ACTIVITY_TYPES.find((t) => t.key === a.activity_type)?.label ?? a.activity_type}</strong>
                {a.note && ` — ${a.note}`}
                <span style={{ color: "var(--slate)", fontSize: "12px" }}> · {new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>

          <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setLogModalOpen(true)}>
            <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Log activity
          </button>

          {logModalOpen && (
            <LogActivityModal
              prospectId={prospect.id}
              onClose={() => setLogModalOpen(false)}
              onLogged={() => {
                refetchActivities();
                onChanged();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function Prospects() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { loading, data: prospects, refetch } = useSupabaseQuery(
    () => user && supabase.from("prospects").select("*").order("next_follow_up_at", { ascending: true, nullsFirst: false }),
    [user?.id],
  );

  const filtered = (prospects ?? []).filter((p) => statusFilter === "all" || p.status === statusFilter);
  // Overdue/due-today first, then everything else in the server's order.
  const sorted = [...filtered].sort((a, b) => {
    const rank = (p) => {
      if (["joined", "not_interested"].includes(p.status)) return 2;
      if (p.next_follow_up_at && p.next_follow_up_at <= todayStr()) return 0;
      return 1;
    };
    return rank(a) - rank(b);
  });

  return (
    <div>
      <div className="hero-banner">
        <h1>Prospects</h1>
        <p>Prospect. Follow up. Sponsor. Every contact starts here.</p>
      </div>

      <NetworkTabs uid={user?.id} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`badge ${statusFilter === "all" ? "badge-success" : "badge-neutral"}`}
            onClick={() => setStatusFilter("all")}
            style={{ border: "none", cursor: "pointer" }}
          >
            All ({prospects?.length ?? 0})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`badge ${statusFilter === s.key ? "badge-success" : "badge-neutral"}`}
              onClick={() => setStatusFilter(s.key)}
              style={{ border: "none", cursor: "pointer" }}
            >
              {s.label} ({(prospects ?? []).filter((p) => p.status === s.key).length})
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Add prospect
        </button>
      </div>

      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && sorted.length === 0 && <EmptyState icon={<Icon name="network" size={26} />} title="No prospects yet" description="Add someone you're building a relationship with." />}
      {!loading &&
        sorted.map((p) => (
          <ProspectRow
            key={p.id}
            prospect={p}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId((prev) => (prev === p.id ? null : p.id))}
            onChanged={refetch}
          />
        ))}

      <AddProspectModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={refetch} />
    </div>
  );
}
