import { useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

export default function MemberProgress() {
  const { memberUid } = useParams();

  const { loading: loadingMember, data: member } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").eq("id", memberUid).single(),
    [memberUid],
  );

  const { loading: loadingEnrollments, data: enrollments } = useSupabaseQuery(
    () => supabase.from("enrollments").select("*").eq("uid", memberUid),
    [memberUid],
  );

  return (
    <div>
      {loadingMember && <Skeleton variant="text" width="200px" height="28px" />}
      {member && <h1>{member.display_name}</h1>}

      <h2 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "16px" }}>Course Progress</h2>
      {loadingEnrollments && <Skeleton variant="card" height="100px" />}
      {!loadingEnrollments && (!enrollments || enrollments.length === 0) && (
        <EmptyState icon="📚" title="No courses enrolled yet" />
      )}
      {enrollments && enrollments.length > 0 && (
        <div className="grid grid-2">
          {enrollments.map((e) => (
            <div key={e.id} className="card">
              <div className="card-title">{e.course_title}</div>
              <div className="progress-bar" style={{ margin: "10px 0" }}>
                <div className="progress-bar-fill" style={{ width: `${e.progress_percent ?? 0}%` }} />
              </div>
              <span className="badge badge-neutral">{e.progress_percent ?? 0}% complete</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
