import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

function toDateInputValue(dueDate) {
  if (!dueDate) return "";
  return new Date(dueDate).toISOString().slice(0, 10);
}

function AssignmentFields({ initial, onSubmit, onCancel, submitLabel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(initial?.due_date));
  const [maxScore, setMaxScore] = useState(initial?.max_score ?? 100);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      title: title.trim(),
      instructions: instructions.trim(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      max_score: Number(maxScore) || 100,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="activity-new-form">
      <input className="inline-edit-field" placeholder="Assignment title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" placeholder="Instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      <div className="activity-edit-row">
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          Due date
          <input type="date" className="inline-edit-field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: "150px" }} />
        </label>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          Max score
          <input type="number" min={1} className="inline-edit-field" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} style={{ width: "70px" }} />
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function AssignmentRow({ assignment, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const togglePublished = async () => {
    const { error } = await supabase.from("assignments").update({ published: !assignment.published }).eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't update publish state.");
      return;
    }
    onChanged();
  };

  const handleSave = async (fields) => {
    const { error } = await supabase.from("assignments").update(fields).eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Assignment updated.");
    setEditing(false);
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete assignment "${assignment.title}"? Any member submissions for it will be removed too.`)) return;
    const { error } = await supabase.from("assignments").delete().eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't delete that assignment.");
      return;
    }
    toast.success("Assignment deleted.");
    onChanged();
  };

  if (editing) {
    return (
      <div className="manage-row" style={{ display: "block" }}>
        <AssignmentFields initial={assignment} onSubmit={handleSave} onCancel={() => setEditing(false)} submitLabel="Save" />
      </div>
    );
  }

  return (
    <div className="manage-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-title">{assignment.title}</div>
        <div className="row-meta">
          {assignment.due_date ? `Due ${new Date(assignment.due_date).toLocaleDateString()}` : "No due date"} · max {assignment.max_score} pts
        </div>
      </div>
      <button type="button" className={`badge ${assignment.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished}>
        {assignment.published ? "Published" : "Draft"}
      </button>
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function AssignmentBuilder({ courseId }) {
  const toast = useToast();
  const [showNew, setShowNew] = useState(false);

  const { data: assignments, refetch } = useSupabaseQuery(
    () => supabase.from("assignments").select("*").eq("course_id", courseId).order("due_date", { ascending: true, nullsFirst: false }),
    [courseId],
  );

  const handleCreate = async (fields) => {
    const { error } = await supabase.from("assignments").insert({ ...fields, course_id: courseId, published: false });
    if (error) {
      toast.error("Couldn't create that assignment.");
      return;
    }
    toast.success("Assignment created (draft).");
    setShowNew(false);
    refetch();
  };

  return (
    <div>
      {(!assignments || assignments.length === 0) && !showNew && <EmptyState icon={<Icon name="clipboard" size={24} />} title="No assignments for this course yet" />}

      {assignments?.map((a) => (
        <AssignmentRow key={a.id} assignment={a} onChanged={refetch} />
      ))}

      {showNew ? (
        <AssignmentFields onSubmit={handleCreate} onCancel={() => setShowNew(false)} submitLabel="Create assignment" />
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setShowNew(true)} style={{ marginTop: "8px" }}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          New assignment
        </button>
      )}
    </div>
  );
}
