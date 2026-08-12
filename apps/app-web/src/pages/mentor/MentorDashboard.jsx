import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

function riskBadge(member) {
  const lastActive = member.lastActiveAt?.seconds ? member.lastActiveAt.seconds * 1000 : null;
  const daysInactive = lastActive ? (Date.now() - lastActive) / 86400000 : Infinity;
  if (daysInactive > 3) return { label: "🔴 Inactive", cls: "badge-danger" };
  if (daysInactive > 1) return { label: "🟡 Falling behind", cls: "badge-warning" };
  return { label: "🟢 Active", cls: "badge-success" };
}

export default function MentorDashboard() {
  const { user } = useAuth();

  const assignmentsQuery = useMemo(
    () => user && query(collection(db, "mentorAssignments"), where("mentorUid", "==", user.uid), where("active", "==", true)),
    [user],
  );
  const { loading: loadingAssignments, error, data: mentorAssignments } = useLiveQuery(assignmentsQuery, [user?.uid]);

  const memberUids = (mentorAssignments ?? []).map((a) => a.memberUid);

  const membersQuery = useMemo(
    () => memberUids.length > 0 && query(collection(db, "users"), where("__name__", "in", memberUids.slice(0, 30))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberUids.join(",")],
  );
  const { loading: loadingMembers, data: members } = useLiveQuery(membersQuery, [memberUids.join(",")]);

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
                    <td>{member.displayName}</td>
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
