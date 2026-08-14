import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import ContentPicker from "../../../components/ContentPicker.jsx";
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
const DEFAULT_TASK_TYPE = "practical";
const DEFAULT_XP = 10;

function slugify(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* A single-purpose "click to expand" button — used for the nested "add
   content" form, which (unlike ContentBuilder's plain title+description
   NewCourseForm) has enough fields that it's worth keeping out of the
   way until the admin actually wants it. */
function Disclosure({ label, icon = "plus", children }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary accordion-toggle-btn" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>
        <Icon name={icon} size={14} /> {label}
      </button>
    );
  }
  return children(() => setOpen(false));
}

function NewStageForm({ onCreated, onDone }) {
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
      order_index: Math.floor(Date.now() / 1000),
      published: false,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that stage.");
      return;
    }
    toast.success("Stage created (draft).");
    onCreated?.();
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">New Stage</div>
      <input className="inline-edit-field" autoFocus required placeholder="e.g. Stage 1 — Foundation" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create draft"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditStageForm({ stage, levels, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(stage.title);
  const [description, setDescription] = useState(stage.description ?? "");
  const [levelId, setLevelId] = useState(stage.level_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("stages")
      .update({ title: title.trim(), description: description.trim(), level_id: levelId || null, updated_at: new Date().toISOString() })
      .eq("id", stage.id);
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
      <select className="inline-edit-field" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
        <option value="">No level (unassigned)</option>
        {levels?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
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

// Places a content_item (existing, reused — or a brand-new bare one created
// on the spot via ContentPicker) into this stage/track. One row, not one
// per member (see supabase/migrations/0027_content_model_schema.sql) — every
// member who reaches this stage, now or later, gets it automatically.
function NewPlacementForm({ stageId, trackId, onCreated, close }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [taskType, setTaskType] = useState(DEFAULT_TASK_TYPE);
  const [xpReward, setXpReward] = useState(DEFAULT_XP);
  const [isRequired, setIsRequired] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!content) return;
    setSaving(true);

    const { error } = await supabase.from("content_assignments").insert({
      content_item_id: content.id,
      stage_id: stageId,
      track_id: trackId,
      task_type: taskType,
      xp_reward: Number(xpReward) || 0,
      is_required: isRequired,
      requires_admin_approval: requiresApproval,
      scope: "stage_track",
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't place that content.");
      return;
    }
    toast.success(`"${content.label}" placed in this stage/track.`);
    onCreated?.();
    close();
  };

  return (
    <form onSubmit={submit} className="activity-new-form" style={{ marginTop: "12px" }}>
      <ContentPicker value={content} onChange={setContent} placeholder="Search or create content for this track…" />

      {content && !showMore && (
        <button type="button" className="btn btn-secondary" onClick={() => setShowMore(true)} style={{ alignSelf: "flex-start", fontSize: "12.5px", padding: "6px 12px" }}>
          More options (type, XP, approval)
        </button>
      )}

      {content && showMore && (
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
            Needs admin approval
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving || !content} style={{ alignSelf: "flex-start" }}>
          {saving ? "Placing…" : "Place content"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Edits placement-specific settings only (xp/required/approval) — the
// content's own title/description live on content_items and are shared
// across every place it's used, so they're not editable from here.
function EditPlacementForm({ assignment, onSaved, onCancel }) {
  const toast = useToast();
  const [xpReward, setXpReward] = useState(assignment.xp_reward);
  const [isRequired, setIsRequired] = useState(assignment.is_required);
  const [requiresApproval, setRequiresApproval] = useState(assignment.requires_admin_approval);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("content_assignments")
      .update({ xp_reward: Number(xpReward) || 0, is_required: isRequired, requires_admin_approval: requiresApproval })
      .eq("id", assignment.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Placement updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 600, fontSize: "13.5px" }}>{assignment.label}</span>
      <input type="number" min={0} className="inline-edit-field" value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: "60px" }} title="XP" />
      <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        Req.
      </label>
      <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
        Approval
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

/* Small pill toggle used both for "which tracks are in this stage" and,
   below it, "which of those tracks am I looking at right now" — one
   track's content on screen at a time instead of all three stacked. */
function Chip({ active, onClick, children, tone = "neutral" }) {
  const activeStyle =
    tone === "accent"
      ? { background: "rgba(76,141,255,0.16)", borderColor: "var(--blue)", color: "var(--blue-bright)" }
      : { background: "var(--line)", borderColor: "var(--line)", color: "var(--navy)" };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        fontWeight: 600,
        padding: "6px 12px",
        borderRadius: "100px",
        border: "1px solid var(--line)",
        background: "transparent",
        color: "var(--slate)",
        cursor: "pointer",
        ...(active ? activeStyle : {}),
      }}
    >
      {children}
    </button>
  );
}

