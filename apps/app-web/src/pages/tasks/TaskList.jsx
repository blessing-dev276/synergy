import { Fragment, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeContentAssignment, submitContentEvidence } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// Shown for a bare task flagged requires_admin_approval — self-attesting is
// blocked server-side for these (see complete_content_assignment,
// supabase/migrations/0033_milestones_and_evidence_review.sql), so this is
// the only way to mark one done: write-up now, file attachments later.
function EvidenceForm({ task, onSubmitted }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await submitContentEvidence(task.id, text.trim(), []);
      toast.success("Evidence submitted for review.");
      setText("");
      onSubmitted();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit evidence.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <textarea rows={3} placeholder="Describe what you did…" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={submit} disabled={submitting || !text.trim()}>
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
    </div>
  );
}

function TaskStatus({ task, open, onToggleOpen, onSubmitted }) {
  if (task.isDone) {
    return <span className="badge badge-success">Completed</span>;
  }
  if (task.contentType !== "bare") {
    return (
      <span className="badge badge-neutral" title="Completes automatically once the linked training/assignment is done">
        In progress
      </span>
    );
  }
  if (task.requiresAdminApproval) {
    if (task.evidenceStatus === "submitted") {
      return <span className="badge badge-info">Pending review</span>;
    }
    if (task.evidenceStatus === "needs_revision") {
      return (
        <button type="button" className="badge badge-warning" onClick={onToggleOpen}>
          {open ? "Cancel" : "Resubmit"}
        </button>
      );
    }
    return (
      <button type="button" className="badge badge-neutral" onClick={onToggleOpen}>
        {open ? "Cancel" : "Submit evidence"}
      </button>
    );
  }
  return (
    <button type="button" className="badge badge-neutral" onClick={() => onSubmitted(task)}>
      Mark done
    </button>
  );
}

export default function TaskList() {
  const { user } = useAuth();
  const toast = useToast();
  const [openTaskId, setOpenTaskId] = useState(null);

  // get_my_content_assignments: current stage's stage-wide content plus
  // this member's own individual assignments, each with isDone already
  // resolved server-side (see supabase/migrations/0028_content_model_functions.sql)
  // — replaces the old direct `tasks`/`task_completions` table queries.
  const { loading, error, data: tasks, refetch } = useSupabaseQuery(
    () => user && supabase.rpc("get_my_content_assignments", { p_uid: user.id }),
    [user?.id],
  );

  // One-way, same as lesson completion (LessonViewer.jsx) — always goes
  // through the complete_content_assignment RPC so dependency/linked-course/
  // linked-assignment rules are enforced server-side, not just in this UI.
  const markComplete = async (task) => {
    try {
      await completeContentAssignment(task.id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't complete that task.");
    }
  };

  return (
    <div>
      <h1>Tasks</h1>
      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load your tasks." />}
      {!loading && !error && (!tasks || tasks.length === 0) && <EmptyState icon="✅" title="No tasks assigned" />}
      {tasks && tasks.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Type</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: "13px", color: "var(--slate)" }}>{task.description}</div>
                      {task.evidenceStatus === "needs_revision" && (
                        <div style={{ fontSize: "12.5px", color: "var(--warning)", marginTop: "4px" }}>
                          An admin asked for a revision — check your notifications for details.
                        </div>
                      )}
                    </td>
                    <td>
                      {task.taskType?.replace("_", " ") ?? "—"}
                      {task.xpReward > 0 && ` · ${task.xpReward} XP`}
                      {!task.isRequired && " · optional"}
                    </td>
                    <td>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</td>
                    <td>
                      <TaskStatus
                        task={task}
                        open={openTaskId === task.id}
                        onToggleOpen={() => setOpenTaskId((prev) => (prev === task.id ? null : task.id))}
                        onSubmitted={markComplete}
                      />
                    </td>
                  </tr>
                  {openTaskId === task.id && (
                    <tr>
                      <td colSpan={4}>
                        <EvidenceForm task={task} onSubmitted={() => { setOpenTaskId(null); refetch(); }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
