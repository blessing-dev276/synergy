import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

// Same activity_log table AdminDashboard.jsx's "Recent activity" reads
// system-wide -- filtered to this one member's own actions instead of
// everyone's, so evaluation evidence never drifts from the one real log
// the rest of the app already writes to.
const ACTION_ICON = {
  task_completed: "check-square",
  content_assignment_completed: "check-square",
  assignment_submitted: "folder",
  assignment_graded: "folder",
  orientation_submitted: "check-square",
  earning_logged: "dollar-sign",
  freelancing_skill_unlocked: "layers",
  member_evaluated: "eye",
};

const ACTION_LABEL = {
  task_completed: "Completed a task",
  content_assignment_completed: "Completed an activity",
  assignment_submitted: "Submitted an assignment",
  assignment_graded: "Had an assignment reviewed",
  orientation_submitted: "Submitted orientation",
  earning_logged: "Logged an earning",
  freelancing_skill_unlocked: "Unlocked a new Freelancing skill",
  member_evaluated: "Was evaluated by an admin",
};

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function RecentActivity({ uid }) {
  const { loading, data: rows } = useSupabaseQuery(
    () => supabase.from("activity_log").select("*").eq("actor_uid", uid).order("created_at", { ascending: false }).limit(15),
    [uid],
  );

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="clock" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Recent Activity
      </div>

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (rows ?? []).length === 0 && <EmptyState icon={<Icon name="activity" size={22} />} title="No activity recorded yet" />}
      {!loading && (rows ?? []).length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
          {rows.map((a) => (
            <li key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px" }}>
              <span className="icon-badge" style={{ width: "30px", height: "30px", flexShrink: 0 }}>
                <Icon name={ACTION_ICON[a.action] ?? "activity"} size={13} />
              </span>
              <span style={{ flex: 1 }}>{ACTION_LABEL[a.action] ?? a.action.replaceAll("_", " ")}</span>
              <span style={{ fontSize: "12px", color: "var(--slate)", flexShrink: 0 }}>{relativeTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