function TrackTasks({ stage, track }) {
  const { data: assignments, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("content_assignments")
        .select(
          "id, task_type, xp_reward, is_required, requires_admin_approval, order_index, content_item:content_items(id, content_type, title, course:courses(title), assignment:assignments(title))",
        )
        .eq("stage_id", stage.id)
        .eq("track_id", track.id)
        .eq("scope", "stage_track")
        .order("order_index"),
    [stage.id, track.id],
  );
  const toast = useToast();
  const [editingId, setEditingId] = useState(null);

  const rows = (assignments ?? []).map((a) => ({
    ...a,
    label: a.content_item?.title ?? a.content_item?.course?.title ?? a.content_item?.assignment?.title ?? "Untitled",
  }));

  const handleDelete = async (assignment) => {
    if (!window.confirm(`Remove "${assignment.label}" from this stage/track for everyone?`)) return;
    const { error } = await supabase.from("content_assignments").delete().eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't remove that placement.");
      return;
    }
    toast.success("Removed.");
    refetch();
  };

  return (
    <div style={{ marginTop: "14px" }}>
      {rows.length === 0 && <p style={{ fontSize: "13px", color: "var(--slate)" }}>No content placed in this track yet.</p>}
      {rows.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {rows.map((a) =>
            editingId === a.id ? (
              <li key={a.id}>
                <EditPlacementForm assignment={a} onSaved={() => { setEditingId(null); refetch(); }} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
                <div>
                  <span>{a.label}</span>{" "}
                  <span style={{ color: "var(--slate)" }}>
                    · {a.task_type.replace("_", " ")} · {a.xp_reward} XP{a.is_required ? "" : " · optional"}
                  </span>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingId(a.id)}>
                    <Icon name="pencil" size={14} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={() => handleDelete(a)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div style={{ marginTop: "12px" }}>
        <Disclosure label="Add content" icon="plus">
          {(close) => <NewPlacementForm stageId={stage.id} trackId={track.id} onCreated={refetch} close={close} />}
        </Disclosure>
      </div>
    </div>
  );
}

function StageTracks({ stage, tracks }) {
  const { data: stageTracks, refetch } = useSupabaseQuery(
    () => supabase.from("stage_tracks").select("track_id").eq("stage_id", stage.id),
    [stage.id],
  );
  const attachedTrackIds = new Set((stageTracks ?? []).map((st) => st.track_id));
  const attachedTracks = tracks.filter((t) => attachedTrackIds.has(t.id));

  const [activeTrackId, setActiveTrackId] = useState(null);
  const activeTrack = attachedTracks.find((t) => t.id === activeTrackId) ?? attachedTracks[0] ?? null;

  const toggleTrack = async (track) => {
    if (attachedTrackIds.has(track.id)) {
      await supabase.from("stage_tracks").delete().eq("stage_id", stage.id).eq("track_id", track.id);
    } else {
      await supabase.from("stage_tracks").insert({ stage_id: stage.id, track_id: track.id });
    }
    refetch();
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Tracks in this stage
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {tracks.map((track) => (
          <Chip key={track.id} active={attachedTrackIds.has(track.id)} tone="neutral" onClick={() => toggleTrack(track)}>
            <span aria-hidden="true">{track.icon}</span> {track.label}
            <Icon name={attachedTrackIds.has(track.id) ? "x" : "plus"} size={11} />
          </Chip>
        ))}
      </div>

      {attachedTracks.length > 0 && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "18px" }}>
            {attachedTracks.map((track) => (
              <Chip key={track.id} active={activeTrack?.id === track.id} tone="accent" onClick={() => setActiveTrackId(track.id)}>
                <span aria-hidden="true">{track.icon}</span> {track.label} tasks
              </Chip>
            ))}
          </div>
          {activeTrack && <TrackTasks stage={stage} track={activeTrack} />}
        </>
      )}
    </div>
  );
}

