import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { addProspect, setProspectStatus, logProspectActivity, linkProspectToMember } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Modal from "../../components/Modal.jsx";
import NetworkTree from "../../components/NetworkTree.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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
const OPEN_PROSPECT_STATUSES = new Set(["new", "contacted", "follow_up_scheduled", "presented"]);

// ================= Invite & Grow =================
// Anyone who signs up through this link has their sponsor set automatically
// (Signup.jsx resolves the ?ref=<uid> via get_sponsor_by_id, see
// supabase/migrations/0021_sponsor_by_id.sql) -- server-validated, not
// client-manipulable: the RPC is the only thing that ever writes
// sponsor_uid, so pasting a different uid into the URL by hand does
// nothing beyond attributing the (still real) signup to that other member.
function ReferralLinkCard({ uid }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const link = `${window.location.origin}/signup?ref=${uid}`;
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!showQr || qrDataUrl) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 220, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [showQr, qrDataUrl, link]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link — you can select and copy it manually.");
    }
  };

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: "Join me on Synergy", text: "Build your skills and your business with me on Synergy.", url: link });
      } catch {
        // Cancelled or unsupported mid-call -- no error toast, this isn't a failure.
      }
      return;
    }
    handleCopy();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">
        <Icon name="network" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Invite & Grow
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "12px" }}>
        Share your personal invitation link to introduce new people to Synergy — anyone who joins through it is
        connected to you as their sponsor automatically.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        <input
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid var(--line)",
            borderRadius: "9px",
            padding: "11px 14px",
            fontSize: "14.5px",
            background: "var(--surface)",
            color: "var(--navy)",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={handleCopy}>
          <Icon name={copied ? "check" : "link"} size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          {copied ? "Link copied" : "Copy Link"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleShare}>
          Share
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowQr((v) => !v)}>
          {showQr ? "Hide QR Code" : "QR Code"}
        </button>
      </div>

      {showQr && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code for your invitation link" style={{ borderRadius: "10px", background: "#fff", padding: "10px" }} />
          ) : (
            <Skeleton variant="card" height="220px" width="220px" />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, tone, loading }) {
  return (
    <div className="card-elevated" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`} style={{ width: "44px", height: "44px" }}>
        <Icon name={icon} size={19} />
      </span>
      <div>
        <div className="card-subtitle" style={{ marginBottom: "2px" }}>
          {label}
        </div>
        {loading ? <Skeleton variant="text" width="50px" height="24px" /> : <div style={{ fontSize: "24px", fontWeight: 700 }}>{value}</div>}
      </div>
    </div>
  );
}

// ================= My Prospects =================
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
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        <div className="field">
          <label>Prospect source</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. referral, social media" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interest, context, anything worth remembering" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
          {saving ? "Adding…" : "Add prospect"}
        </button>
      </form>
    </Modal>
  );
}

// Quick action from Follow-ups Due -- logs the contact and clears the due
// date (it's no longer "due" until a new one is scheduled from the
// prospect's own row below).
function LogContactModal({ prospect, onClose, onLogged }) {
  const toast = useToast();
  const [method, setMethod] = useState("call");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [status, setStatus] = useState(prospect.status === "new" ? "contacted" : prospect.status);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await logProspectActivity(prospect.id, method, note.trim(), nextFollowUp || null);
      if (status !== prospect.status || nextFollowUp !== (prospect.next_follow_up_at ?? "")) {
        await setProspectStatus(prospect.id, status, nextFollowUp || null, "");
      }
      toast.success("Contact logged.");
      onLogged();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't log that contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Log Contact — ${prospect.name}`}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Contact method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="field">
          <label>Next follow-up date</label>
          <input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Full detail view, expanded in place (same pattern this app already uses
// throughout -- RankBuilder's rows, SettingsTeam, etc. -- rather than a
// second, competing "detail page" UI).
function ProspectRow({ prospect, expanded, onToggle, onChanged, sponsoredNotLinked }) {
  const toast = useToast();
  const [status, setStatus] = useState(prospect.status);
  const [followUp, setFollowUp] = useState(prospect.next_follow_up_at ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState("");
  const [linking, setLinking] = useState(false);

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

  const linkToMember = async () => {
    if (!linkTarget) return;
    setLinking(true);
    try {
      await linkProspectToMember(prospect.id, linkTarget);
      toast.success("Linked to their member account.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't link that member.");
    } finally {
      setLinking(false);
    }
  };

  const overdue = prospect.next_follow_up_at && prospect.next_follow_up_at < todayStr() && OPEN_PROSPECT_STATUSES.has(prospect.status);
  const dueToday = prospect.next_follow_up_at === todayStr() && OPEN_PROSPECT_STATUSES.has(prospect.status);

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
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--line)" }} onClick={(e) => e.stopPropagation()}>
          {prospect.registered_uid && (
            <div className="card" style={{ background: "var(--success-soft)", marginBottom: "14px", padding: "12px 14px" }}>
              <Icon name="check" size={13} style={{ verticalAlign: "-2px", color: "var(--success)", marginRight: "5px" }} />
              <span style={{ fontSize: "13px", color: "var(--success)", fontWeight: 600 }}>Registered — joined Synergy through your invitation</span>
            </div>
          )}

          {(prospect.phone || prospect.whatsapp) && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              {prospect.phone && (
                <a href={`tel:${prospect.phone}`} className="btn btn-secondary" style={{ padding: "8px 14px", fontSize: "13px" }}>
                  Call
                </a>
              )}
              {prospect.whatsapp && (
                <a
                  href={`https://wa.me/${prospect.whatsapp.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Message
                </a>
              )}
            </div>
          )}

          {prospect.source && (
            <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "8px" }}>
              <strong style={{ color: "var(--navy)" }}>Source:</strong> {prospect.source}
            </p>
          )}
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
              {savingStatus ? "Saving…" : "Change Status"}
            </button>
          </div>

          {!prospect.registered_uid && sponsoredNotLinked?.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px", alignItems: "center" }}>
              <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} style={{ flex: 1, minWidth: "180px" }}>
                <option value="">Link to a member you sponsor…</option>
                {sponsoredNotLinked.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={linkToMember} disabled={!linkTarget || linking}>
                {linking ? "Linking…" : "Link"}
              </button>
            </div>
          )}

          <div className="row-meta" style={{ marginBottom: "8px" }}>
            Activity History
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
            Log Contact
          </button>

          {logModalOpen && (
            <LogContactModal
              prospect={prospect}
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

// ================= Follow-ups Due =================
function FollowUpRow({ prospect, onMarkContacted, busy }) {
  return (
    <div className="attention-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
          {prospect.name} <span className={`badge ${STATUS_BADGE[prospect.status]}`}>{STATUSES.find((s) => s.key === prospect.status)?.label}</span>
        </div>
        {prospect.notes && <div className="row-meta" style={{ marginTop: "2px" }}>{prospect.notes}</div>}
      </div>
      <button type="button" className="btn btn-secondary" style={{ flexShrink: 0, padding: "8px 14px", fontSize: "13px" }} disabled={busy} onClick={() => onMarkContacted(prospect)}>
        {busy ? "Saving…" : "Mark Contacted"}
      </button>
    </div>
  );
}

function FollowUpsDueSection({ prospects, onChanged }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const today = todayStr();
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const open = (prospects ?? []).filter((p) => p.next_follow_up_at && OPEN_PROSPECT_STATUSES.has(p.status));
  const dueNow = open.filter((p) => p.next_follow_up_at <= today);
  const upcoming = open.filter((p) => p.next_follow_up_at > today && p.next_follow_up_at <= in7Days);

  const markContacted = async (prospect) => {
    setBusyId(prospect.id);
    try {
      await setProspectStatus(prospect.id, prospect.status === "new" ? "contacted" : prospect.status, null, "Marked contacted from Follow-ups Due");
      toast.success(`Marked ${prospect.name} as contacted.`);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that prospect.");
    } finally {
      setBusyId(null);
    }
  };

  if (dueNow.length === 0 && upcoming.length === 0) return null;

  return (
    <div style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "12px" }}>
        Follow-ups Due
      </div>
      {dueNow.length > 0 && (
        <div className="attention-card" style={{ marginBottom: upcoming.length > 0 ? "14px" : 0 }}>
          {dueNow.map((p) => (
            <FollowUpRow key={p.id} prospect={p} onMarkContacted={markContacted} busy={busyId === p.id} />
          ))}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="card-elevated">
          <div className="row-meta" style={{ marginBottom: "10px" }}>
            Upcoming (next 7 days)
          </div>
          {upcoming.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: "13.5px" }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ color: "var(--slate)" }}>{new Date(p.next_follow_up_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= Needs Attention =================
// Only what's derivable from data already on hand -- overdue follow-ups,
// and brand-new prospects nobody's scheduled a next step for yet. No
// "hasn't been contacted in N days" heuristic: that needs a bulk
// last-activity-per-prospect query this page doesn't otherwise need, and
// guessing at it would risk exactly the fabricated-signal the brief rules out.
function NeedsAttentionSection({ prospects }) {
  const today = todayStr();
  const overdue = (prospects ?? []).filter((p) => p.next_follow_up_at && p.next_follow_up_at < today && OPEN_PROSPECT_STATUSES.has(p.status));
  const noFollowUpSet = (prospects ?? []).filter((p) => p.status === "new" && !p.next_follow_up_at);

  if (overdue.length === 0 && noFollowUpSet.length === 0) return null;

  return (
    <div className="card-elevated" style={{ marginBottom: "24px", borderLeft: "3px solid var(--danger)" }}>
      <div className="card-title">
        <Icon name="ban" size={15} style={{ verticalAlign: "-2px", marginRight: "6px", color: "var(--danger)" }} />
        Needs Attention
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
        {overdue.map((p) => (
          <li key={p.id} style={{ fontSize: "13.5px" }}>
            <strong>{p.name}</strong> <span style={{ color: "var(--slate)" }}>— follow-up overdue since {new Date(p.next_follow_up_at).toLocaleDateString()}.</span>
          </li>
        ))}
        {noFollowUpSet.map((p) => (
          <li key={p.id} style={{ fontSize: "13.5px" }}>
            <strong>{p.name}</strong> <span style={{ color: "var(--slate)" }}>— new prospect, no follow-up scheduled yet.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NetworkDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { loading: loadingOverview, data: overview } = useSupabaseQuery(
    () => user && supabase.rpc("get_network_overview", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingSponsored, data: sponsored } = useSupabaseQuery(
    () => user && supabase.rpc("get_personally_sponsored", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingTree, data: tree } = useSupabaseQuery(
    () => user && supabase.rpc("get_network", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingProspects, data: prospects, refetch: refetchProspects } = useSupabaseQuery(
    () => user && supabase.from("prospects").select("*").order("next_follow_up_at", { ascending: true, nullsFirst: false }),
    [user?.id],
  );

  const today = todayStr();
  const followUpsDueCount = (prospects ?? []).filter((p) => p.next_follow_up_at && p.next_follow_up_at <= today && OPEN_PROSPECT_STATUSES.has(p.status)).length;
  const linkedUids = new Set((prospects ?? []).map((p) => p.registered_uid).filter(Boolean));
  const sponsoredNotLinked = (sponsored ?? []).filter((m) => !linkedUids.has(m.id));

  const q = search.trim().toLowerCase();
  const filtered = (prospects ?? []).filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q) || (p.whatsapp ?? "").includes(q);
  });
  const sorted = [...filtered].sort((a, b) => {
    const rank = (p) => {
      if (!OPEN_PROSPECT_STATUSES.has(p.status)) return 2;
      if (p.next_follow_up_at && p.next_follow_up_at <= today) return 0;
      return 1;
    };
    return rank(a) - rank(b);
  });

  return (
    <div>
      <div className="hero-banner">
        <h1>My Network</h1>
        <p>Manage your prospects, grow your network, and stay on top of your follow-ups.</p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatCard label="Direct Members" value={overview?.personallySponsoredCount ?? 0} icon="users" loading={loadingOverview} />
        <StatCard label="Total Network" value={overview?.networkSize ?? 0} icon="network" loading={loadingOverview} />
        <StatCard label="Active" value={overview?.activeCount ?? 0} icon="check-square" loading={loadingOverview} />
        <StatCard label="Prospects" value={prospects?.length ?? 0} icon="network" loading={loadingProspects} />
        <StatCard label="Follow-ups Due" value={followUpsDueCount} icon="clock" tone={followUpsDueCount > 0 ? "warning" : undefined} loading={loadingProspects} />
      </div>

      {user && <ReferralLinkCard uid={user.id} />}

      <NeedsAttentionSection prospects={prospects} />

      <div className="card-title" style={{ marginBottom: "4px" }}>
        My Prospects
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "16px" }}>
        Keep track of the people you're talking to and never lose track of a follow-up.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1 }}>
          <input
            type="text"
            placeholder="Search prospects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "180px" }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Add Prospect
        </button>
      </div>

      {loadingProspects && <Skeleton variant="card" height="200px" />}
      {!loadingProspects && sorted.length === 0 && (
        <EmptyState icon={<Icon name="network" size={26} />} title="No prospects yet" description="Add someone you're building a relationship with." />
      )}
      {!loadingProspects &&
        sorted.map((p) => (
          <ProspectRow
            key={p.id}
            prospect={p}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId((prev) => (prev === p.id ? null : p.id))}
            onChanged={refetchProspects}
            sponsoredNotLinked={sponsoredNotLinked}
          />
        ))}

      <AddProspectModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={refetchProspects} />

      <div style={{ marginTop: "24px" }}>
        <FollowUpsDueSection prospects={prospects} onChanged={refetchProspects} />
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        My Direct Team
      </div>
      {loadingSponsored && <Skeleton variant="card" height="140px" />}
      {!loadingSponsored && (sponsored ?? []).length === 0 && (
        <EmptyState icon={<Icon name="users" size={26} />} title="You haven't sponsored anyone yet" description="Grow your team by sharing your invitation link above." />
      )}
      {!loadingSponsored && (sponsored ?? []).length > 0 && (
        <div className="card-elevated" style={{ padding: 0, marginBottom: "24px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Level</th>
                <th>Joined</th>
                <th>Overdue tasks</th>
              </tr>
            </thead>
            <tbody>
              {sponsored.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.displayName}</td>
                  <td>
                    <span className={`badge ${m.status === "active" ? "badge-success" : "badge-neutral"}`}>{m.status}</span>
                  </td>
                  <td>{m.stageTitle ?? "Not started"}</td>
                  <td>{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    {m.overdueTaskCount > 0 ? (
                      <span className="badge badge-warning">{m.overdueTaskCount}</span>
                    ) : (
                      <span style={{ color: "var(--slate)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Network Structure
      </div>
      {loadingTree && <Skeleton variant="card" height="200px" />}
      {!loadingTree && (
        <div className="card-elevated">
          <NetworkTree nodes={tree ?? []} />
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <Link to="/profile" className="btn btn-secondary">
          Back to profile
        </Link>
      </div>
    </div>
  );
}
