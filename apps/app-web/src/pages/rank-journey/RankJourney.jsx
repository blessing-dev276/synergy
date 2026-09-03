import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { categorizeRankTask } from "../../lib/useTodayTasks.js";
import { rankTaskActionLink } from "../../lib/rankTaskLinks.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeBusinessPathMilestone, uncompleteBusinessPathMilestone } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// learning_paths.section -> the same display names used across Goals.jsx/
// Dashboard.jsx/useTodayTasks.js -- kept in sync with those, not reinvented.
const SECTION_LABEL = { skill_set: "Freelancing", nm_business: "Network Marketing", mind_training: "Personal Development" };
const CATEGORY_ORDER = ["Network Marketing", "Freelancing", "Personal Development", "Team", "Learning", "General"];

function pathHref(path) {
  return path.section === "mind_training" ? `/learning/mind-training/${path.id}` : `/learning/${path.id}`;
}

// Real, per-member rank_tasks for the CALLER'S OWN current rank only --
// get_my_rank_tasks (0094/0100) is scoped to profiles.rank_id server-side,
// so this is never available for a rank that isn't currently theirs (see
// migration 0100's own comment on why that's not faked here either).
function useMyRankTasks() {
  const { loading, error, data, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_rank_tasks", {}), []);
  const items = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: categorizeRankTask(t),
    recurrence: t.recurrence,
    proxyType: t.proxyType,
    manual: t.proxyType === "manual",
    done: Boolean(t.submission) && t.submission.status !== "rejected",
    pending: t.submission?.status === "pending",
    actionLink: rankTaskActionLink(t.proxyType, t.proxyPathId),
    progress: t.progress,
    proxyThreshold: t.proxyThreshold,
  }));
  return { loading, error, items, refetch };
}

// Merged in from the old, separate Business Path page (0104) -- a rank's
// milestones (real per-member completion, auto-detected or self-checked),
// same "works for any rank" posture as learning paths above.
function useRankMilestones(rankId) {
  const { loading, data, refetch } = useSupabaseQuery(() => rankId && supabase.rpc("get_rank_milestones", { p_rank_id: rankId }), [rankId]);
  return {
    loading,
    stagePurpose: data?.stagePurpose ?? null,
    stageDescription: data?.stageDescription ?? null,
    milestones: data?.milestones ?? [],
    refetch,
  };
}

// ================= Current Rank card =================
function CurrentRankCard({ currentRank, nextRank, currentIndex, totalRanks, paths, pathsLoading, pendingRequest, onViewRequirements }) {
  const total = paths.length;
  const completed = paths.filter((p) => p.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="card-elevated rank-current-card" style={{ marginBottom: "24px" }}>
      <div className="row-meta">Current Rank</div>
      <div className="rank-current-title">{currentRank.title}</div>
      <div className="rank-current-level">
        Level {currentIndex + 1} of {totalRanks}
      </div>

      {pendingRequest && nextRank && (
        <div className="rank-pending-banner">
          <Icon name="clock" size={14} />
          Your promotion to <strong>{nextRank.title}</strong> is pending admin review.
        </div>
      )}

      {!nextRank ? (
        <p className="card-subtitle" style={{ marginTop: "12px", marginBottom: 0 }}>
          🏆 You've reached the top of the Rank Journey.
        </p>
      ) : (
        <>
          <div className="rank-progress-header">
            <span className="row-meta">Progress to next rank</span>
            {!pathsLoading && <span className="rank-progress-percent">{percent}%</span>}
          </div>
          {pathsLoading ? (
            <Skeleton variant="text" width="100%" height="8px" style={{ marginBottom: "10px" }} />
          ) : (
            <div className="progress-bar" style={{ marginBottom: "10px" }}>
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          )}
          <p className="card-subtitle">
            {total > 0
              ? `${completed} of ${total} requirement${total === 1 ? "" : "s"} completed`
              : "No learning requirements configured for this rank yet."}
          </p>

          <div className="rank-next-row">
            <span className="row-meta">Next Rank</span>
            <span className="rank-next-title">{nextRank.title}</span>
          </div>

          <button type="button" className="btn btn-secondary" onClick={onViewRequirements}>
            View Requirements
          </button>
        </>
      )}
    </div>
  );
}

