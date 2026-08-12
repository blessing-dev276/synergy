import { collection, doc, query, where, orderBy, setDoc, serverTimestamp } from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function TaskList() {
  const { user } = useAuth();
  const toast = useToast();

  const tasksQuery = useMemo(
    () => user && query(collection(db, "tasks"), where("assignedToUid", "==", user.uid), orderBy("dueDate", "asc")),
    [user],
  );
  const { loading, error, data: tasks } = useLiveQuery(tasksQuery, [user?.uid]);

  const completionsQuery = useMemo(
    () => user && query(collection(db, "taskCompletions"), where("uid", "==", user.uid)),
    [user],
  );
  const { data: completions } = useLiveQuery(completionsQuery, [user?.uid]);
  const completedIds = new Set((completions ?? []).filter((c) => c.completed).map((c) => c.taskId));

  const toggleComplete = async (task) => {
    try {
      await setDoc(doc(db, "taskCompletions", `${task.id}_${user.uid}`), {
        uid: user.uid,
        taskId: task.id,
        completed: !completedIds.has(task.id),
        completedAt: serverTimestamp(),
      });
    } catch {
      toast.error("Couldn't update that task.");
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
                    <td>
                      {task.dueDate
                        ? new Date(task.dueDate.seconds ? task.dueDate.seconds * 1000 : task.dueDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`badge ${done ? "badge-success" : "badge-neutral"}`}
                        onClick={() => toggleComplete(task)}
                      >
                        {done ? "Completed" : "Mark done"}
                      </button>
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
