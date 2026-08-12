import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function PathList() {
  const { loading, error, data: paths } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("published", true).order("order_index", { ascending: true }),
    [],
  );

  return (
    <div>
      <h1>Learning</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>
        Skill Academy, Freelancing Academy, and Business Academy learning paths.
      </p>

      {loading && (
        <div className="grid grid-2">
          <Skeleton variant="card" height="140px" />
          <Skeleton variant="card" height="140px" />
        </div>
      )}
      {error && <ErrorState description="Couldn't load learning paths." />}
      {!loading && !error && (!paths || paths.length === 0) && (
        <EmptyState icon="📚" title="No learning paths published yet" description="Check back soon." />
      )}
      {paths && paths.length > 0 && (
        <div className="grid grid-2">
          {paths.map((path) => (
            <Link key={path.id} to={`/learning/${path.id}`} className="card">
              <div className="card-title">{path.title}</div>
              <div className="card-subtitle">{path.description}</div>
              <span className="badge badge-neutral">{path.course_count ?? 0} courses</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
