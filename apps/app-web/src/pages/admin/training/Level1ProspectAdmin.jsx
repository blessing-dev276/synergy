import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  adminAddLevelLearnItem,
  adminRemoveLevelLearnItem,
  adminRemoveLevelChecklistItem,
  adminSetLevelMeeting,
  confirmLevelMeeting,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";

const KIND_LABEL = { lesson: "Lesson", agreement_signature: "Agreement (signed)", external_confirmation: "External confirmation", checkbox_confirmation: "Checkbox confirmation" };
const SIGNAL_LABEL = { manual: "Self-reported", class_complete: "Auto: course complete", profile_100: "Auto: profile 100%", goals_set: "Auto: goals submitted", sponsor_meeting: "Verified: sponsor meeting", upline_meeting: "Verified: upline director meeting" };

// ================= Level 1: add item modal =================
function AddLearnItemModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [kind, setKind] = useState("lesson");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [textBody, setTextBody] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [examId, setExamId] = useState("");
  const [agreementBody, setAgreementBody] = useState("");
  const [agreementVersion, setAgreementVersion] = useState("v1");
  const [externalLink, setExternalLink] = useState("");
  const [confirmationLabel, setConfirmationLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: exams } = useSupabaseQuery(() => kind === "lesson" && supabase.from("exams").select("id, title").eq("status", "published").order("title"), [kind]);

  const handlePdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `foundation-lessons/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("onboarding").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    setPdfPath(path);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this item a title.");
      return;
    }
    setSaving(true);
    try {
      await adminAddLevelLearnItem(
        "foundation", kind, title.trim(), description.trim(),
        textBody, videoUrl, pdfPath || null, examId || null,
        agreementBody, agreementVersion, externalLink, confirmationLabel,
      );
      toast.success("Item added.");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Level 1 Requirement" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="li-kind">Type</label>
          <select id="li-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="lesson">Lesson (text/video/PDF, optional quiz)</option>
            <option value="agreement_signature">Agreement to digitally sign</option>
            <option value="external_confirmation">External form + confirmation</option>
            <option value="checkbox_confirmation">Plain confirmation checkbox</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="li-title">Title</label>
          <input id="li-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="li-desc">Short description (optional)</label>
          <input id="li-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {kind === "lesson" && (
          <>
            <div className="field">
              <label htmlFor="li-text">Lesson text</label>
              <textarea id="li-text" rows={4} value={textBody} onChange={(e) => setTextBody(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="li-video">Video URL (optional)</label>
              <input id="li-video" placeholder="https://…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
            </div>
            <div className="field">
              <label>PDF (optional)</label>
              {pdfPath ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "8px" }}>
                  <Icon name="check" size={14} style={{ color: "var(--success)" }} />
                  <span style={{ flex: 1, fontSize: "13.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfPath.split("/").pop()}</span>
                  <button type="button" className="icon-btn" onClick={() => setPdfPath("")}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : "Upload PDF"}
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handlePdf} />
            </div>
            <div className="field">
              <label htmlFor="li-exam">Require a quiz (optional)</label>
              <select id="li-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">No quiz required</option>
                {(exams ?? []).map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
              {!exams?.length && <div style={{ fontSize: "12px", color: "var(--slate)" }}>Publish an exam first (Exams) to require one here.</div>}
            </div>
          </>
        )}

        {kind === "agreement_signature" && (
          <>
            <div className="field">
              <label htmlFor="li-agreement">Agreement text</label>
              <textarea id="li-agreement" rows={6} value={agreementBody} onChange={(e) => setAgreementBody(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="li-version">Version label</label>
              <input id="li-version" value={agreementVersion} onChange={(e) => setAgreementVersion(e.target.value)} />
            </div>
          </>
        )}

        {kind === "external_confirmation" && (
          <div className="field">
            <label htmlFor="li-extlink">External form link</label>
            <input id="li-extlink" placeholder="https://…" value={externalLink} onChange={(e) => setExternalLink(e.target.value)} />
          </div>
        )}

        {(kind === "external_confirmation" || kind === "checkbox_confirmation") && (
          <div className="field">
            <label htmlFor="li-conflabel">Checkbox label</label>
            <input
              id="li-conflabel"
              placeholder='e.g. "I confirm that I have completed…"'
              value={confirmationLabel}
              onChange={(e) => setConfirmationLabel(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Saving…" : "Add Requirement"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Level1Section({ items, refetch }) {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            Level 1 — Foundation
          </div>
          <div className="card-subtitle" style={{ marginBottom: 0 }}>
            8 requirements, in order.
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
            <div style={{ flex: 1, minWidth: 0 }}>{it.title}</div>
            <span className="badge badge-neutral">{KIND_LABEL[it.kind]}</span>
            {it.examId && <span className="badge badge-info">Quiz required</span>}
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

function Level2Section({ items, refetch }) {
  const toast = useToast();
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
      <div className="card-title">Level 2 — Get to Work</div>
      <div className="card-subtitle">The 5 real requirements — each auto-verifies from real activity elsewhere in the app.</div>
      {items.map((it) => (
        <div key={it.id} className="onboarding-item-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            {it.title}
            {it.classId && (
              <>
                {" · "}
                <Link to={`/admin/training/classes/${it.classId}`} style={{ fontSize: "12.5px" }}>
                  Manage course →
                </Link>
              </>
            )}
          </div>
          <span className="badge badge-neutral">{SIGNAL_LABEL[it.signal] ?? it.signal}</span>
          <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(it.id)} disabled={removingId === it.id}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ================= Meetings roster =================
function MeetingRow({ member, meetingType, meeting, refetch }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState(meeting?.meeting_link ?? "");
  const [counterpart, setCounterpart] = useState(meeting?.counterpart_name ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await adminSetLevelMeeting(member.id, meetingType, link, counterpart);
      toast.success("Saved.");
      setEditing(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmLevelMeeting(member.id, meetingType);
      toast.success("Meeting confirmed.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't confirm that.");
    } finally {
      setBusy(false);
    }
  };

  const status = meeting?.status ?? "pending";

  return (
    <tr>
      <td>{member.display_name}</td>
      <td>
        <span className={`badge ${status === "completed" ? "badge-success" : "badge-neutral"}`}>{status === "completed" ? "Completed" : "Pending"}</span>
      </td>
      <td>
        {editing ? (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <input placeholder="Counterpart name" value={counterpart} onChange={(e) => setCounterpart(e.target.value)} style={{ minWidth: "140px" }} />
            <input placeholder="Meeting link" value={link} onChange={(e) => setLink(e.target.value)} style={{ minWidth: "160px" }} />
            <button type="button" className="btn btn-secondary" onClick={save} disabled={busy}>
              Save
            </button>
          </div>
        ) : (
          <span style={{ fontSize: "13px" }}>{meeting?.counterpart_name || "—"}</span>
        )}
      </td>
      <td>
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          {!editing && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {status !== "completed" && (
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
              Confirm
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MeetingsSection() {
  const { loading, error, data, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("profiles")
        // level_meetings has 3 FKs to profiles (user_id/counterpart_uid/confirmed_by) — must
        // name the constraint or PostgREST can't tell which relationship to embed.
        .select("id, display_name, level_meetings!level_meetings_user_id_fkey(meeting_type, status, meeting_link, counterpart_name)")
        .eq("role", "member")
        .eq("status", "active")
        .order("display_name"),
    [],
  );

  if (loading) return <Skeleton variant="card" height="140px" />;
  if (error) return <ErrorState description="Couldn't load members." />;

  const meetingFor = (member, type) => member.level_meetings?.find((m) => m.meeting_type === type);

  return (
    <div className="card">
      <div className="card-title">Sponsor & Upline Director Meetings</div>
      <div className="card-subtitle">Only an admin (or a member's own sponsor, for their sponsor meeting) can confirm these — never the member themselves.</div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th colSpan={3}>Sponsor Meeting</th>
            </tr>
          </thead>
          <tbody>{(data ?? []).map((m) => <MeetingRow key={m.id} member={m} meetingType="sponsor" meeting={meetingFor(m, "sponsor")} refetch={refetch} />)}</tbody>
          <thead>
            <tr>
              <th>Member</th>
              <th colSpan={3}>Upline Director Meeting</th>
            </tr>
          </thead>
          <tbody>{(data ?? []).map((m) => <MeetingRow key={m.id} member={m} meetingType="upline_director" meeting={meetingFor(m, "upline_director")} refetch={refetch} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function Level1ProspectAdmin() {
  const { loading, error, data: status, refetch } = useSupabaseQuery(() => supabase.rpc("get_onboarding_status", {}), []);

  if (loading) return <Skeleton variant="card" height="180px" />;
  if (error) return <ErrorState description="Couldn't load onboarding content." />;

  return (
    <div>
      <Level1Section items={status.level1} refetch={refetch} />
      <Level2Section items={status.level2} refetch={refetch} />
      <MeetingsSection />
    </div>
  );
}
