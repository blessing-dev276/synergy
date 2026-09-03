import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
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

// Short, static blurbs for the overview cards -- copy, not data, so this
// isn't "fake content" the way an invented lesson/stat would be.
const SECTION_DESCRIPTION = {
  nm_business: "Learn the business, products, prospecting, team building, and leadership.",
  skill_set: "Build a marketable skill and learn how to turn it into freelance income.",
  mind_training: "Build the mindset, discipline, and confidence to perform effectively.",
  personal_development: "Books, podcasts, videos, and resources to help you grow.",
};

// ================= Continue Learning =================
// enrollments (0001) is kept accurate automatically by the
// on_lesson_progress_write -> recompute_enrollment trigger (0003) on every
// lesson open/completion -- completed_lessons_count/total_lessons_count/
// progress_percent/last_accessed_lesson_id are already real, live numbers,
// no separate progress computation needed here.
function useContinueLearning(uid) {
  const { loading, data: enrollment } = useSupabaseQuery(
    () =>
      uid &&
      supabase
        .from("enrollments")
        .select("*")
        .eq("uid", uid)
        .eq("status", "in_progress")
        .order("last_accessed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    [uid],
  );

  // Resolves the lesson's module_id so "Continue" can deep-link straight
  // back into it -- enrollments doesn't denormalize that far.
  const { data: lastLesson } = useSupabaseQuery(
    () =>
      enrollment?.last_accessed_lesson_id &&
      supabase.from("lessons").select("module_id").eq("id", enrollment.last_accessed_lesson_id).maybeSingle(),
    [enrollment?.last_accessed_lesson_id],
  );

  return { loading, enrollment, moduleId: lastLesson?.module_id };
}

function ContinueLearningCard({ uid }) {
  const { loading, enrollment, moduleId } = useContinueLearning(uid);

  if (loading) return <Skeleton variant="card" height="120px" style={{ marginBottom: "24px" }} />;

  if (!enrollment) {
    return (
      <div className="card-elevated" style={{ marginBottom: "24px" }}>
        <div className="card-title">Start Your Learning Journey</div>
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          Choose a learning path below and start building your skills.
        </p>
      </div>
    );
  }

  const continueTo =
    enrollment.path_id && moduleId
      ? `/learning/${enrollment.path_id}/${enrollment.course_id}/${moduleId}/${enrollment.last_accessed_lesson_id}`
      : enrollment.path_id
        ? `/learning/${enrollment.path_id}/${enrollment.course_id}`
        : null;

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "10px" }}>
        Continue Learning
      </div>
      <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>{enrollment.course_title}</div>
      <div className="progress-bar" style={{ marginBottom: "8px" }}>
        <div className="progress-bar-fill" style={{ width: `${enrollment.progress_percent}%` }} />
      </div>
      <p className="row-meta" style={{ marginBottom: "16px" }}>
        {enrollment.completed_lessons_count} of {enrollment.total_lessons_count} lessons · {enrollment.progress_percent}% complete
      </p>
      {continueTo && (
        <Link to={continueTo} className="btn btn-primary">
          Continue Learning
        </Link>
      )}
    </div>
  );
}

// ================= Your Learning Paths (overview) =================
// One real progress figure per section, each from the same source of truth
// its own tab already uses -- enrollments for Business Basics/Freelancing
// (both plain courses/lessons), get_my_mind_training_paths' totals for
// Mind Training. Personal Development has no per-member "read" tracking at
// all (PersonalDevelopmentLibrary.jsx is browse-only), so its card shows a
// real resource count instead of inventing a completion percent.
function sectionProgress(key, { enrollments, pathSectionById, mindTrainingPaths, pdResourceCount }) {
  if (key === "mind_training") {
    const totalItems = (mindTrainingPaths ?? []).reduce((sum, p) => sum + (p.totalItems ?? 0), 0);
    const completedItems = (mindTrainingPaths ?? []).reduce((sum, p) => sum + (p.completedItems ?? 0), 0);
    if (totalItems === 0) return null;
    return { percent: Math.round((completedItems / totalItems) * 100), detail: `${completedItems} of ${totalItems} items` };
  }
  if (key === "personal_development") {
    if (pdResourceCount == null) return null;
    return { detail: `${pdResourceCount} resource${pdResourceCount === 1 ? "" : "s"} available` };
  }
  const rows = (enrollments ?? []).filter((e) => pathSectionById.get(e.path_id) === key);
  if (rows.length === 0) return null;
  const completed = rows.reduce((sum, e) => sum + (e.completed_lessons_count ?? 0), 0);
  const total = rows.reduce((sum, e) => sum + (e.total_lessons_count ?? 0), 0);
  if (total === 0) return null;
  return { percent: Math.round((completed / total) * 100), detail: `${completed} of ${total} lessons` };
}