function StageRow({ stage, tracks, levels, levelLabel, memberUids, isFirst, isLast, onChanged, onReorder, expanded, onToggle }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const togglePublished = async (e) => {
    e.stopPropagation();
    await supabase.from("stages").update({ published: !stage.published }).eq("id", stage.id);
    onChanged?.();
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    const memberWarning =
      memberUids.length > 0
        ? ` ${memberUids.length} member${memberUids.length === 1 ? " is" : "s are"} currently on this stage — they'll lose their place and need to be moved to another stage.`
        : "";
    if (!window.confirm(`Delete stage "${stage.title}"? This also deletes its content placements for this stage.${memberWarning}`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", stage.id);
    if (error) {
      toast.error("Couldn't delete that stage.");
      return;
    }
    toast.success("Stage deleted.");
    onChanged?.();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div className="reorder-controls" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={13} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={13} />
          </button>
        </div>

        {editing ? (
          <EditStageForm stage={stage} levels={levels} onSaved={() => { setEditing(false); onChanged?.(); }} onCancel={() => setEditing(false)} />
        ) : (
          <button type="button" className="accordion-header" onClick={onToggle} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                {stage.title}
                <span className={`badge ${levelLabel ? "badge-neutral" : "badge-warning"}`} style={{ fontWeight: 500 }}>
                  {levelLabel ?? "No level"}
                </span>
              </div>
              {stage.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginTop: "6px" }}>{stage.description}</p>}
              {!expanded && <div className="row-meta" style={{ marginTop: "6px" }}>{tracks.length} tracks available</div>}
            </div>
            <span className="accordion-chevron">
              <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} />
            </span>
          </button>
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

      {expanded && !editing && (
        <div className="accordion-body">
          <StageTracks stage={stage} tracks={tracks} />
        </div>
      )}
    </div>
  );
}

// The 7 Development Levels are fixed rows (no add/remove — see
// supabase/migrations/0032_development_levels.sql) that Stages nest under
// via stages.level_id. Admins can edit the label/purpose/outcome copy shown
// on the member dashboard, but not the set of levels itself.
function EditLevelForm({ level, onSaved, onCancel }) {
  const toast = useToast();
  const [label, setLabel] = useState(level.label);
  const [purpose, setPurpose] = useState(level.purpose ?? "");
  const [outcome, setOutcome] = useState(level.outcome ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("levels")
      .update({ label: label.trim(), purpose: purpose.trim(), outcome: outcome.trim(), updated_at: new Date().toISOString() })
      .eq("id", level.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Level updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
      <input className="inline-edit-field" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
      <textarea className="inline-edit-field" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" />
      <textarea className="inline-edit-field" rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder={'Outcome — "I can now say…"'} />
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

function LevelsPanel({ levels, onChanged }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="card-elevated" style={{ marginBottom: "20px" }}>
      <button
        type="button"
        className="accordion-header"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%" }}
      >
        <div className="card-title" style={{ marginBottom: 0 }}>
          Development Levels
        </div>
        <span className="accordion-chevron">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>
      {!open && (
        <p style={{ color: "var(--slate)", fontSize: "13px", marginTop: "6px" }}>
          The 7 fixed levels members progress through. Stages nest under one below.
        </p>
      )}
      {open && (
        <div className="accordion-body">
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {levels?.map((level) =>
              editingId === level.id ? (
                <li key={level.id}>
                  <EditLevelForm level={level} onSaved={() => { setEditingId(null); onChanged?.(); }} onCancel={() => setEditingId(null)} />
                </li>
              ) : (
                <li key={level.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
                      {level.order_index}. {level.label}
                    </div>
                    {level.purpose && <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "2px" }}>{level.purpose}</div>}
                  </div>
                  <button type="button" className="icon-btn" title="Edit level" onClick={() => setEditingId(level.id)}>
                    <Icon name="pencil" size={14} />
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function StageBuilder() {
  const [openStageId, setOpenStageId] = useState(null);
  const [showNewStage, setShowNewStage] = useState(false);
  const { loading, data: stages, refetch } = useSupabaseQuery(
    () => supabase.from("stages").select("*").order("order_index", { ascending: true }),
    [],
  );
  const { data: tracks } = useSupabaseQuery(() => supabase.from("tracks").select("*").order("key"), []);
  const { data: levels, refetch: refetchLevels } = useSupabaseQuery(
    () => supabase.from("levels").select("*").order("order_index"),
    [],
  );
  const levelById = new Map((levels ?? []).map((l) => [l.id, l]));

  // Members currently in each stage — used only for the delete-stage
  // warning now; placing content no longer needs to know who's in a stage
  // (see NewPlacementForm — one row applies to everyone, present and future).
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
        {!showNewStage && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNewStage(true)}>
            <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            New Stage
          </button>
        )}
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Stage → Skill / Business / Freelancing tracks → content. Click a stage to open it — opening another one closes this.
      </p>

      <LevelsPanel levels={levels} onChanged={refetchLevels} />

      {showNewStage && <NewStageForm onCreated={refetch} onDone={() => setShowNewStage(false)} />}

      {loading && <Skeleton variant="card" height="80px" />}
      {!loading && (!stages || stages.length === 0) && <EmptyState icon={<Icon name="compass" size={26} />} title="No stages yet" />}
      {tracks &&
        stages?.map((stage, i) => (
          <StageRow
            key={stage.id}
            stage={stage}
            tracks={tracks}
            levels={levels}
            levelLabel={levelById.get(stage.level_id)?.label}
            memberUids={membersByStage.get(stage.id) ?? []}
            isFirst={i === 0}
            isLast={i === stages.length - 1}
            onChanged={refetch}
            onReorder={(direction) => reorder(i, direction)}
            expanded={openStageId === stage.id}
            onToggle={() => setOpenStageId((prev) => (prev === stage.id ? null : stage.id))}
          />
        ))}
    </div>
  );
}
