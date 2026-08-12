import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
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

function slugify(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function NewStageForm({ onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("stages").insert({
      key: `${slugify(title)}-${Date.now().toString(36)}`,
      title: title.trim(),
      description: description.trim(),
      order_index: Date.now(),
      published: false,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that stage.");
      return;
    }
    setTitle("");
    setDescription("");
    toast.success("Stage created (draft).");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">
        <Icon name="plus" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        New Stage
      </div>
      <input className="inline-edit-field" required placeholder="e.g. Stage 1 — Foundation" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}

function EditStageForm({ stage, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(stage.title);
  const [description, setDescription] = useState(stage.description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("stages").update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() }).eq("id", stage.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Stage updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
      <input className="inline-edit-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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

function NewTaskForm({ stageId, trackId, memberUids, onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("practical");
  const [xpReward, setXpReward] = useState(10);
  const [isRequired, setIsRequired] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const base = {
      title: title.trim(),
      description: description.trim(),
      priority: "medium",
      created_by: user.id,
      stage_id: stageId,
      track_id: trackId,
      task_type: taskType,
      xp_reward: Number(xpReward) || 0,
      is_required: isRequired,
      requires_mentor_approval: requiresApproval,
    };

    // One task row per member currently in this stage — tasks are
    // per-member assignments in this schema (see task_completions), not a
    // template that expands automatically as members advance. Members who
    // reach this stage later won't retroactively get earlier stages' tasks
    // created this way — that gap is fine for now, flagged for later.
    const rows =
      memberUids.length > 0
        ? memberUids.map((uid) => ({ ...base, scope: "individual", assigned_to_uid: uid }))
        : [{ ...base, scope: "global", assigned_to_uid: null }];

    const { error } = await supabase.from("tasks").insert(rows);
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that task.");
      return;
    }
    setTitle("");
    setDescription("");
    toast.success(
      memberUids.length > 0 ? `Task created for ${memberUids.length} member(s).` : "Task created (no members in this stage yet).",
    );
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="activity-new-form" style={{ marginTop: "12px" }}>
      <input className="inline-edit-field" placeholder="Task title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" placeholder="Description / instructions" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="activity-edit-row">
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          XP
          <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: "60px" }} />
        </label>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
          Needs mentor approval
        </label>
      </div>
      <button type="submit" className="btn btn-secondary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Adding…" : "Add task"}
      </button>
    </form>
  );
}

function EditTaskForm({ task, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [xpReward, setXpReward] = useState(task.xp_reward);
  const [isRequired, setIsRequired] = useState(task.is_required);
  const [saving, setSaving] = useState(false);

  // Editing acts on every row sharing this title within the same
  // stage+track — a "task" here fans out to one row per member (see
  // NewTaskForm), so the card the admin sees represents the group.
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({ title: title.trim(), xp_reward: Number(xpReward) || 0, is_required: isRequired })
      .eq("stage_id", task.stage_id)
      .eq("track_id", task.track_id)
      .eq("title", task.title);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Task updated for all assigned members.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "6px", alignItems: "center", flex: 1 }}>
      <input className="inline-edit-field" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
      <input type="number" min={0} className="inline-edit-field" value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: "60px" }} />
      <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        Req.
      </label>
      <button type="submit" className="icon-btn" disabled={saving} title="Save">
        <Icon name="check" size={14} />
      </button>
      <button type="button" className="icon-btn" onClick={onCancel} title="Cancel">
        <Icon name="x" size={14} />
      </button>
    </form>
  );
}

