import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

// lesson_progress (lesson-based courses) + course_progress (standalone
// resource courses, 0080) -- the same two tables the member's own Learning
// Hub writes to, just read here instead of aggregated anywhere new.
export default function LearningSection({ member }) {
  const { loading, data: lessons } = useSupabaseQuery(
    () => supabase.from("lesson_progress").select("lesson_id, course_id, status").eq("uid", member.id),
    [member.id],
  );
  const { data: resourceCourses } = useSupabaseQuery(
    () => supabase.from("course_progress").select("course_id").eq("uid", member.id),
    [member.id],
  );

  if (loading) return <Skeleton variant="card" height="80px" />;

  const rows = lessons ?? [];
  const completedLessons = rows.filter((r) => r.status === "completed");
  const coursesTouched = new Set([...rows.map((r) => r.course_id), ...(resourceCourses ?? []).map((r) => r.course_id)]);

  if (completedLessons.length === 0 && coursesTouched.size === 0) {
    return <EmptyState icon={<Icon name="book" size={24} />} title="No learning activity yet" />;
  }

  return (
    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
      <div>
        <div className="row-meta">Lessons completed</div>
        <div className="stat-tile-value" style={{ fontSize: "20px" }}>{completedLessons.length}</div>
      </div>
      <div>
        <div className="row-meta">Courses engaged</div>
        <div className="stat-tile-value" style={{ fontSize: "20px" }}>{coursesTouched.size}</div>
      </div>
    </div>
  );
}
