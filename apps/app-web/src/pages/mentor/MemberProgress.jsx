import { useParams } from "react-router-dom";
import { collection, doc, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../../firebase.js";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

export default function MemberProgress() {
  const { memberUid } = useParams();

  const memberRef = useMemo(() => doc(db, "users", memberUid), [memberUid]);
  const { loading: loadingMember, data: member } = useLiveQuery(memberRef, [memberUid]);

  const enrollmentsQuery = useMemo(
    () => query(collection(db, "enrollments"), where("uid", "==", memberUid)),
    [memberUid],
  );
  const { loading: loadingEnrollments, data: enrollments } = useLiveQuery(enrollmentsQuery, [memberUid]);

  return (
    <div>
      {loadingMember && <Skeleton variant="text" width="200px" height="28px" />}
      {member && <h1>{member.displayName}</h1>}

      <h2 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "16px" }}>Course Progress</h2>
      {loadingEnrollments && <Skeleton variant="card" height="100px" />}
      {!loadingEnrollments && (!enrollments || enrollments.length === 0) && (
        <EmptyState icon="📚" title="No courses enrolled yet" />
      )}
      {enrollments && enrollments.length > 0 && (
        <div className="grid grid-2">
          {enrollments.map((e) => (
            <div key={e.id} className="card">
              <div className="card-title">{e.courseTitle}</div>
              <div className="progress-bar" style={{ margin: "10px 0" }}>
                <div className="progress-bar-fill" style={{ width: `${e.progressPercent ?? 0}%` }} />
              </div>
              <span className="badge badge-neutral">{e.progressPercent ?? 0}% complete</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
