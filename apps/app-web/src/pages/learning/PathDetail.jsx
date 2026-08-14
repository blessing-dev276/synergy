import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function PathDetail() {
  const { pathId } = useParams();

  const { loading: loadingPath, data: path } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("id", pathId).single(),
    [pathId],
  );

  // get_learning_paths (0047) is the source of truth for lock state (mirrors
  // the Dashboard/PathList gate) -- fetched here too so a locked path can't
  // be opened by going straight to its URL even though PathList no longer
  // links to it.
  const { data: paths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths"), []);
  const locked = paths?.find((p) => p.id === pathId)?.locked ?? false;

  const {
    loading: loadingCourses,
    error,
    data: courses,
  } = useSupabaseQuery(
    () =>
      !locked &&
      supabase
        .from("courses")
        .select("*")
        .eq("path_id", pathId)
        .eq("published", true)
        .order("order_index", { ascending: true }),
    [pathId, locked],
  );

  return (
    <div>
      {loadingPath && <Skeleton variant="text" width="240px" height="28px" />}
      {path && (
        <>
          <h1>{path.title}</h1>
          <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>{path.description}</p>
        </>
      )}

      {locked && (
        <EmptyState icon="🔒" title="This skill is locked" description="This isn't your chosen skill — ask an admin if you'd like it changed." />
      )}
      {!locked && loadingCourses && <Skeleton variant="card" height="100px" />}
      {!locked && error && <ErrorState description="Couldn't load courses." />}
      {!locked && !loadingCourses && !error && (!courses || courses.length === 0) && (
        <EmptyState icon="📘" title="No courses published in this path yet" />
      )}
      {!locked && courses && courses.length > 0 && (
        <div className="grid grid-2">
          {courses.map((course) => (
            <Link key={course.id} to={`/learning/${pathId}/${course.id}`} className="card">
              <div className="card-title">{course.title}</div>
              <div className="card-subtitle">{course.description}</div>
              <span className="badge badge-neutral">{course.lesson_count ?? 0} lessons</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
