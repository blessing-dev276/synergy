import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const TRIGGER_TYPES = [
  { value: "manual", label: "Manual — admin awards it by hand" },
  { value: "content_assignment_completed", label: "A specific task is completed" },
  { value: "stage_completed", label: "Every required task in a stage is done" },
  { value: "level_completed", label: "A development level reaches 100%" },
];

function slugify(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// trigger_ref_id's meaning depends on trigger_type (content_assignments.id /
// stages.id / levels.id / unused for manual) — see supabase/migrations/
// 0033_milestones_and_evidence_review.sql. This picks the right option list.
function TriggerRefPicker({ triggerType, value, onChange, placements, stages, levels }) {
  if (triggerType === "manual") return null;
  if (triggerType === "content_assignment_completed") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Pick a task…</option>
        {placements?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.stageTitle} · {p.trackLabel} · {p.label}
          </option>
        ))}
      </select>
    );
  }
  if (triggerType === "stage_completed") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Pick a stage…</option>
        {stages?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    );
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Pick a level…</option>
      {levels?.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function MilestoneForm({ milestone, placements, stages, levels, onSaved, onCancel }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [icon, setIcon] = useState(milestone?.icon ?? "🏆");
  const [levelId, setLevelId] = useState(milestone?.level_id ?? "");
  const [triggerType, setTriggerType] = useState(milestone?.trigger_type ?? "manual");
  const [triggerRefId, setTriggerRefId] = useState(milestone?.trigger_ref_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      icon: icon.trim(),
      level_id: levelId || null,
      trigger_type: triggerType,
      trigger_ref_id: triggerType === "manual" ? null : triggerRefId || null,
    };
    const { error } = milestone
      ? await supabase.from("milestones").update(payload).eq("id", milestone.id)
      : await supabase.from("milestones").insert({ ...payload, key: `${slugify(title)}-${Date.now().toString(36)}`, created_by: user.id });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save that milestone.");
      return;
    }
    toast.success(milestone ? "Milestone updated." : "Milestone created (draft).");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">{milestone ? "Edit milestone" : "New milestone"}</div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input className="inline-edit-field" style={{ width: "60px" }} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏆" />
        <input className="inline-edit-field" style={{ flex: 1 }} required placeholder="e.g. First Sponsored Member" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className="inline-edit-field" rows={2} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <select className="inline-edit-field" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
        <option value="">Not tied to a specific level</option>
        {levels?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <select
        className="inline-edit-field"
        value={triggerType}
        onChange={(e) => {
          setTriggerType(e.target.value);
          setTriggerRefId("");
        }}
      >
        {TRIGGER_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <TriggerRefPicker triggerType={triggerType} value={triggerRefId} onChange={setTriggerRefId} placements={placements} stages={stages} levels={levels} />
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

function MilestoneRow({ milestone, levelLabel, placements, stages, levels, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const togglePublished = async () => {
    await supabase.from("milestones").update({ published: !milestone.published }).eq("id", milestone.id);
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete milestone "${milestone.title}"? Members who already earned it keep the record, but it can no longer be earned again.`)) return;
    const { error } = await supabase.from("milestones").delete().eq("id", milestone.id);
    if (error) {
      toast.error("Couldn't delete that milestone.");
      return;
    }
    toast.success("Milestone deleted.");
    onChanged();
  };

  if (editing) {
    return (
      <MilestoneForm
        milestone={milestone}
        placements={placements}
        stages={stages}
        levels={levels}
        onSaved={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="card-elevated" style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ fontSize: "22px" }}>{milestone.icon || "🏆"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "14px" }}>{milestone.title}</div>
        <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
          {TRIGGER_TYPES.find((t) => t.value === milestone.trigger_type)?.label}
          {levelLabel && ` · ${levelLabel}`}
        </div>
      </div>
      <button type="button" className={`badge ${milestone.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished}>
        {milestone.published ? "Published" : "Draft"}
      </button>
      <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
        <Icon name="pencil" size={14} />
      </button>
      <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

export default function MilestoneBuilder() {
  const [showNew, setShowNew] = useState(false);
  const { loading, data: milestones, refetch } = useSupabaseQuery(
    () => supabase.from("milestones").select("*").order("order_index"),
    [],
  );
  const { data: levels } = useSupabaseQuery(() => supabase.from("levels").select("*").order("order_index"), []);
  const { data: stages } = useSupabaseQuery(() => supabase.from("stages").select("*").order("order_index"), []);

  // Flattened "stage · track · content" options for the content_assignment_
  // completed trigger picker — same content_assignments join shape used
  // throughout Stage Builder/MemberDetail.
  const { data: rawPlacements } = useSupabaseQuery(
    () =>
      supabase
        .from("content_assignments")
        .select(
          "id, stage:stages(title), track:tracks(label), content_item:content_items(title, course:courses(title), assignment:assignments(title))",
        )
        .eq("scope", "stage_track"),
    [],
  );
  const placements = (rawPlacements ?? []).map((p) => ({
    id: p.id,
    stageTitle: p.stage?.title ?? "No stage",
    trackLabel: p.track?.label ?? "No track",
    label: p.content_item?.title ?? p.content_item?.course?.title ?? p.content_item?.assignment?.title ?? "Untitled",
  }));

  const levelById = new Map((levels ?? []).map((l) => [l.id, l]));

  return (
    <div>
      <div className="section-heading">
        <h1>Milestones</h1>
        {!showNew && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            New Milestone
          </button>
        )}
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Achievements members earn along the way. Auto-awarded ones are checked whenever the underlying task/stage/level
        changes; manual ones are awarded from a member's profile.
      </p>

      {showNew && (
        <MilestoneForm placements={placements} stages={stages} levels={levels} onSaved={() => { setShowNew(false); refetch(); }} onCancel={() => setShowNew(false)} />
      )}

      {loading && <Skeleton variant="card" height="80px" />}
      {!loading && (!milestones || milestones.length === 0) && (
        <EmptyState icon={<Icon name="award" size={26} />} title="No milestones yet" />
      )}
      {milestones?.map((m) => (
        <MilestoneRow
          key={m.id}
          milestone={m}
          levelLabel={levelById.get(m.level_id)?.label}
          placements={placements}
          stages={stages}
          levels={levels}
          onChanged={refetch}
        />
      ))}
    </div>
  );
}