// ================= Your Next Step =================
function NextStepSection({ currentRank, nextRank, paths, tasks, milestones, pendingRequest }) {
  if (!nextRank) return null;

  const pathSteps = paths.map((p) => ({ key: `path-${p.id}`, label: p.title, done: p.completed, to: pathHref(p) }));
  const taskSteps = tasks.map((t) => ({
    key: `task-${t.id}`,
    label: t.title,
    done: t.done,
    pending: t.pending,
    to: t.actionLink?.to ?? "/tasks",
  }));
  const milestoneSteps = milestones.map((m) => ({ key: `milestone-${m.id}`, label: m.title, done: m.done, to: m.linkTo ?? "/rank-journey" }));
  const allSteps = [...pathSteps, ...taskSteps, ...milestoneSteps];
  const incomplete = allSteps.filter((s) => !s.done);
  // Focused, not exhaustive -- a rank can easily have 15+ real requirements
  // (a big Mind Training path alone), and this section answers "what
  // should I do right now", not "list everything". The full set is what
  // the Requirements card below is for.
  const MAX_VISIBLE = 5;
  const steps = incomplete.slice(0, MAX_VISIBLE);
  const remaining = incomplete.length - steps.length;
  const firstIncomplete = steps[0];

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">Your Next Step</div>
      {allSteps.length === 0 ? (
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          No requirements are configured for {currentRank.title} yet — check back once they're set up.
        </p>
      ) : incomplete.length === 0 ? (
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          {pendingRequest
            ? "Everything's done — your promotion is awaiting admin review."
            : "Everything here is complete — your promotion will be filed automatically."}
        </p>
      ) : (
        <>
          <p className="card-subtitle">
            You're currently a {currentRank.title}. To reach {nextRank.title}, focus on:
          </p>
          <ul className="next-step-list">
            {steps.map((s) => (
              <li key={s.key} className="next-step-row">
                <span className="today-task-check" aria-hidden="true" />
                <span style={{ flex: 1 }}>{s.label}</span>
                {s.pending && <span className="badge badge-info">Pending review</span>}
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <p className="card-subtitle" style={{ marginBottom: "14px" }}>
              +{remaining} more requirement{remaining === 1 ? "" : "s"} — see the full list below.
            </p>
          )}
          <Link to={firstIncomplete.to} className="btn btn-primary">
            Continue
          </Link>
        </>
      )}
    </div>
  );
}

