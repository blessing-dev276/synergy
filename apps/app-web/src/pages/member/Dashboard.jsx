import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, profile } = useAuth();

  const {
    loading: loadingEnrollment,
    error: enrollmentError,
    data: enrollments,
  } = useSupabaseQuery(
    () =>
      user &&
      supabase
        .from("enrollments")
        .select("*")
        .eq("uid", user.id)
        .order("last_accessed_at", { ascending: false })
        .limit(1),
    [user?.id],
  );

  const {
    loading: loadingTasks,
    error: tasksError,
    data: tasks,
  } = useSupabaseQuery(
    () => user && supabase.from("tasks").select("*").eq("assigned_to_uid", user.id).order("due_date", { ascending: true }),
    [user?.id],
  );

  const current = enrollments?.[0];

  return (
    <div>
      <h1>
        {greeting()}, {profile?.display_name?.split(" ")[0] ?? "there"} 👋
      </h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "28px" }}>
        You're making progress. Keep going.
      </p>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <div className="card">
          <div className="card-title">Continue Learning</div>
          {loadingEnrollment && <Skeleton variant="card" height="80px" />}
          {enrollmentError && <ErrorState description="Couldn't load your progress." />}
          {!loadingEnrollment && !enrollmentError && !current && (
            <EmptyState
              icon="📚"
              title="No course in progress yet"
              description="Browse the Skill, Freelancing, or Business Academy to get started."
              action={
                <Link to="/learning" className="btn btn-primary">
                  Browse Learning
                </Link>
              }
            />
          )}
          {current && (
            <>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>{current.course_title}</div>
              <div className="progress-bar" style={{ marginBottom: "8px" }}>
                <div className="progress-bar-fill" style={{ width: `${current.progress_percent ?? 0}%` }} />
              </div>
              <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "14px" }}>
                {current.progress_percent ?? 0}% complete
              </div>
              <Link to={`/learning/${current.path_id}/${current.course_id}`} className="btn btn-primary">
                Continue Learning
              </Link>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">Today's Tasks</div>
          {loadingTasks && <Skeleton variant="card" height="80px" />}
          {tasksError && <ErrorState description="Couldn't load your tasks." />}
          {!loadingTasks && !tasksError && (!tasks || tasks.length === 0) && (
            <EmptyState icon="✅" title="Nothing assigned right now" />
          )}
          {tasks && tasks.length > 0 && (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {tasks.slice(0, 5).map((task) => (
                <li key={task.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{task.title}</span>
                  <span className="badge badge-neutral">{task.priority ?? "medium"}</span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "14px" }}>
            <Link to="/tasks" className="btn btn-secondary">
              View all tasks
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
