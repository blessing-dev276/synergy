import { useState } from "react";
import { useToast } from "../state/Toast.jsx";
import { submitCoursework } from "../../lib/rpc.js";
import Modal from "../Modal.jsx";

// Shared by ClassPlayer.jsx (a class's assignment item) and TaskList.jsx
// (an assignment-type Tasks step) -- same coursework_submissions RPC either
// way, just a different entry point into it. `assignment` and `existing`
// are always camelCase here (the shape both get_my_class_progress and
// get_my_task_flow already return), even though ClassPlayer's own source
// is a raw nested-select row -- it normalizes before passing in.
export default function SubmitAssignmentModal({ open, onClose, assignment, existing, onSubmitted }) {
  const toast = useToast();
  const [note, setNote] = useState(existing?.note ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await submitCoursework(assignment.id, note, link);
      toast.success("Submitted for review.");
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={assignment?.title} size="sm">
      <form onSubmit={submit}>
        {assignment?.instructions && <p style={{ color: "var(--slate)", fontSize: "13.5px" }}>{assignment.instructions}</p>}
        {assignment?.referenceLink && (
          <a href={assignment.referenceLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13.5px" }}>
            Reference link ↗
          </a>
        )}
        {assignment?.requireNote && (
          <div className="field" style={{ marginTop: "12px" }}>
            <label htmlFor="asg-note">Note</label>
            <textarea id="asg-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        {assignment?.requireLink && (
          <div className="field">
            <label htmlFor="asg-submit-link">Link</label>
            <input id="asg-submit-link" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Submitting…" : existing ? "Resubmit" : "Submit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
