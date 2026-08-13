import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeContentAssignment } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function TaskList() {
  const { user } = useAuth();
  const toast = useToast();

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
                <tr key={task.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{task.title}</div>
                    <div style={{ fontSize: "13px", color: "var(--slate)" }}>{task.description}</div>
                  </td>
                  <td>
                    {task.taskType?.replace("_", " ") ?? "—"}
                    {task.xpReward > 0 && ` · ${task.xpReward} XP`}
                    {!task.isRequired && " · optional"}
                  </td>
                  <td>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</td>
                  <td>
                    {task.isDone ? (
                      <span className="badge badge-success">Completed</span>
                    ) : task.contentType !== "bare" ? (
                      <span className="badge badge-neutral" title="Completes automatically once the linked training/assignment is done">
                        In progress
                      </span>
                    ) : (
                      <button type="button" className="badge badge-neutral" onClick={() => markComplete(task)}>
                        Mark done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