// ================= Roadmap =================
function RankRoadmap({ ranks, currentIndex, selectedRankId, onSelect }) {
  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        Rank Journey
      </div>
      <p className="card-subtitle">Tap any rank to see what it takes to get there.</p>
      <div className="rank-roadmap">
        {ranks.map((r, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "locked";
          return (
            <button
              key={r.id}
              type="button"
              className={`rank-roadmap-step ${state}${selectedRankId === r.id ? " is-selected" : ""}`}
              onClick={() => onSelect(r.id)}
            >
              <span className="stepper-step" aria-hidden="true">
                {state === "done" ? <Icon name="check" size={16} /> : state === "locked" ? <Icon name="lock" size={14} /> : i + 1}
              </span>
              <span className="rank-roadmap-label">
                {r.title}
                {state === "current" && <span className="rank-roadmap-tag">Current</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ================= Requirements for the selected rank =================
function RankRequirementsSection({
  rank,
  state,
  paths,
  pathsLoading,
  tasks,
  tasksLoading,
  stagePurpose,
  stageDescription,
  milestones,
  milestonesLoading,
  onToggleMilestone,
  milestoneBusyId,
}) {
  const total = paths.length;
  const completed = paths.filter((p) => p.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isCurrent = state === "current";

  const groupedTasks = CATEGORY_ORDER.map((cat) => ({ category: cat, items: tasks.filter((t) => t.category === cat) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="card-elevated" id="rank-requirements" style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "2px" }}>
        {rank.title}
      </div>
      {state === "done" && <p className="card-subtitle">✓ You've already achieved this rank.</p>}
      {state === "locked" && (
        <p className="card-subtitle">
          This rank isn't active for you yet — but the requirements below are real, so you can get a head start any time.
        </p>
      )}
      {stagePurpose && (
        <div className="rank-requirement-group" style={{ marginTop: state === "current" ? 0 : "12px" }}>
          <div className="row-meta" style={{ marginBottom: "4px" }}>
            Your Objective
          </div>
          <p style={{ fontSize: "14px", color: "var(--navy-soft)", marginBottom: stageDescription ? "4px" : 0 }}>{stagePurpose}</p>
          {stageDescription && <p style={{ fontSize: "13px", color: "var(--slate)" }}>{stageDescription}</p>}
        </div>
      )}

      {total > 0 && (
        <>
          <p className="card-subtitle" style={{ marginBottom: "8px" }}>
            Progress: {completed} / {total} requirement{total === 1 ? "" : "s"} completed
          </p>
          <div className="progress-bar" style={{ marginBottom: "20px" }}>
            <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {pathsLoading ? (
        <Skeleton variant="card" height="80px" />
      ) : total === 0 ? (
        <p className="card-subtitle" style={{ marginBottom: isCurrent ? "20px" : 0 }}>
          No learning requirements configured for this rank yet.
        </p>
      ) : (
        <div className="rank-requirement-group">
          <div className="rank-requirement-group-title">
            <Icon name="book" size={13} />
            Learning
          </div>
          <ul className="rank-requirement-list">
            {paths.map((p) => (
              <li key={p.id} className="rank-requirement-row">
                <span className={`today-task-check${p.completed ? " done" : ""}`} aria-hidden="true">
                  {p.completed && <Icon name="check" size={11} />}
                </span>
                <span style={{ flex: 1 }}>
                  {p.title}
                  {SECTION_LABEL[p.section] && <span className="rank-requirement-tag">{SECTION_LABEL[p.section]}</span>}
                </span>
                <Link to={pathHref(p)} className="badge badge-neutral">
                  {p.completed ? "Review" : "Continue"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(milestonesLoading || milestones.length > 0) && (
        <div style={{ marginTop: "20px" }}>
          <div className="rank-requirement-group-title">
            <Icon name="target" size={13} />
            Milestones
          </div>
          {milestonesLoading ? (
            <Skeleton variant="table-row" />
          ) : (
            <ul className="rank-requirement-list">
              {milestones.map((m) => (
                <li key={m.id} className="rank-requirement-row">
                  {m.autoKey ? (
                    <span className={`today-task-check${m.done ? " done" : ""}`} aria-hidden="true">
                      {m.done && <Icon name="check" size={11} />}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`today-task-check${m.done ? " done" : ""}`}
                      onClick={() => onToggleMilestone(m)}
                      disabled={milestoneBusyId === m.id}
                      title={m.done ? "Mark not done" : "Mark done"}
                      aria-label={m.done ? `Mark "${m.title}" not done` : `Mark "${m.title}" done`}
                    >
                      {m.done && <Icon name="check" size={11} />}
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--slate)" : "inherit" }}>
                      {m.title}
                    </div>
                    {m.done && m.completedAt && (
                      <div style={{ fontSize: "11.5px", color: "var(--slate)" }}>Completed {formatDate(m.completedAt)}</div>
                    )}
                  </div>
                  {m.autoKey && (
                    <span className="badge badge-neutral" title="Tracked automatically from your real activity">
                      Auto
                    </span>
                  )}
                  {!m.done && m.linkTo && (
                    <Link to={m.linkTo} className="badge badge-neutral">
                      {m.linkLabel ?? "Open"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isCurrent && (
        <div style={{ marginTop: "20px" }}>
          <div className="rank-requirement-group-title">
            <Icon name="activity" size={13} />
            Rank Activities
          </div>
          <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "12px" }}>
            These don't gate your promotion, but they're the real day-to-day work expected at this rank.
          </p>
          {tasksLoading ? (
            <Skeleton variant="table-row" />
          ) : groupedTasks.length === 0 ? (
            <p className="card-subtitle" style={{ marginBottom: 0 }}>
              No rank activities configured yet.
            </p>
          ) : (
            groupedTasks.map((g) => (
              <div key={g.category} className="rank-requirement-group">
                <div className="rank-requirement-subcategory">{g.category}</div>
                <ul className="rank-requirement-list">
                  {g.items.map((t) => (
                    <li key={t.id} className="rank-requirement-row">
                      <span className={`today-task-check${t.done ? " done" : ""}`} aria-hidden="true">
                        {t.done && <Icon name="check" size={11} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div>{t.title}</div>
                        {t.proxyThreshold != null && (
                          <div style={{ fontSize: "12px", color: "var(--slate)" }}>
                            {t.progress ?? 0} / {t.proxyThreshold}
                          </div>
                        )}
                      </div>
                      {t.pending ? (
                        <span className="badge badge-info">Pending review</span>
                      ) : t.done ? null : t.actionLink ? (
                        <Link to={t.actionLink.to} className="badge badge-neutral">
                          {t.actionLink.label}
                        </Link>
                      ) : t.manual ? (
                        <Link to="/tasks" className="badge badge-neutral">
                          Mark done on Tasks
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function RankJourney() {
  const { profile } = useAuth();
  const [selectedRankId, setSelectedRankId] = useState(null);

  const { loading: ranksLoading, data: ranks } = useSupabaseQuery(
    () => supabase.from("ranks").select("id, title, order_index").order("order_index"),
    [],
  );
  const myTasks = useMyRankTasks();

  const currentIndex = (ranks ?? []).findIndex((r) => r.id === profile?.rank_id);
  const currentRank = currentIndex >= 0 ? ranks[currentIndex] : null;

  const activeRankId = selectedRankId ?? (currentRank ? currentRank.id : ranks?.[0]?.id);
  const activeIndex = (ranks ?? []).findIndex((r) => r.id === activeRankId);
  const activeRank = activeIndex >= 0 ? ranks[activeIndex] : null;
  const activeState = activeIndex < 0 ? null : activeIndex < currentIndex ? "done" : activeIndex === currentIndex ? "current" : "locked";

  // Two independent fetches on purpose: the Current Rank card + Next Step
  // always need the member's actual current rank's progress, regardless of
  // which rank the roadmap below is previewing -- collapsing these into
  // one would make the top card go blank the moment someone clicks a
  // different rank to look at its requirements.
  const { loading: currentPathsLoading, data: currentPathsData } = useSupabaseQuery(
    () => currentRank && supabase.rpc("get_rank_learning_paths", { p_rank_id: currentRank.id }),
    [currentRank?.id],
  );
  const currentPaths = currentPathsData ?? [];

  const { loading: selectedPathsLoading, data: selectedPathsData } = useSupabaseQuery(
    () => activeRankId && supabase.rpc("get_rank_learning_paths", { p_rank_id: activeRankId }),
    [activeRankId],
  );
  const selectedPaths = selectedPathsData ?? [];

  const { data: pendingRequests } = useSupabaseQuery(
    () => profile?.id && supabase.from("rank_advancement_requests").select("id, to_rank_id").eq("uid", profile.id).eq("status", "pending").maybeSingle(),
    [profile?.id],
  );

  // Same split as the two paths fetches above, same reason: the top card's
  // "what's next" can't go blank just because the roadmap below is
  // previewing a different rank.
  const currentMilestones = useRankMilestones(currentRank?.id);
  const selectedMilestones = useRankMilestones(activeRankId);

  const toast = useToast();
  const [milestoneBusyId, setMilestoneBusyId] = useState(null);
  const toggleMilestone = async (milestone) => {
    setMilestoneBusyId(milestone.id);
    try {
      if (milestone.done) {
        await uncompleteBusinessPathMilestone(milestone.id);
      } else {
        await completeBusinessPathMilestone(milestone.id);
      }
      currentMilestones.refetch();
      selectedMilestones.refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setMilestoneBusyId(null);
    }
  };

  const nextRank = currentIndex >= 0 && ranks ? (ranks[currentIndex + 1] ?? null) : null;

  const scrollToRequirements = () => {
    document.getElementById("rank-requirements")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (ranksLoading) {
    return (
      <div>
        <div className="section-heading">
          <h1>Rank Journey</h1>
        </div>
        <Skeleton variant="card" height="260px" />
      </div>
    );
  }

  return (
    <div>
      <div className="section-heading">
        <h1>Rank Journey</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "22px" }}>
        Your path from getting started to becoming a leader.
      </p>

      {!ranks || ranks.length === 0 ? (
        <EmptyState
          icon={<Icon name="compass" size={26} />}
          title="Ranks haven't been configured yet"
          description="Check back soon — your admin is still setting up the rank structure."
        />
      ) : !currentRank ? (
        <EmptyState
          icon={<Icon name="compass" size={26} />}
          title="Your Rank Journey Starts Here"
          description="Complete your onboarding and first activities to begin your journey."
          action={
            <Link to="/learning" className="btn btn-primary" style={{ marginTop: "14px" }}>
              Start Learning
            </Link>
          }
        />
      ) : (
        <>
          <CurrentRankCard
            currentRank={currentRank}
            nextRank={nextRank}
            currentIndex={currentIndex}
            totalRanks={ranks.length}
            paths={currentPaths}
            pathsLoading={currentPathsLoading}
            pendingRequest={Boolean(pendingRequests)}
            onViewRequirements={() => {
              setSelectedRankId(currentRank.id);
              scrollToRequirements();
            }}
          />

          <NextStepSection
            currentRank={currentRank}
            nextRank={nextRank}
            paths={currentPaths}
            tasks={myTasks.items}
            milestones={currentMilestones.milestones}
            pendingRequest={Boolean(pendingRequests)}
          />

          <RankRoadmap ranks={ranks} currentIndex={currentIndex} selectedRankId={activeRankId} onSelect={setSelectedRankId} />

          {activeRank && (
            <RankRequirementsSection
              rank={activeRank}
              state={activeState}
              paths={selectedPaths}
              pathsLoading={selectedPathsLoading}
              tasks={myTasks.items}
              tasksLoading={myTasks.loading}
              stagePurpose={selectedMilestones.stagePurpose}
              stageDescription={selectedMilestones.stageDescription}
              milestones={selectedMilestones.milestones}
              milestonesLoading={selectedMilestones.loading}
              onToggleMilestone={toggleMilestone}
              milestoneBusyId={milestoneBusyId}
            />
          )}
        </>
      )}
    </div>
  );
}
