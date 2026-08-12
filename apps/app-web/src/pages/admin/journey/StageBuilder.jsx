import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
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
    <form onSubmit={submit} className="card" style={{ marginBottom: "24px" }}>
      <div className="card-title">New Stage</div>
      <div className="field">
        <label>Title</label>
        <input required placeholder="e.g. Stage 1 — Foundation" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Creating…" : "Create draft"}
      </button>
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
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
      <input
        placeholder="Task title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "8px 12px" }}
      />
      <textarea
        placeholder="Description / instructions"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "8px 12px", font: "inherit" }}
      />
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          XP
          <input
            type="number"
            min={0}
            value={xpReward}
            onChange={(e) => setXpReward(e.target.value)}
            style={{ width: "60px", padding: "4px 8px", borderRadius: "8px", border: "1px solid var(--line)" }}
          />
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

function TrackPanel({ stage, track, attached, memberUids, onToggle }) {
  const { data: tasks, refetch } = useSupabaseQuery(
    () =>
      attached &&
      supabase
        .from("tasks")
        .select("id, title, task_type, xp_reward, is_required, assigned_to_uid")
        .eq("stage_id", stage.id)
        .eq("track_id", track.id)
        .order("title"),
    [stage.id, track.id, attached],
  );

  // Same title = same task assigned to multiple members; collapse for display.
  const distinctTitles = [...new Map((tasks ?? []).map((t) => [t.title, t])).values()];

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px", marginTop: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>
          <span aria-hidden="true">{track.icon}</span> {track.label}
        </div>
        <button type="button" className="btn btn-secondary" onClick={onToggle}>
          {attached ? "Remove from stage" : "Add to stage"}
        </button>
      </div>

      {attached && (
        <>
          {distinctTitles.length > 0 && (
            <ul style={{ listStyle: "none", marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {distinctTitles.map((t) => (
                <li key={t.title} style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px" }}>
                  <span>{t.title}</span>
                  <span style={{ color: "var(--slate)" }}>
                    {t.task_type} · {t.xp_reward} XP{t.is_required ? "" : " · optional"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NewTaskForm stageId={stage.id} trackId={track.id} memberUids={memberUids} onCreated={refetch} />
        </>
      )}
    </div>
  );
}

function StageBlock({ stage, tracks, memberUids, onChanged }) {
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

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {stage.title}
        </div>
        <button
          type="button"
          className={`badge ${stage.published ? "badge-success" : "badge-warning"}`}
          onClick={togglePublished}
        >
          {stage.published ? "Published" : "Draft"}
        </button>
      </div>
      {stage.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginTop: "6px" }}>{stage.description}</p>}

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

  return (
    <div>
      <h1>Stage Builder</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>
        Stage → Skill / Business / Freelancing tracks → tasks, developed together.
      </p>

      <NewStageForm onCreated={refetch} />

      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && (!stages || stages.length === 0) && <EmptyState icon="🧭" title="No stages yet" />}
      {tracks &&
        stages?.map((stage) => (
          <StageBlock
            key={stage.id}
            stage={stage}
            tracks={tracks}
            memberUids={membersByStage.get(stage.id) ?? []}
            onChanged={refetch}
          />
        ))}
    </div>
  );
}
