import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import {
  assignSponsor,
  setMemberStatus,
  adminListRanks,
  adminSetMemberRank,
  adminSetParticipationPath,
  reviewParticipationPathRequest,
} from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import SponsorPicker from "../../../components/SponsorPicker.jsx";
import ContentPicker from "../../../components/ContentPicker.jsx";
import Modal from "../../../components/Modal.jsx";

const TASK_TYPES = [
  "learning",
  "practical",
  "business_activity",
  "freelancing_activity",
  "reflection",
  "submission",
  "attendance",
  "milestone",
];

function initials(name) {
  return (
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Everything a member sees/edits on their own Profile page (photo, bio,
// interests, why's, goals, sponsor) — the admin side had none of it
// visible, only the journey/sponsor/activity management panels.
function ProfilePanel({ member }) {
  const [signedPhotoUrl, setSignedPhotoUrl] = useState(null);

  const { data: sponsor } = useSupabaseQuery(
    () => member.sponsor_uid && supabase.from("profiles").select("id, display_name").eq("id", member.sponsor_uid).single(),
    [member.sponsor_uid],
  );

  const { data: whys } = useSupabaseQuery(
    () => supabase.from("member_whys").select("*").eq("uid", member.id).order("order_index"),
    [member.id],
  );
  const { data: goals } = useSupabaseQuery(
    () => supabase.from("member_goals").select("*, target_rank:ranks(title)").eq("uid", member.id).maybeSingle(),
    [member.id],
  );

  useEffect(() => {
    if (!member.photo_url) {
      setSignedPhotoUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("profile-photos")
      .createSignedUrl(member.photo_url, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedPhotoUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [member.photo_url]);

  const interests = member.onboarding?.interests ?? [];
  const avatarStyle = {
    width: 64,
    height: 64,
    borderRadius: "50%",
    objectFit: "cover",
    background: "var(--gradient-navy)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: "22px",
    flexShrink: 0,
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "16px" }}>
        {signedPhotoUrl ? (
          <img src={signedPhotoUrl} alt="" style={{ ...avatarStyle, background: "var(--line)" }} />
        ) : (
          <div style={avatarStyle}>{initials(member.display_name)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ marginBottom: "4px" }}>
            Profile
          </div>
          {member.bio ? (
            <p style={{ fontSize: "13.5px", color: "var(--slate)" }}>{member.bio}</p>
          ) : (
            <p style={{ fontSize: "13.5px", color: "var(--slate)", fontStyle: "italic" }}>No bio yet.</p>
          )}
        </div>
      </div>

      {interests.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div className="row-meta" style={{ marginBottom: "6px" }}>
            Interested in
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {interests.map((i) => (
              <span key={i} className="badge badge-neutral">
                {i}
              </span>
            ))}
          </div>
        </div>
      )}

      {whys?.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div className="row-meta" style={{ marginBottom: "6px" }}>
            Why's for joining ({whys.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13.5px", display: "flex", flexDirection: "column", gap: "3px" }}>
            {whys.map((w) => (
              <li key={w.id}>{w.text}</li>
            ))}
          </ul>
        </div>
      )}

      {goals && (goals.monthly_income_goal || goals.team_size_goal || goals.target_rank || goals.reward_tools?.length > 0) && (
        <div style={{ marginTop: "16px" }}>
          <div className="row-meta" style={{ marginBottom: "6px" }}>
            This month's goals
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "6px", columnGap: "16px", fontSize: "13.5px" }}>
            {goals.monthly_income_goal != null && (
              <>
                <dt style={{ color: "var(--slate)" }}>Income target</dt>
                <dd>${goals.monthly_income_goal}</dd>
              </>
            )}
            {goals.team_size_goal != null && (
              <>
                <dt style={{ color: "var(--slate)" }}>Team size target</dt>
                <dd>{goals.team_size_goal}</dd>
              </>
            )}
            {goals.target_rank && (
              <>
                <dt style={{ color: "var(--slate)" }}>Target rank</dt>
                <dd>{goals.target_rank.title}</dd>
              </>
            )}
            {goals.reward_tools?.length > 0 && (
              <>
                <dt style={{ color: "var(--slate)" }}>Reward tools</dt>
                <dd>{goals.reward_tools.join(", ")}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "8px", columnGap: "16px", fontSize: "13.5px", marginTop: "16px" }}>
        <dt style={{ color: "var(--slate)" }}>Email</dt>
        <dd>{member.email}</dd>
        <dt style={{ color: "var(--slate)" }}>WhatsApp</dt>
        <dd>{member.whatsapp_number || "—"}</dd>
        <dt style={{ color: "var(--slate)" }}>Member since</dt>
        <dd>{member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}</dd>
        <dt style={{ color: "var(--slate)" }}>Sponsor</dt>
        <dd>{sponsor ? sponsor.display_name : "—"}</dd>
      </dl>
    </div>
  );
}

// Sponsor is a relationship every member can hold (see
// supabase/migrations/0018_role_simplification_and_sponsor_schema.sql), not
// a role — this panel lets an admin assign a first sponsor or reassign an
// existing one. Reassignment is logged (assign_sponsor writes activity_log)
// and can affect downline calculations once a compensation plan is
// configured, so the copy below says so up front rather than only in an
// audit trail nobody reads day-to-day.
function SponsorPanel({ member, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState({ selected: null, claimedName: "" });
  const [saving, setSaving] = useState(false);

  const { data: currentSponsor, refetch: refetchCurrentSponsor } = useSupabaseQuery(
    () => member?.sponsor_uid && supabase.from("profiles").select("*").eq("id", member.sponsor_uid).single(),
    [member?.sponsor_uid],
  );

  const openModal = () => {
    setPicked({ selected: null, claimedName: "" });
    setOpen(true);
  };

  const handleAssign = async () => {
    if (!picked.selected) return;
    setSaving(true);
    try {
      await assignSponsor(member.id, picked.selected.id);
      toast.success("Sponsor updated.");
      setOpen(false);
      refetchCurrentSponsor();
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update sponsor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="network" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Sponsor
      </div>
      <p style={{ marginBottom: "14px", fontSize: "14px" }}>
        {currentSponsor ? (
          <>
            Currently sponsored by <strong>{currentSponsor.display_name}</strong>.
          </>
        ) : (
          <span style={{ color: "var(--slate)" }}>No sponsor assigned yet.</span>
        )}
      </p>
      <button type="button" className="btn btn-secondary" onClick={openModal}>
        {currentSponsor ? "Change sponsor" : "Assign sponsor"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={currentSponsor ? "Change sponsor" : "Assign sponsor"}>
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "12px" }}>
          {currentSponsor ? "Reassigning" : "Assigning"} a sponsor is logged and can affect downline calculations
          once a compensation plan is configured.
        </p>
        <SponsorPicker value={picked} onChange={(v) => setPicked({ selected: v.selected, claimedName: "" })} />
        {picked.selected && (
          <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={saving} style={{ marginTop: "14px" }}>
            {saving ? "Saving…" : currentSponsor ? "Reassign sponsor" : "Assign sponsor"}
          </button>
        )}
      </Modal>
    </div>
  );
}

const STATUS_BADGE = {
  pending: "badge-info",
  active: "badge-success",
  suspended: "badge-warning",
  removed: "badge-danger",
};

function OrientationReview({ member }) {
  const { data: attempt } = useSupabaseQuery(
    () => supabase.from("orientation_attempts").select("*").eq("uid", member.id).maybeSingle(),
    [member.id],
  );
  const { data: questions } = useSupabaseQuery(
    () => supabase.from("orientation_questions").select("*").order("order_index"),
    [],
  );
  const { data: options } = useSupabaseQuery(() => supabase.from("orientation_options").select("*"), []);

  if (!attempt) {
    return (
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        Hasn't submitted the orientation yet.
      </p>
    );
  }

  const givenFor = (questionId) => attempt.answers?.find((a) => a.questionId === questionId)?.optionId;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span className="qa-icon" style={{ width: "36px", height: "36px" }}>
          <Icon name="award" size={16} />
        </span>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>
            {attempt.score}% <span style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--slate)" }}>({attempt.total} questions · submitted {new Date(attempt.submitted_at).toLocaleDateString()})</span>
          </div>
        </div>
      </div>
      {questions && options && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {questions.map((q) => {
            const qOptions = options.filter((o) => o.question_id === q.id);
            const givenId = givenFor(q.id);
            const given = qOptions.find((o) => o.id === givenId);
            const correct = given?.is_correct === true;
            return (
              <li key={q.id} style={{ fontSize: "13px" }}>
                <span style={{ color: correct ? "var(--success)" : "var(--danger)", marginRight: "6px" }}>
                  <Icon name={correct ? "check" : "x"} size={12} style={{ verticalAlign: "-2px" }} />
                </span>
                <strong>{q.prompt}</strong> — {given?.text ?? "no answer"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPanel({ member, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const status = member.status ?? "active";

  const changeStatus = async (newStatus) => {
    if (newStatus === "suspended" && !window.confirm(`Suspend ${member.display_name || member.email}? They'll stay logged in but won't be able to take part in any training, tasks, or assignments until reinstated.`)) return;
    if (newStatus === "removed" && status === "pending" && !window.confirm(`Reject ${member.display_name || member.email}'s application? Their profile is archived and hidden from the member list. This can be undone.`)) return;
    if (newStatus === "removed" && status !== "pending" && !window.confirm(`Remove ${member.display_name || member.email}? Their profile is archived and hidden from the member list, and they lose access to the program. Their data is kept, not deleted, and this can be undone.`)) return;
    setSaving(true);
    try {
      await setMemberStatus(member.id, newStatus);
      toast.success(
        newStatus === "active"
          ? status === "pending" ? "Member approved." : "Member reinstated."
          : newStatus === "suspended" ? "Member suspended." : status === "pending" ? "Application rejected." : "Member removed (archived).",
      );
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "16px" }}>
      <div className="card-title">
        <Icon name="ban" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Account status
      </div>
      <p style={{ marginBottom: "12px", fontSize: "14px" }}>
        Currently <span className={`badge ${STATUS_BADGE[status] ?? "badge-neutral"}`}>{status}</span>
      </p>

      {status === "pending" && <OrientationReview member={member} />}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {status === "pending" && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => changeStatus("active")} disabled={saving}>
              <Icon name="check" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Approve
            </button>
            <button type="button" className="btn btn-danger" onClick={() => changeStatus("removed")} disabled={saving}>
              <Icon name="x" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Reject
            </button>
          </>
        )}
        {status !== "pending" && status !== "suspended" && (
          <button type="button" className="btn btn-secondary" onClick={() => changeStatus("suspended")} disabled={saving}>
            <Icon name="ban" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Suspend
          </button>
        )}
        {status !== "pending" && status !== "active" && (
          <button type="button" className="btn btn-secondary" onClick={() => changeStatus("active")} disabled={saving}>
            <Icon name="rotate-ccw" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Reinstate
          </button>
        )}
        {status !== "pending" && status !== "removed" && (
          <button type="button" className="btn btn-danger" onClick={() => changeStatus("removed")} disabled={saving}>
            <Icon name="user-x" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Remove member
          </button>
        )}
      </div>
    </div>
  );
}

// Business Path v2: a member has exactly one admin-assigned rank
// (profiles.rank_id), no fixed ladder -- ranks are whatever an admin has
// created in the Rank Builder (admin_list_ranks, see supabase/migrations/
// 0059_business_path_v2_schema.sql / 0060_business_path_v2_functions.sql).
function RankPanel({ member, ranks, onChanged }) {
  const toast = useToast();
  const [selectedRank, setSelectedRank] = useState(member.rank_id ?? "");
  const [saving, setSaving] = useState(false);

  const currentRank = ranks?.find((r) => r.id === member.rank_id);

  const handleSet = async () => {
    setSaving(true);
    try {
      await adminSetMemberRank(member.id, selectedRank || null);
      toast.success("Rank updated.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update rank.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Rank
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        Currently: <strong style={{ color: "var(--navy)" }}>{currentRank?.title ?? "No rank assigned"}</strong>
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <select value={selectedRank} onChange={(e) => setSelectedRank(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "10px", padding: "9px 12px" }}>
          <option value="">No rank</option>
          {ranks?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={handleSet} disabled={saving || selectedRank === (member.rank_id ?? "")}>
          {saving ? "Saving…" : "Set rank"}
        </button>
      </div>
    </div>
  );
}

const PATH_LABEL = {
  full: "Skill + Freelancing + Network Marketing",
  network_marketing_only: "Network Marketing only",
};

// Participation path is admin-controlled by product decision (a member can
// ask, but only an admin's decision actually hides Skill/Freelancing content
// -- see supabase/migrations/0043_participation_path.sql) -- this panel is
// both the "set it directly" control and the pending-request review UI.
function ParticipationPathPanel({ member, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const { data: request, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("participation_path_requests")
        .select("*")
        .eq("uid", member.id)
        .eq("status", "pending")
        .maybeSingle(),
    [member.id],
  );

  const setPath = async (path) => {
    if (path === member.participation_path) return;
    setSaving(true);
    try {
      await adminSetParticipationPath(member.id, path);
      toast.success("Participation path updated.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update participation path.");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (decision) => {
    setSaving(true);
    try {
      await reviewParticipationPathRequest(request.id, decision, "");
      toast.success(decision === "approved" ? "Request approved." : "Request declined.");
      refetch();
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="target" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Participation Path
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        Currently: <strong style={{ color: "var(--navy)" }}>{PATH_LABEL[member.participation_path] ?? "Full"}</strong>
      </p>

      {request && (
        <div style={{ padding: "12px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--line)", marginBottom: "12px" }}>
          <p style={{ fontSize: "13px", marginBottom: request.reason ? "6px" : "10px" }}>
            Asked to switch to <strong>{PATH_LABEL[request.requested_path]}</strong>.
          </p>
          {request.reason && <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "10px" }}>"{request.reason}"</p>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" onClick={() => decide("approved")} disabled={saving}>
              Approve
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => decide("rejected")} disabled={saving}>
              Decline
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setPath("full")}
          disabled={saving || member.participation_path === "full"}
        >
          Set: Full program
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setPath("network_marketing_only")}
          disabled={saving || member.participation_path === "network_marketing_only"}
        >
          Set: Network Marketing only
        </button>
      </div>
    </div>
  );
}

// Edits placement-specific settings only (stage/track/type/xp/required) —
// the content's own title/description live on content_items and are shared
// across every place it's used, so they're not editable from here.
function EditActivityForm({ assignment, stages, tracks, onSaved, onCancel }) {
  const toast = useToast();
  const [stageId, setStageId] = useState(assignment.stage_id ?? "");
  const [trackId, setTrackId] = useState(assignment.track_id ?? "");
  const [taskType, setTaskType] = useState(assignment.task_type ?? "practical");
  const [xpReward, setXpReward] = useState(assignment.xp_reward ?? 0);
  const [isRequired, setIsRequired] = useState(assignment.is_required ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("content_assignments")
      .update({
        stage_id: stageId || null,
        track_id: trackId || null,
        task_type: taskType,
        xp_reward: Number(xpReward) || 0,
        is_required: isRequired,
      })
      .eq("id", assignment.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Activity updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="activity-edit-form">
      <div style={{ fontWeight: 600, fontSize: "14px" }}>{assignment.label}</div>
      <div className="activity-edit-row">
        <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">No stage</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">No track</option>
          {tracks?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: "70px" }} title="XP reward" />
        <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewActivityForm({ member, stages, tracks, defaultStageId, onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState(null);
  const [stageId, setStageId] = useState(defaultStageId ?? "");
  const [trackId, setTrackId] = useState("");
  const [taskType, setTaskType] = useState("practical");
  const [xpReward, setXpReward] = useState(10);
  const [isRequired, setIsRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!content) return;
    setSaving(true);
    const { error } = await supabase.from("content_assignments").insert({
      content_item_id: content.id,
      scope: "individual",
      assigned_to_uid: member.id,
      stage_id: stageId || null,
      track_id: trackId || null,
      task_type: taskType,
      xp_reward: Number(xpReward) || 0,
      is_required: isRequired,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that activity.");
      return;
    }
    setContent(null);
    toast.success("Activity assigned to member.");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card-elevated activity-new-form">
      <div className="card-title">
        <Icon name="plus" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Assign a new activity
      </div>
      <ContentPicker value={content} onChange={setContent} placeholder="Search or create content for this member…" />
      <div className="activity-edit-row">
        <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">No stage</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">No track</option>
          {tracks?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: "70px" }} title="XP reward" />
        <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving || !content} style={{ alignSelf: "flex-start" }}>
        {saving ? "Assigning…" : "Assign activity"}
      </button>
    </form>
  );
}

function ActivitiesPanel({ member, stages, tracks, defaultStageId }) {
  const toast = useToast();
  const [editingId, setEditingId] = useState(null);

  const {
    data: assignments,
    refetch,
  } = useSupabaseQuery(
    () =>
      supabase
        .from("content_assignments")
        .select(
          "id, stage_id, track_id, task_type, xp_reward, is_required, content_item:content_items(id, title, course:courses(title), assignment:assignments(title))",
        )
        .eq("scope", "individual")
        .eq("assigned_to_uid", member.id)
        .order("stage_id", { ascending: true }),
    [member.id],
  );

  const activities = (assignments ?? []).map((a) => ({
    ...a,
    label: a.content_item?.title ?? a.content_item?.course?.title ?? a.content_item?.assignment?.title ?? "Untitled",
  }));

  const stageTitle = (id) => stages?.find((s) => s.id === id)?.title ?? "No stage";
  const trackLabel = (id) => tracks?.find((t) => t.id === id)?.label ?? "No track";

  const handleDelete = async (assignment) => {
    if (!window.confirm(`Remove "${assignment.label}" from this member's journey?`)) return;
    const { error } = await supabase.from("content_assignments").delete().eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't delete that activity.");
      return;
    }
    toast.success("Activity removed.");
    refetch();
  };

  return (
    <div className="card-elevated" style={{ marginTop: "20px" }}>
      <div className="card-title">
        <Icon name="check-square" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        This member's activities
      </div>

      {activities.length === 0 && (
        <EmptyState icon={<Icon name="check-square" size={26} />} title="No individual activities assigned yet" />
      )}

      {activities.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
          {activities.map((assignment) =>
            editingId === assignment.id ? (
              <li key={assignment.id}>
                <EditActivityForm
                  assignment={assignment}
                  stages={stages}
                  tracks={tracks}
                  onSaved={() => { setEditingId(null); refetch(); }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={assignment.id} className="activity-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>{assignment.label}</div>
                  <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
                    {stageTitle(assignment.stage_id)} · {trackLabel(assignment.track_id)} · {assignment.task_type?.replace("_", " ")} · {assignment.xp_reward} XP
                    {!assignment.is_required && " · optional"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingId(assignment.id)}>
                    <Icon name="pencil" size={15} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDelete(assignment)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <NewActivityForm member={member} stages={stages} tracks={tracks} defaultStageId={defaultStageId} onCreated={refetch} />
    </div>
  );
}

export default function MemberDetail() {
  const { uid } = useParams();

  const { loading, data: member, refetch: refetchMember } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").eq("id", uid).single(),
    [uid],
  );
  const { data: ranks } = useSupabaseQuery(() => adminListRanks(), []);

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!member) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
        <h1 style={{ marginBottom: 0 }}>{member.display_name || member.email}</h1>
        <span className="badge badge-neutral">{member.role}</span>
      </div>

      <ProfilePanel member={member} />

      {member.role !== "admin" && <StatusPanel member={member} onChanged={refetchMember} />}

      {member.role === "member" && (
        <>
          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <RankPanel member={member} ranks={ranks} onChanged={refetchMember} />
            <SponsorPanel member={member} onChanged={refetchMember} />
          </div>
          <div style={{ marginTop: "16px" }}>
            <ParticipationPathPanel member={member} onChanged={refetchMember} />
          </div>
          <ActivitiesPanel member={member} />
        </>
      )}
    </div>
  );
}
