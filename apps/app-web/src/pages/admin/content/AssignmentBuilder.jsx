import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
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

// Same popup style as ResourceModal/ModuleModal — one modal handles both
// "New Assignment" and "Edit Assignment", switched on whether `assignment`
// is passed in, same as ResourceModal's `isEdit`. Reuses AssignmentFields
// (unchanged) as the modal's field-rendering body, since that component
// already carries every field (title/instructions/due date/max score) plus
// its own Save-or-Cancel row -- only the outer wrapper (inline card vs.
// Modal) changes here.
function AssignmentModal({ courseId, assignment, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!assignment;

  const handleSubmit = async (fields) => {
    const { error } = isEdit
      ? await supabase.from("assignments").update(fields).eq("id", assignment.id)
      : await supabase.from("assignments").insert({ ...fields, course_id: courseId, published: false });
    if (error) {
      toast.error(isEdit ? "Couldn't save changes." : "Couldn't create that assignment.");
      return;
    }
    toast.success(isEdit ? "Assignment updated." : "Assignment created (draft).");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Assignment" : "New Assignment"}>
      <AssignmentFields initial={assignment} onSubmit={handleSubmit} onCancel={onClose} submitLabel={isEdit ? "Save" : "Create assignment"} />
    </Modal>
  );
}

function AssignmentRow({ assignment, onChanged, onEdit }) {
  const toast = useToast();

  const togglePublished = async () => {
    const { error } = await supabase.from("assignments").update({ published: !assignment.published }).eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't update publish state.");
      return;
    }
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete assignment "${assignment.title}"? Any member reports for it will be removed too.`)) return;
    const { error } = await supabase.from("assignments").delete().eq("id", assignment.id);
    if (error) {
      toast.error("Couldn't delete that assignment.");
      return;
    }
    toast.success("Assignment deleted.");
    onChanged();
  };

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
        <button type="button" className="icon-btn" title="Edit" onClick={() => onEdit(assignment)}>
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
  const [assignmentModal, setAssignmentModal] = useState(null); // null closed | {} add | assignment edit

  const { data: assignments, refetch } = useSupabaseQuery(
    () => supabase.from("assignments").select("*").eq("course_id", courseId).order("due_date", { ascending: true, nullsFirst: false }),
    [courseId],
  );

  return (
    <div>
      {(!assignments || assignments.length === 0) && <EmptyState icon={<Icon name="clipboard" size={24} />} title="No assignments for this course yet" />}

      {assignments?.map((a) => (
        <AssignmentRow key={a.id} assignment={a} onChanged={refetch} onEdit={setAssignmentModal} />
      ))}

      <button type="button" className="btn btn-secondary" onClick={() => setAssignmentModal({})} style={{ marginTop: "8px" }}>
        <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
        New assignment
      </button>

      {assignmentModal && (
        <AssignmentModal
          courseId={courseId}
          assignment={assignmentModal.id ? assignmentModal : null}
          onClose={() => setAssignmentModal(null)}
          onSaved={() => {
            refetch();
            setAssignmentModal(null);
          }}
        />
      )}
    </div>
  );
}
