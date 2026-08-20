import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import PersonalDevelopmentLibrary from "./PersonalDevelopmentLibrary.jsx";

// Four tabs now: the original three (unchanged, still backed by
// get_learning_paths/courses) plus Mind Training's own restructured tree
// and Personal Development, the new standalone resource library (Part 18 --
// "Freelancing" isn't a real separate section today, Fiverr/Upwork are
// just ordinary skill_set paths, so this stays 4 tabs rather than inventing
// a 5th).
const SECTIONS = [
  { key: "skill_set", label: "Skill Set Training", icon: "layers" },
  { key: "nm_business", label: "Network Marketing Business Training", icon: "briefcase" },
  { key: "mind_training", label: "Mind Training", icon: "brain" },
  { key: "personal_development", label: "Personal Development", icon: "book" },
];

// Mind Training's own tab: get_my_mind_training_paths (0067) returns
// progress per path, not a course count -- a different card shape from the
// other two tabs' (courseCount badge), so it's its own small component
// rather than shoehorned into the shared render branch below.
function MindTrainingPaths() {
  const { loading, error, data: paths } = useSupabaseQuery(() => supabase.rpc("get_my_mind_training_paths"), []);

  if (loading) {
    return (
      <div className="grid grid-2">
        <Skeleton variant="card" height="100px" />
        <Skeleton variant="card" height="100px" />
      </div>
    );
  }
  if (error) return <ErrorState description="Couldn't load Mind Training." />;
  if (!paths || paths.length === 0) {
    return <EmptyState icon={<Icon name="brain" size={26} />} title="No Mind Training published yet" description="Check back soon." />;
  }

  return (
    <div className="grid grid-2">
      {paths.map((path) => (
        <Link key={path.id} to={`/learning/mind-training/${path.id}`} className="card mt-path-card">
          <div className="mt-path-card-ring">
            <ProgressRing percent={path.percent} size={56} strokeWidth={5} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="card-title">{path.title}</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              {path.description || (path.totalItems > 0 ? `${path.completedItems} of ${path.totalItems} complete` : "Not started")}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// /learning/mind-training and /learning/personal-development (both also
// routed here, App.jsx) exist so a "back to this tab" link from a detail
// page lands with the right tab pre-selected, instead of always resetting
// to Skill Set Training.
function initialSectionFor(pathname) {
  if (pathname.startsWith("/learning/personal-development")) return "personal_development";
  if (pathname.startsWith("/learning/mind-training")) return "mind_training";
  return "skill_set";
}

export default function PathList() {
  const location = useLocation();
  const [section, setSection] = useState(() => initialSectionFor(location.pathname));
  const isCustomTab = section === "mind_training" || section === "personal_development";

  // Untouched for skill_set/nm_business -- same get_learning_paths RPC as
  // before, only skipped entirely once a custom tab is active.
  const { loading, error, data: allPaths } = useSupabaseQuery(
    () => !isCustomTab && supabase.rpc("get_learning_paths"),
    [section],
  );
  const paths = allPaths?.filter((p) => p.section === section);
  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <div>
      {section !== "personal_development" && (
        <>
          <h1>Learning</h1>
          <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "20px" }}>
            Everything Synergy has for you, in one place — skills, the business, and mindset.
          </p>
        </>
      )}

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

      {section === "personal_development" && <PersonalDevelopmentLibrary />}
      {section === "mind_training" && <MindTrainingPaths />}

      {!isCustomTab && (
        <>
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
              {paths.map((path) => (
                <Link key={path.id} to={`/learning/${path.id}`} className="card">
                  <div className="card-title">{path.title}</div>
                  <div className="card-subtitle">{path.description}</div>
                  <span className="badge badge-neutral">{path.courseCount ?? 0} resources</span>
                  {path.completed && (
                    <span className="badge badge-success" style={{ marginLeft: "6px" }}>
                      <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                      Completed
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
