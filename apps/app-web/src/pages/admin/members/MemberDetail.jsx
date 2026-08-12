import { useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { assignMentor, unassignMentor, setMemberStage } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

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

function MentorPanel({ member, onChanged }) {
  const toast = useToast();
  const [selectedMentor, setSelectedMentor] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: mentors } = useSupabaseQuery(() => supabase.from("profiles").select("*").eq("role", "mentor"), []);
  const { data: currentMentor } = useSupabaseQuery(
    () => member?.mentor_uid && supabase.from("profiles").select("*").eq("id", member.mentor_uid).single(),
    [member?.mentor_uid],
  );

  const handleAssign = async () => {
    if (!selectedMentor) return;
    setSaving(true);
    try {
      await assignMentor(selectedMentor, member.id);
      toast.success("Mentor assigned.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't assign mentor.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    try {
      await unassignMentor(member.mentor_uid, member.id);
      toast.success("Mentor unassigned.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't unassign mentor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="users" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Mentor
      </div>
      {currentMentor ? (
        <>
          <p style={{ marginBottom: "12px", fontSize: "14px" }}>Currently assigned to <strong>{currentMentor.display_name}</strong>.</p>
          <button type="button" className="btn btn-danger" onClick={handleUnassign} disabled={saving}>
            Unassign mentor
          </button>
        </>
      ) : (
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={selectedMentor} onChange={(e) => setSelectedMentor(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "10px", padding: "9px 12px" }}>
            <option value="">Choose a mentor…</option>
            {mentors?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={saving || !selectedMentor}>
            Assign
          </button>
        </div>
      )}
    </div>
  );
}

function StagePanel({ member, journey, stages, onChanged }) {
  const toast = useToast();
  const [selectedStage, setSelectedStage] = useState(journey?.current_stage_id ?? "");
  const [saving, setSaving] = useState(false);

  const currentStage = stages?.find((s) => s.id === journey?.current_stage_id);

  const handleSet = async () => {
    setSaving(true);
    try {
      await setMemberStage(member.id, selectedStage || null);
      toast.success("Journey stage updated.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update stage.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Journey Stage
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        Currently: <strong style={{ color: "var(--navy)" }}>{currentStage?.title ?? "Not started"}</strong>
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "10px", padding: "9px 12px" }}>
          <option value="">Not started</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={handleSet} disabled={saving || selectedStage === (journey?.current_stage_id ?? "")}>
          {saving ? "Saving…" : "Set stage"}
        </button>
      </div>
    </div>
  );
}

function EditActivityForm({ task, tracks, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [trackId, setTrackId] = useState(task.track_id ?? "");
  const [taskType, setTaskType] = useState(task.task_type ?? "practical");
  const [xpReward, setXpReward] = useState(task.xp_reward ?? 0);
  const [isRequired, setIsRequired] = useState(task.is_required ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: title.trim(),
        description: description.trim(),
        track_id: trackId || null,
        task_type: taskType,
        xp_reward: Number(xpReward) || 0,
        is_required: isRequired,
      })
      .eq("id", task.id);
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
      <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description / instructions" />
      <div className="activity-edit-row">
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stageId, setStageId] = useState(defaultStageId ?? "");
  const [trackId, setTrackId] = useState("");
  const [taskType, setTaskType] = useState("practical");
  const [xpReward, setXpReward] = useState(10);
  const [isRequired, setIsRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim(),
      scope: "individual",
      assigned_to_uid: member.id,
      stage_id: stageId || null,
      track_id: trackId || null,
      task_type: taskType,
      xp_reward: Number(xpReward) || 0,
      is_required: isRequired,
      priority: "medium",
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that activity.");
      return;
    }
    setTitle("");
    setDescription("");
    toast.success("Activity assigned to member.");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card-elevated activity-new-form">
      <div className="card-title">
        <Icon name="plus" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Assign a new activity
      </div>
      <input placeholder="Activity title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={2} placeholder="Description / instructions" value={description} onChange={(e) => setDescription(e.target.value)} />
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
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Assigning…" : "Assign activity"}
      </button>
    </form>
  );
}

function ActivitiesPanel({ member, stages, tracks, defaultStageId }) {
  const toast = useToast();
  const [editingId, setEditingId] = useState(null);

  const {
    data: activities,
    refetch,
  } = useSupabaseQuery(
    () =>
      supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to_uid", member.id)
        .order("stage_id", { ascending: true }),
    [member.id],
  );

  const stageTitle = (id) => stages?.find((s) => s.id === id)?.title ?? "No stage";
  const trackLabel = (id) => tracks?.find((t) => t.id === id)?.label ?? "No track";

  const handleDelete = async (task) => {
    if (!window.confirm(`Remove "${task.title}" from this member's journey?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
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

      {(!activities || activities.length === 0) && (
        <EmptyState icon={<Icon name="check-square" size={26} />} title="No individual activities assigned yet" />
      )}

      {activities && activities.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
          {activities.map((task) =>
            editingId === task.id ? (
              <li key={task.id}>
                <EditActivityForm task={task} tracks={tracks} onSaved={() => { setEditingId(null); refetch(); }} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={task.id} className="activity-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>{task.title}</div>
                  <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
                    {stageTitle(task.stage_id)} · {trackLabel(task.track_id)} · {task.task_type?.replace("_", " ")} · {task.xp_reward} XP
                    {!task.is_required && " · optional"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingId(task.id)}>
                    <Icon name="pencil" size={15} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDelete(task)}>
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
  const { data: journey, refetch: refetchJourney } = useSupabaseQuery(
    () => supabase.from("member_journey").select("*").eq("uid", uid).maybeSingle(),
    [uid],
  );
  const { data: stages } = useSupabaseQuery(() => supabase.from("stages").select("*").order("order_index"), []);
  const { data: tracks } = useSupabaseQuery(() => supabase.from("tracks").select("*").order("key"), []);

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!member) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
        <h1 style={{ marginBottom: 0 }}>{member.display_name || member.email}</h1>
        <span className="badge badge-neutral">{member.role}</span>
      </div>

      {member.role === "member" && (
        <>
          <div className="grid grid-2">
            <StagePanel member={member} journey={journey} stages={stages} onChanged={refetchJourney} />
            <MentorPanel member={member} onChanged={refetchMember} />
          </div>
          <ActivitiesPanel member={member} stages={stages} tracks={tracks} defaultStageId={journey?.current_stage_id} />
        </>
      )}

      {member.role === "mentor" && (
        <div className="card-elevated" style={{ maxWidth: "420px" }}>
          <p style={{ fontSize: "14px", color: "var(--slate)" }}>
            This account is a mentor. Assign members to them from the member's own detail page.
          </p>
        </div>
      )}
    </div>
  );
}
