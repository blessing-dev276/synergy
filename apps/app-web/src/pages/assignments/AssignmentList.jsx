import { Link } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

const STATUS_BADGE = {
  submitted: "badge-neutral",
  approved: "badge-success",
  needs_revision: "badge-danger",
};

export default function AssignmentList() {
  const { user } = useAuth();

  const assignmentsQuery = useMemo(
    () => query(collection(db, "assignments"), where("published", "==", true)),
    [],
  );
  const { loading, error, data: assignments } = useLiveQuery(assignmentsQuery, []);

  const submissionsQuery = useMemo(
    () => user && query(collection(db, "assignmentSubmissions"), where("uid", "==", user.uid)),
    [user],
  );
  const { data: submissions } = useLiveQuery(submissionsQuery, [user?.uid]);

  const submissionByAssignment = new Map((submissions ?? []).map((s) => [s.assignmentId, s]));

  return (
    <div>
      <h1>Assignments</h1>
      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load assignments." />}
      {!loading && !error && (!assignments || assignments.length === 0) && (
        <EmptyState icon="📝" title="No assignments yet" />
      )}
      {assignments && assignments.length > 0 && (
        <div className="grid grid-2">
          {assignments.map((a) => {
            const submission = submissionByAssignment.get(a.id);
            return (
              <Link key={a.id} to={`/assignments/${a.id}`} className="card">
                <div className="card-title">{a.title}</div>
                <div className="card-subtitle">{a.instructions}</div>
                <span className={`badge ${STATUS_BADGE[submission?.status] ?? "badge-warning"}`}>
                  {submission?.status ?? "Not started"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
