import { Fragment, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeContentAssignment, submitContentEvidence, submitRankTask } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// Rank tasks (supabase/migrations/0063_rank_tasks.sql) are a separate,
// simpler source from the individual tasks below: no evidence, just a
// checkbox, and an admin approves/rejects afterward. Kept as its own
// section rather than merged into one table — the two have different
// enough shapes (no due date/xp/type on a rank task, no recurrence on an
// individual one) that forcing a single row shape would need more
// branching than just showing them separately.
function RankTaskRow({ task, onSubmitted }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const submission = task.submission;

  const submit = async () => {
    setSubmitting(true);
    try {
      await submitRankTask(task.id);
      toast.success("Marked done — an admin will review it.");
      onSubmitted();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        {task.description && <div style={{ fontSize: "13px", color: "var(--slate)" }}>{task.description}</div>}
        {submission?.status === "rejected" && submission.reviewNote && (
          <div style={{ fontSize: "12.5px", color: "var(--warning)", marginTop: "4px" }}>{submission.reviewNote}</div>
        )}
      </td>
      <td>{task.recurrence === "daily" ? "Daily" : "One-time"}</td>
      <td>
        {(!submission || submission.status === "rejected") && (
          <button type="button" className="badge badge-neutral" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : submission ? "Resubmit" : "Mark done"}
          </button>
        )}
        {submission?.status === "pending" && <span className="badge badge-info">Pending review</span>}
        {submission?.status === "approved" && <span className="badge badge-success">Approved</span>}
      </td>
    </tr>
  );
}

function RankTasksSection() {
  const { loading, data: tasks, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_rank_tasks", {}), []);

  if (!loading && (!tasks || tasks.length === 0)) return null;

  return (
    <div style={{ marginBottom: "28px" }}>
      <div className="card-title" style={{ marginBottom: "12px" }}>
        Your Rank Tasks
      </div>
      {loading && <Skeleton variant="card" height="100px" />}
      {tasks && tasks.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Frequency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <RankTaskRow key={t.id} task={t} onSubmitted={refetch} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shown for a bare task flagged requires_admin_approval — self-attesting is
// blocked server-side for these (see complete_content_assignment), so this
// is the only way to mark one done: write-up now, file attachments later.
// Business Path v2 dropped daily tasks and stage/track placements entirely
// (see supabase/migrations/0058_business_path_v2_drop_v1.sql) -- the
// individual-task feature (content_assignments/content_evidence_submissions)
// is the only task source left, so there's no more `source` branching here.
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

  const { loading, error, data: tasks, refetch } = useSupabaseQuery(
    () => user && supabase.rpc("get_my_content_assignments", { p_uid: user.id }),
    [user?.id],
  );

  // One-way, same as lesson completion (LessonViewer.jsx) — always goes
  // through an RPC so dependency/linked-course/linked-assignment rules are
  // enforced server-side, not just in this UI.
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
      <RankTasksSection />
      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load your tasks." />}
      {!loading && !error && (!tasks || tasks.length === 0) && (
        <EmptyState icon="✅" title="No tasks assigned" />
      )}
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
