import { Fragment, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import {
  completeContentAssignment,
  submitContentEvidence,
  completeBusinessPathPlacement,
  submitBusinessPathEvidence,
} from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// Shown for a bare task flagged requires_admin_approval — self-attesting is
// blocked server-side for these (see complete_content_assignment /
// complete_business_path_placement), so this is the only way to mark one
// done: write-up now, file attachments later. task.source (see TaskList
// below) decides which RPC pair to call — 'individual' rows are the
// untouched per-member ad-hoc task feature (content_assignments/
// content_evidence_submissions); 'business_path' rows are stage/track
// content from the Business Path rebuild (business_path_placements/
// business_path_evidence_submissions), a separate table so the two
// features can't collide.
function EvidenceForm({ task, onSubmitted }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      if (task.source === "business_path") {
        await submitBusinessPathEvidence(task.id, text.trim(), []);
      } else {
        await submitContentEvidence(task.id, text.trim(), []);
      }
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
  const [view, setView] = useState("today");

  // "All tasks" merges two independent sources client-side:
  // get_my_content_assignments (the untouched individual/ad-hoc task
  // feature reachable from MemberDetail.jsx's Activities panel, simplified
  // server-side to individual-only now that stage/track content moved out)
  // and get_my_business_path_placements (this member's current stage's
  // stage/track content). Each row is stamped with which endpoint it came
  // from so markComplete/EvidenceForm below can call the matching RPC pair
  // — the two features intentionally live in separate tables post-rebuild,
  // so there's no server-side row to disambiguate them by itself.
  const { loading: loadingAll, error: errorAll, data: allTasks, refetch: refetchAll } = useSupabaseQuery(
    () =>
      user &&
      view === "all" &&
      Promise.all([
        supabase.rpc("get_my_content_assignments", { p_uid: user.id }),
        supabase.rpc("get_my_business_path_placements", { p_uid: user.id }),
      ]).then(([individual, businessPath]) => {
        if (individual.error) return { data: null, error: individual.error };
        if (businessPath.error) return { data: null, error: businessPath.error };
        return {
          data: [
            ...(individual.data ?? []).map((t) => ({ ...t, source: "individual" })),
            ...(businessPath.data ?? []).map((t) => ({ ...t, source: "business_path" })),
          ],
          error: null,
        };
      }),
    [user?.id, view],
  );

  // Today's fixed daily selection (see get_or_generate_daily_tasks) already
  // merges both sources server-side and tags each row with `source` itself
  // — same row shape as the two calls above either way, so it reuses
  // TaskStatus/EvidenceForm as-is.
  const { loading: loadingToday, error: errorToday, data: todayTasks, refetch: refetchToday } = useSupabaseQuery(
    () => user && view === "today" && supabase.rpc("get_or_generate_daily_tasks", { p_uid: user.id }),
    [user?.id, view],
  );

  const loading = view === "today" ? loadingToday : loadingAll;
  const error = view === "today" ? errorToday : errorAll;
  const tasks = view === "today" ? todayTasks : allTasks;
  const refetch = view === "today" ? refetchToday : refetchAll;

  // One-way, same as lesson completion (LessonViewer.jsx) — always goes
  // through an RPC so dependency/linked-course/linked-assignment rules are
  // enforced server-side, not just in this UI. task.source decides which
  // RPC pair (see EvidenceForm above).
  const markComplete = async (task) => {
    try {
      if (task.source === "business_path") {
        await completeBusinessPathPlacement(task.id);
      } else {
        await completeContentAssignment(task.id);
      }
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't complete that task.");
    }
  };

  return (
    <div>
      <h1>Tasks</h1>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button type="button" className={`btn ${view === "today" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("today")}>
          Today
        </button>
        <button type="button" className={`btn ${view === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("all")}>
          All tasks
        </button>
      </div>
      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load your tasks." />}
      {!loading && !error && (!tasks || tasks.length === 0) && (
        <EmptyState icon="✅" title={view === "today" ? "Nothing assigned for today" : "No tasks assigned"} />
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