function LearningPathOverviewCard({ section, progress, active, onSelect }) {
  return (
    <button
      type="button"
      className={`card-elevated ${active ? "is-open" : ""}`}
      style={{ textAlign: "left", cursor: "pointer", width: "100%" }}
      onClick={onSelect}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {progress?.percent != null ? (
          <ProgressRing percent={progress.percent} size={48} strokeWidth={4.5} />
        ) : (
          <span className="icon-badge" style={{ width: "48px", height: "48px", flexShrink: 0 }}>
            <Icon name={section.icon} size={19} />
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            {section.label}
          </div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            {progress?.detail ?? "Not started yet"}
          </p>
        </div>
      </div>
      <p style={{ fontSize: "13px", color: "var(--slate)", marginTop: "12px", marginBottom: 0 }}>{SECTION_DESCRIPTION[section.key]}</p>
    </button>
  );
}

// Mind Training's own tab body: get_my_mind_training_paths (0067) returns
// progress per path, not a course count -- a different card shape from the
// other two tabs' (courseCount badge), so it's its own small component
// rather than shoehorned into the shared render branch below. Data is
// fetched once at the PathList level now (the overview card above needs it
// regardless of which tab is active), passed down here instead of fetched
// a second time.
function MindTrainingPaths({ loading, error, paths }) {
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
// to Business Basics.
function initialSectionFor(pathname) {
  if (pathname.startsWith("/learning/personal-development")) return "personal_development";
  if (pathname.startsWith("/learning/mind-training")) return "mind_training";
  return "nm_business";
}

export default function PathList() {
  const location = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const [section, setSection] = useState(() => initialSectionFor(location.pathname));
  const [choosingId, setChoosingId] = useState(null);

  // Unconditional now (not gated behind the tab being active): the overview
  // grid above the tabs needs Mind Training's and every course-backed
  // section's real totals regardless of which one is currently open.
  const { loading, error, data: allPaths, refetch } = useSupabaseQuery(() => supabase.rpc("get_learning_paths"), []);
  const { loading: loadingMindTraining, error: mindTrainingError, data: mindTrainingPaths } = useSupabaseQuery(
    () => supabase.rpc("get_my_mind_training_paths"),
    [],
  );
  const { data: enrollments } = useSupabaseQuery(
    () => user && supabase.from("enrollments").select("*").eq("uid", user.id),
    [user?.id],
  );
  // A plain id select rather than a head-count query -- useSupabaseQuery's
  // {data, error} contract has no slot for Postgrest's separate `count`
  // field, and pd_resources is small enough that fetching ids to .length
  // costs nothing.
  const { data: pdResources } = useSupabaseQuery(() => supabase.from("pd_resources").select("id").eq("published", true), []);
  const pdResourceCount = pdResources?.length;

  const isCustomTab = section === "mind_training" || section === "personal_development";
  const paths = allPaths?.filter((p) => p.section === section);
  const activeSection = SECTIONS.find((s) => s.key === section);
  const pathSectionById = new Map((allPaths ?? []).map((p) => [p.id, p.section]));

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
          <h1>Learning Hub</h1>
          <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>
            Build the skills, knowledge, and mindset you need to grow your business and yourself.
          </p>

          <ContinueLearningCard uid={user?.id} />

          <div className="card-title" style={{ marginBottom: "12px" }}>
            Your Learning Paths
          </div>
          <div className="grid grid-2" style={{ marginBottom: "28px" }}>
            {SECTIONS.map((s) => (
              <LearningPathOverviewCard
                key={s.key}
                section={s}
                active={section === s.key}
                onSelect={() => setSection(s.key)}
                progress={sectionProgress(s.key, { enrollments, pathSectionById, mindTrainingPaths, pdResourceCount })}
              />
            ))}
          </div>
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
      {section === "mind_training" && <MindTrainingPaths loading={loadingMindTraining} error={mindTrainingError} paths={mindTrainingPaths} />}

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
