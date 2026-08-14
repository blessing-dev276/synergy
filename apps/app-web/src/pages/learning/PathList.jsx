import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";

export default function PathList() {
  // get_learning_paths (0047) computes `locked` server-side off the same
  // is_specialization_unlocked gate the Dashboard's track cards use (0038)
  // -- a member only has their chosen skill (+ Graphics Design while
  // Newbie) unlocked here too, instead of every path being browsable.
  const { loading, error, data: paths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths"), []);

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
          {paths.map((path) =>
            path.locked ? (
              <div key={path.id} className="card" style={{ opacity: 0.55, cursor: "not-allowed" }} title="Locked — this isn't your chosen skill">
                <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {path.title}
                  <Icon name="lock" size={14} />
                </div>
                <div className="card-subtitle">{path.description}</div>
                <span className="badge badge-neutral">Locked</span>
              </div>
            ) : (
              <Link key={path.id} to={`/learning/${path.id}`} className="card">
                <div className="card-title">{path.title}</div>
                <div className="card-subtitle">{path.description}</div>
                <span className="badge badge-neutral">{path.courseCount ?? 0} courses</span>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