function TrackPanel({ stage, track, attached, memberUids, onToggle }) {
  const toast = useToast();
  const [editingTitle, setEditingTitle] = useState(null);

  const { data: tasks, refetch } = useSupabaseQuery(
    () =>
      attached &&
      supabase
        .from("tasks")
        .select("id, title, task_type, xp_reward, is_required, assigned_to_uid, stage_id, track_id")
        .eq("stage_id", stage.id)
        .eq("track_id", track.id)
        .order("title"),
    [stage.id, track.id, attached],
  );

  // Same title = same task assigned to multiple members; collapse for display.
  const distinctTitles = [...new Map((tasks ?? []).map((t) => [t.title, t])).values()];

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}" for every member it's assigned to?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("stage_id", task.stage_id).eq("track_id", task.track_id).eq("title", task.title);
    if (error) {
      toast.error("Couldn't delete that task.");
      return;
    }
    toast.success("Task deleted.");
    refetch();
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "12px", padding: "14px", marginTop: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
          <span aria-hidden="true">{track.icon}</span> {track.label}
        </div>
        <button type="button" className="btn btn-secondary" onClick={onToggle}>
          {attached ? "Remove from stage" : "Add to stage"}
        </button>
      </div>

      {attached && (
        <>
          {distinctTitles.length > 0 && (
            <ul style={{ listStyle: "none", marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {distinctTitles.map((t) =>
                editingTitle === t.title ? (
                  <li key={t.title}>
                    <EditTaskForm task={t} onSaved={() => { setEditingTitle(null); refetch(); }} onCancel={() => setEditingTitle(null)} />
                  </li>
                ) : (
                  <li key={t.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
                    <div>
                      <span>{t.title}</span>{" "}
                      <span style={{ color: "var(--slate)" }}>
                        · {t.task_type.replace("_", " ")} · {t.xp_reward} XP{t.is_required ? "" : " · optional"}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingTitle(t.title)}>
                        <Icon name="pencil" size={14} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDelete(t)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          <NewTaskForm stageId={stage.id} trackId={track.id} memberUids={memberUids} onCreated={refetch} />
        </>
      )}
    </div>
  );
}

function StageBlock({ stage, tracks, memberUids, isFirst, isLast, onChanged, onReorder }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const { data: stageTracks, refetch } = useSupabaseQuery(
    () => supabase.from("stage_tracks").select("track_id").eq("stage_id", stage.id),
    [stage.id],
  );
  const attachedTrackIds = new Set((stageTracks ?? []).map((st) => st.track_id));

  const toggleTrack = async (track) => {
    if (attachedTrackIds.has(track.id)) {
      await supabase.from("stage_tracks").delete().eq("stage_id", stage.id).eq("track_id", track.id);
    } else {
      await supabase.from("stage_tracks").insert({ stage_id: stage.id, track_id: track.id });
    }
    refetch();
  };

  const togglePublished = async () => {
    await supabase.from("stages").update({ published: !stage.published }).eq("id", stage.id);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete stage "${stage.title}"? This also removes its tasks and any members' progress tied to it.`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", stage.id);
    if (error) {
      toast.error("Couldn't delete that stage.");
      return;
    }
    toast.success("Stage deleted.");
    onChanged?.();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={13} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={13} />
          </button>
        </div>

        {editing ? (
          <EditStageForm stage={stage} onSaved={() => { setEditing(false); onChanged?.(); }} onCancel={() => setEditing(false)} />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              {stage.title}
            </div>
            {stage.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginTop: "6px" }}>{stage.description}</p>}
          </div>
        )}

        {!editing && (
          <div className="row-actions" style={{ flexShrink: 0 }}>
            <button type="button" className={`badge ${stage.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished}>
              {stage.published ? "Published" : "Draft"}
            </button>
            <button type="button" className="icon-btn" title="Edit stage" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={14} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete stage" onClick={handleDelete}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>

      {tracks.map((track) => (
        <TrackPanel
          key={track.id}
          stage={stage}
          track={track}
          attached={attachedTrackIds.has(track.id)}
          memberUids={memberUids}
          onToggle={() => toggleTrack(track)}
        />
      ))}
    </div>
  );
}

export default function StageBuilder() {
  const { loading, data: stages, refetch } = useSupabaseQuery(
    () => supabase.from("stages").select("*").order("order_index", { ascending: true }),
    [],
  );
  const { data: tracks } = useSupabaseQuery(() => supabase.from("tracks").select("*").order("key"), []);

  // Members currently in each stage — used to fan a new task out to the
  // right people (see NewTaskForm's comment on why tasks aren't templates).
  const { data: journeyRows } = useSupabaseQuery(
    () => supabase.from("member_journey").select("uid, current_stage_id"),
    [],
  );
  const membersByStage = new Map();
  for (const row of journeyRows ?? []) {
    if (!membersByStage.has(row.current_stage_id)) membersByStage.set(row.current_stage_id, []);
    membersByStage.get(row.current_stage_id).push(row.uid);
  }

  const reorder = async (index, direction) => {
    if (!stages) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stages.length) return;
    const a = stages[index];
    const b = stages[targetIndex];
    await Promise.all([
      supabase.from("stages").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("stages").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetch();
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Stage Builder</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Stage → Skill / Business / Freelancing tracks → tasks. This is the whole journey every member moves through —
        set each member's current stage from their profile page.
      </p>

      <NewStageForm onCreated={refetch} />

      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && (!stages || stages.length === 0) && <EmptyState icon={<Icon name="compass" size={26} />} title="No stages yet" />}
      {tracks &&
        stages?.map((stage, i) => (
          <StageBlock
            key={stage.id}
            stage={stage}
            tracks={tracks}
            memberUids={membersByStage.get(stage.id) ?? []}
            isFirst={i === 0}
            isLast={i === stages.length - 1}
            onChanged={refetch}
            onReorder={(direction) => reorder(i, direction)}
          />
        ))}
    </div>
  );
}
