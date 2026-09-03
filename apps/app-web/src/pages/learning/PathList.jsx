import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { chooseNextFreelancingSkill } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Icon from "../../components/Icon.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import PersonalDevelopmentLibrary from "./PersonalDevelopmentLibrary.jsx";

// Four tabs now: the original three (unchanged, still backed by
// get_learning_paths/courses) plus Mind Training's own restructured tree
// and Personal Development, the new standalone resource library (Part 18).
// "Freelancing" (renamed from "Skill Set Training") isn't a real separate
// section -- Fiverr/Upwork and friends are just ordinary skill_set paths,
// wearing that label now instead of a 5th tab.
const SECTIONS = [
  { key: "nm_business", label: "Business Basics", icon: "briefcase" },
  { key: "skill_set", label: "Freelancing", icon: "layers" },
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
      {paths.map((path, i) => {
        if (path.locked) {
          // The earliest still-incomplete level ahead of this one -- always
          // exists when locked is true (that's exactly what makes it true),
          // so this never falls back to the generic hint in practice.
          const blockedBy = paths.slice(0, i).find((p) => !p.complete);
          return (
            <div key={path.id} className="card mt-path-card mt-path-card-locked" title={blockedBy ? `Complete "${blockedBy.title}" first` : "Locked"}>
              <div className="mt-path-card-ring">
                <Icon name="lock" size={22} style={{ color: "var(--slate)" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  {path.title}
                  {path.pastRank && (
                    <span className="badge badge-success">
                      <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                      Completed
                    </span>
                  )}
                </div>
                <div className="card-subtitle" style={{ marginBottom: 0 }}>
                  {blockedBy ? `Complete "${blockedBy.title}" to unlock this level.` : "Locked"}
                </div>
              </div>
            </div>
          );
        }
        return (
          <Link key={path.id} to={`/learning/mind-training/${path.id}`} className="card mt-path-card">
            <div className="mt-path-card-ring">
              <ProgressRing percent={path.percent} size={56} strokeWidth={5} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                {path.title}
                {path.pastRank && (
                  <span className="badge badge-success">
                    <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                    Completed
                  </span>
                )}
              </div>
              <div className="card-subtitle" style={{ marginBottom: 0 }}>
                {path.description || (path.totalItems > 0 ? `${path.completedItems} of ${path.totalItems} complete` : "Not started")}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// Freelancing's own sequential lock (0095, skillLock on get_learning_paths'
// rows -- null outside skill_set, where this never renders): 'unlocked'
// behaves exactly like every other Learning Hub card always has, 'locked'
// mirrors MindTrainingPaths' own locked-card treatment above (lock icon,
// "Complete X first" hint) since it's the same "guided progression, not a
// hard boundary" idea, and 'choosable' is the one truly new state -- the
// member's current skill is done and this is one of the remaining
// candidates for what unlocks next, so the card itself is the pick action.
function FreelancingPathCard({ path, busy, onChoose }) {
  const lock = path.skillLock;

  if (!lock || lock.status === "unlocked") {
    return (
      <Link to={`/learning/${path.id}`} className="card">
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
    );
  }

  if (lock.status === "choosable") {
    return (
      <div className="card" style={{ borderColor: "var(--blue-bright)" }}>
        <div className="card-title">{path.title}</div>
        <div className="card-subtitle">{path.description}</div>
        <div style={{ marginBottom: "12px" }}>
          <span className="badge badge-info">New skill available</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onChoose(path)}>
          {busy ? "Unlocking…" : "Choose this skill"}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ opacity: 0.7 }} title={lock.blockedBy ? `Complete "${lock.blockedBy}" first` : "Locked"}>
      <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon name="lock" size={15} style={{ color: "var(--slate)" }} />
        {path.title}
      </div>
      <div className="card-subtitle" style={{ marginBottom: 0 }}>
        {lock.blockedBy ? `Complete "${lock.blockedBy}" to unlock this.` : "Locked"}
      </div>
    </div>
  );
}

// /learning/mind-training and /learning/personal-development (both also
// routed here, App.jsx) exist so a "back to this tab" link from a detail
// page lands with the right tab pre-selected, instead of always resetting
// to Freelancing.
function initialSectionFor(pathname) {
  if (pathname.startsWith("/learning/personal-development")) return "personal_development";
  if (pathname.startsWith("/learning/mind-training")) return "mind_training";
  return "nm_business";
}

export default function PathList() {
  const location = useLocation();
  const toast = useToast();
  const [section, setSection] = useState(() => initialSectionFor(location.pathname));
  const [choosingId, setChoosingId] = useState(null);
  const isCustomTab = section === "mind_training" || section === "personal_development";

  // Untouched for skill_set/nm_business -- same get_learning_paths RPC as
  // before, only skipped entirely once a custom tab is active.
  const { loading, error, data: allPaths, refetch } = useSupabaseQuery(
    () => !isCustomTab && supabase.rpc("get_learning_paths"),
    [section],
  );
  const paths = allPaths?.filter((p) => p.section === section);
  const activeSection = SECTIONS.find((s) => s.key === section);

  const chooseSkill = async (path) => {
    setChoosingId(path.id);
    try {
      await chooseNextFreelancingSkill(path.id);
      toast.success(`"${path.title}" unlocked — dive in whenever you're ready.`);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't unlock that skill.");
    } finally {
      setChoosingId(null);
    }
  };

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
                <FreelancingPathCard key={path.id} path={path} busy={choosingId === path.id} onChoose={chooseSkill} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
