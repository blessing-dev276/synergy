import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

function riskBadge(member) {
  const lastActive = member.last_active_at ? new Date(member.last_active_at).getTime() : null;
  const daysInactive = lastActive ? (Date.now() - lastActive) / 86400000 : Infinity;
  if (daysInactive > 3) return { label: "🔴 Inactive", cls: "badge-danger" };
  if (daysInactive > 1) return { label: "🟡 Falling behind", cls: "badge-warning" };
  return { label: "🟢 Active", cls: "badge-success" };
}

export default function MentorDashboard() {
  const { user } = useAuth();

  const {
    loading: loadingAssignments,
    error,
    data: mentorAssignments,
  } = useSupabaseQuery(
    () => user && supabase.from("mentor_assignments").select("*").eq("mentor_uid", user.id).eq("active", true),
    [user?.id],
  );

  const memberUids = (mentorAssignments ?? []).map((a) => a.member_uid);

  const { loading: loadingMembers, data: members } = useSupabaseQuery(
    () => memberUids.length > 0 && supabase.from("profiles").select("*").in("id", memberUids),
    [memberUids.join(",")],
  );

  const loading = loadingAssignments || (memberUids.length > 0 && loadingMembers);

  return (
    <div>
      <h1>My Members</h1>
      {loading && <Skeleton variant="card" height="200px" />}
      {error && <ErrorState description="Couldn't load your members." />}
      {!loading && !error && memberUids.length === 0 && (
        <EmptyState icon="👥" title="No members assigned yet" description="An admin will assign members to you." />
      )}
      {!loading && members && members.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const risk = riskBadge(member);
                return (
                  <tr key={member.id}>
                    <td>{member.display_name}</td>
                    <td>
                      <span className={`badge ${risk.cls}`}>{risk.label}</span>
                    </td>
                    <td>
                      <Link to={`/mentor/members/${member.id}`} className="btn btn-secondary">
                        View progress
                      </Link>
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
