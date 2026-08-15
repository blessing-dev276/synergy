import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";

// Same three fixed tabs as admin ContentBuilder.jsx's Learning Hub.
const SECTIONS = [
  { key: "skill_set", label: "Skill Set Training", icon: "layers" },
  { key: "nm_business", label: "Network Marketing Business Training", icon: "briefcase" },
  { key: "mind_training", label: "Mind Training", icon: "brain" },
];

export default function PathList() {
  const [section, setSection] = useState("skill_set");

  // get_learning_paths (0047, section-aware since 0049) computes `locked`
  // server-side off the same is_specialization_unlocked gate the
  // Dashboard's track cards use -- a member only has their chosen skill
  // (+ Graphics Design while Newbie) unlocked here too, instead of every
  // path being browsable. Fetched once, filtered by tab client-side --
  // it's a small catalog, no need for a per-tab round trip.
  const { loading, error, data: allPaths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths"), []);
  const paths = allPaths?.filter((p) => p.section === section);
  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <div>
      <h1>Learning</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "20px" }}>
        Everything Synergy has for you, in one place — skills, the business, and mindset.
      </p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`btn ${section === s.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSection(s.key)}
          >
            <Icon name={s.icon} size={14} style={{ verticalAlign: "-2px", marginRight: "6px" }} />
            {s.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-2">
          <Skeleton variant="card" height="140px" />
          <Skeleton variant="card" height="140px" />
        </div>
      )}
      {error && <ErrorState description="Couldn't load learning paths." />}
      {!loading && !error && (!paths || paths.length === 0) && (
        <EmptyState icon={<Icon name={activeSection.icon} size={26} />} title={`No ${activeSection.label} published yet`} description="Check back soon." />
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
                <span className="badge badge-neutral">{path.courseCount ?? 0} resources</span>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
