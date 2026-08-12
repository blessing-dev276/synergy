import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeTask } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function TaskList() {
  const { user } = useAuth();
  const toast = useToast();

  const { loading, error, data: tasks } = useSupabaseQuery(
    () => user && supabase.from("tasks").select("*").eq("assigned_to_uid", user.id).order("due_date", { ascending: true }),
    [user?.id],
  );

  const { data: completions, refetch: refetchCompletions } = useSupabaseQuery(
    () => user && supabase.from("task_completions").select("*").eq("uid", user.id),
    [user?.id],
  );
  const completedIds = new Set((completions ?? []).filter((c) => c.completed).map((c) => c.task_id));

  // One-way, same as lesson completion (LessonViewer.jsx) — always goes
  // through the complete_task RPC so dependency/linked-course/linked-
  // assignment rules are enforced server-side, not just in this UI.
  const markComplete = async (task) => {
    try {
      await completeTask(task.id);
      refetchCompletions();
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
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const done = completedIds.has(task.id);
                return (
                  <tr key={task.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: "13px", color: "var(--slate)" }}>{task.description}</div>
                    </td>
                    <td>{task.priority ?? "—"}</td>
                    <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}</td>
                    <td>
                      {done ? (
                        <span className="badge badge-success">Completed</span>
                      ) : (
                        <button type="button" className="badge badge-neutral" onClick={() => markComplete(task)}>
                          Mark done
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
