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

function ProgressRing({ percent, size = 76, stroke = 7 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);

  return (
    <div className="progress-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--blue)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="progress-ring-label">{percent}%</div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { to: "/learning", icon: "📚", label: "Browse Learning" },
  { to: "/assignments", icon: "📝", label: "Assignments" },
  { to: "/tasks", icon: "✅", label: "Tasks" },
  { to: "/notifications", icon: "🔔", label: "Notifications" },
];

export default function Dashboard() {
  const { user, profile } = useAuth();

  // get_journey_overview/get_next_best_action are reads despite being RPCs
  // (progress/next-action logic must be server-authoritative, see
  // supabase/migrations/0009_journey_functions.sql) — used the same way as
  // any other useSupabaseQuery read.
  const {
    loading: loadingJourney,
    error: journeyError,
    data: journey,
  } = useSupabaseQuery(() => user && supabase.rpc("get_journey_overview", { p_uid: user.id }), [user?.id]);

  const {
    loading: loadingAction,
    error: actionError,
    data: nextAction,
  } = useSupabaseQuery(() => user && supabase.rpc("get_next_best_action", { p_uid: user.id }), [user?.id]);

  const {
    loading: loadingTasks,
    error: tasksError,
    data: tasks,
  } = useSupabaseQuery(
    () => user && supabase.from("tasks").select("*").eq("assigned_to_uid", user.id).order("due_date", { ascending: true }),
    [user?.id],
  );

  const stage = journey?.stage;
  const tracks = journey?.tracks ?? [];
  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <div className="hero-banner">
        <h1>
          {greeting()}, {firstName} 👋
        </h1>
        <p>{stage ? `Your Synergy Journey — ${stage.title}` : "You're making progress. Keep going."}</p>
      </div>

      {loadingJourney && <Skeleton variant="card" height="100px" style={{ marginTop: "24px" }} />}
      {journeyError && <ErrorState description="Couldn't load your journey." />}
      {!loadingJourney && !journeyError && !stage && (
        <div style={{ marginTop: "24px" }}>
          <EmptyState icon="🧭" title="Your journey hasn't started yet" description="Your mentor will get you set up shortly." />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="grid grid-3" style={{ marginTop: "24px", marginBottom: "24px" }}>
          {tracks.map((track) => (
            <div key={track.trackId} className="card-elevated">
              <div className="card-title">
                <span aria-hidden="true">{track.icon}</span> {track.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "10px" }}>
                <ProgressRing percent={track.progressPercent ?? 0} size={60} stroke={6} />
                <div style={{ fontSize: "13px", color: "var(--slate)" }}>
                  {track.progressPercent ?? 0}% complete
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <div className="card-elevated">
          <div className="card-title">Your Next Best Action</div>
          {loadingAction && <Skeleton variant="card" height="80px" />}
          {actionError && <ErrorState description="Couldn't load your next step." />}
          {!loadingAction && !actionError && !nextAction && (
            <EmptyState icon="🎉" title="You're all caught up" description="Check back soon for your next task." />
          )}
          {nextAction && (
            <>
              <span className="badge badge-neutral" style={{ marginBottom: "8px" }}>
                <span aria-hidden="true">{nextAction.trackIcon}</span> {nextAction.trackLabel}
              </span>
              <div style={{ fontWeight: 600, margin: "6px 0" }}>{nextAction.title}</div>
              {nextAction.description && (
                <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>{nextAction.description}</p>
              )}
              <Link to="/tasks" className="btn btn-primary">
                Continue →
              </Link>
            </>
          )}
        </div>

        <div className="card-elevated">
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

      <div className="quick-actions">
        {QUICK_ACTIONS.map((qa) => (
          <Link key={qa.to} to={qa.to} className="quick-action">
            <span className="qa-icon" aria-hidden="true">
              {qa.icon}
            </span>
            <span className="qa-label">{qa.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
