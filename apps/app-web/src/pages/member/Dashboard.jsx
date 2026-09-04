import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { computeProfileHealth } from "../../lib/profileHealth.js";
import { completeContentAssignment, submitRankTask } from "../../lib/rpc.js";
import { useTodayTasks, todayISO } from "../../lib/useTodayTasks.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Avatar from "../../components/Avatar.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Modal from "../../components/Modal.jsx";
import DailyReportCard from "../../components/DailyReportCard.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function TodayTaskRow({ item, busy, onComplete, index }) {
  const { kind, title, description, done, category } = item;
  // Auto-tracked rank tasks (path_complete/prospects_count/etc.) know where
  // a member should go to actually make progress -- the whole row guides
  // them there, not just the small badge, same as MindTrainingPathDetail's
  // ItemRow wraps its body in a Link rather than relying on a side button.
  const bodyLinkTo = !done && kind === "rank" && !item.manual && !item.pending ? item.actionLink?.to : null;
  let rightContent;

  if (done) {
    rightContent = (
      <span className="badge badge-success">
        <Icon name="check" size={11} />
        Done
      </span>
    );
  } else if (kind === "assignment") {
    const urgencyTag = item.overdue ? (
      <span className="badge badge-danger">Overdue</span>
    ) : (
      <span className="badge badge-info">Due today</span>
    );
    let cta;
    if (item.actionable) {
      cta = (
        <button type="button" className="badge badge-neutral" disabled={busy} onClick={() => onComplete(item)}>
          {busy ? "Saving…" : "Mark done"}
        </button>
      );
    } else if (item.needsEvidence) {
      cta =
        item.evidenceStatus === "submitted" ? (
          <span className="badge badge-info">Pending review</span>
        ) : (
          <Link to="/tasks" className="badge badge-neutral">
            Submit evidence
          </Link>
        );
    }
    rightContent = (
      <>
        {urgencyTag}
        {cta}
      </>
    );
  } else {
    const freqTag = <span className="badge badge-neutral">{item.daily ? "Daily" : "One-time"}</span>;
    let cta;
    if (item.pending) {
      cta = <span className="badge badge-info">Pending review</span>;
    } else if (item.manual) {
      cta = (
        <button type="button" className="badge badge-neutral" disabled={busy} onClick={() => onComplete(item)}>
          {busy ? "Saving…" : "Mark done"}
        </button>
      );
    } else {
      cta = (
        <>
          {item.proxyThreshold != null && (
            <span className="badge badge-info">
              {item.progress ?? 0} of {item.proxyThreshold}
            </span>
          )}
          <span className="badge badge-neutral" title="Completes automatically as you make progress">
            Auto-tracked
          </span>
        </>
      );
    }
    rightContent = (
      <>
        {freqTag}
        {cta}
      </>
    );
  }

  return (
    <li className={`today-task-row${done ? " is-done" : ""}`} style={{ animationDelay: `${index * 0.045}s` }}>
      <span className={`today-task-check${done ? " done" : ""}`} aria-hidden="true">
        {done && <Icon name="check" size={13} />}
      </span>
      {bodyLinkTo ? (
        <Link to={bodyLinkTo} className="today-task-body">
          <div className="today-task-title">
            {title}
            <span className="today-task-category">{category}</span>
          </div>
          {description && <div className="today-task-desc">{description}</div>}
        </Link>
      ) : (
        <div className="today-task-body">
          <div className="today-task-title">
            {title}
            <span className="today-task-category">{category}</span>
          </div>
          {description && <div className="today-task-desc">{description}</div>}
        </div>
      )}
      <div className="today-task-meta">{rightContent}</div>
    </li>
  );
}

// ================= My Day: the primary workspace =================
function TodayTasksCard({ today }) {
  const toast = useToast();
  const { loading, error, items, doneCount, total, refetch } = today;
  const [busyId, setBusyId] = useState(null);

  const complete = async (item) => {
    setBusyId(item.id);
    try {
      if (item.kind === "assignment") {
        await completeContentAssignment(item.id);
        toast.success("Nice — marked done.");
      } else {
        await submitRankTask(item.id);
        toast.success("Marked done — an admin will review it.");
      }
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that task.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = items.slice(0, 5);
  const remaining = items.length - visible.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className={`card-elevated today-tasks-card rise-in${percent === 100 ? " celebration-banner" : ""}`}>
      <div className="today-tasks-header">
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            <Icon name="check-square" size={17} style={{ verticalAlign: "-3px", marginRight: "7px" }} />
            My Day
          </div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            {loading ? "Checking what's due…" : total === 0 ? "Nothing on your plate today." : `${doneCount} of ${total} done`}
          </p>
        </div>
        {!loading && total > 0 && (
          <div className="today-tasks-progress">
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="today-tasks-percent">{percent}%</span>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      )}

      {!loading && error && <ErrorState description="Couldn't load today's tasks." />}

      {!loading && !error && total === 0 && (
        <div className="today-tasks-empty">
          <div className="today-tasks-empty-badge">
            <Icon name="check" size={22} />
          </div>
          <div className="state-title">You're all caught up 🎉</div>
          <p className="state-desc">No urgent tasks right now.</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "4px" }}>
            <Link to="/learning" className="btn btn-secondary">
              Continue Learning
            </Link>
            <Link to="/network" className="btn btn-secondary">
              Build Your Network
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <>
          <ul className="today-task-list">
            {visible.map((item, i) => (
              <TodayTaskRow key={`${item.kind}-${item.id}`} item={item} busy={busyId === item.id} onComplete={complete} index={i} />
            ))}
          </ul>
          {remaining > 0 && (
            <Link to="/tasks" className="today-tasks-more">
              +{remaining} more in Tasks
              <Icon name="chevron-right" size={14} />
            </Link>
          )}
          {percent === 100 && <div className="today-tasks-celebrate">🎉 Everything's done for today — great work.</div>}
        </>
      )}
    </div>
  );
}

// ================= Next Best Action + Needs Attention: one shared, real-data priority list =================
// One rule-based ranking, two views onto it: NextBestActionCard shows only
// item[0] as a single non-competing CTA (spec: never show more than one),
// AttentionCard lists all of them. Every signal here is something another
// card on this dashboard already computes for its own purpose (overdue
// tasks/useTodayTasks, follow-ups due/BusinessWorkCard's old query, goals
// set/MonthlyGoalsCard, profile health) -- this just re-ranks the same real
// facts instead of inventing a new ones.
function buildAttentionItems({ today, dueCount, hasReport, hasMonthlyGoals, health, monthLabel }) {
  const items = [];
  const overdueCount = today.items.filter((i) => i.overdue && !i.done).length;
  if (overdueCount > 0) {
    items.push({ key: "overdue", icon: "clock", label: "Overdue tasks", count: overdueCount, to: "/tasks", action: "Review Tasks" });
  }
  if (dueCount > 0) {
    items.push({ key: "prospects", icon: "network", label: "Prospects need follow-up", count: dueCount, to: "/network", action: "View Prospects" });
  }
  const evidenceCount = today.items.filter((i) => i.kind === "assignment" && i.needsEvidence && !i.done && i.evidenceStatus !== "submitted").length;
  if (evidenceCount > 0) {
    items.push({ key: "evidence", icon: "clipboard", label: "Assignments need a submission", count: evidenceCount, to: "/tasks", action: "Submit" });
  }
  if (!hasReport) {
    items.push({ key: "report", icon: "clipboard", label: "Daily report not submitted", count: null, to: "/tasks", action: "Submit Report" });
  }
  if (!hasMonthlyGoals) {
    items.push({ key: "goals", icon: "target", label: `${monthLabel} goals not set`, count: null, to: "/goals", action: "Set Goals" });
  }
  if (!health.complete) {
    const next = health.items.find((i) => !i.done);
    items.push({ key: "profile", icon: "user", label: next?.label ?? "Finish your profile", count: null, to: "/profile", action: "Finish Setup" });
  }
  return items;
}

function nextBestAction(attentionItems, monthLabel) {
  const top = attentionItems[0];
  if (!top) {
    return { message: "You're all caught up. Continue developing your skills.", cta: "Browse Learning Hub", to: "/learning" };
  }
  const phrase = {
    overdue: `You have ${top.count} overdue task${top.count === 1 ? "" : "s"}.`,
    prospects: `You have ${top.count} prospect${top.count === 1 ? "" : "s"} waiting for follow-up.`,
    evidence: `${top.count} assignment${top.count === 1 ? "" : "s"} need${top.count === 1 ? "s" : ""} a submission.`,
    report: "Complete your daily report.",
    goals: `Set your ${monthLabel} goals.`,
    profile: top.label + ".",
  }[top.key];
  return { message: phrase, cta: top.action, to: top.to };
}

function NextBestActionCard({ loading, action }) {
  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.03s" }}>
      <div className="card-title" style={{ marginBottom: "6px" }}>
        <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Your Next Step
      </div>
      {loading ? (
        <Skeleton variant="text" height="18px" />
      ) : (
        <>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--navy)", marginBottom: "14px" }}>{action.message}</p>
          <Link to={action.to} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            {action.cta}
          </Link>
        </>
      )}
    </div>
  );
}

function AttentionRow({ icon, count, label, to }) {
  return (
    <Link to={to} className="attention-row">
      <span className="icon-badge tone-warning">
        <Icon name={icon} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{label}</div>
      </div>
      {count != null && (
        <span className="attention-count" style={{ color: "var(--gold)", fontSize: "16px" }}>
          {count}
        </span>
      )}
      <Icon name="chevron-right" size={15} style={{ color: "var(--slate)", flexShrink: 0 }} />
    </Link>
  );
}

// Shows only the single most urgent item (never a wall of rows to scan) --
// the rest are one click away in a modal via "+N more", not hidden entirely.
function AttentionCard({ loading, items }) {
  const [showAll, setShowAll] = useState(false);
  const [top, ...rest] = items;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.06s" }}>
      <div className="card-title" style={{ marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Needs Your Attention</span>
        {items.length > 1 && (
          <span className="badge badge-warning" title={`${items.length} things need your attention`}>
            {items.length}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton variant="table-row" />
      ) : items.length === 0 ? (
        <div className="attention-card all-clear" style={{ padding: "6px" }}>
          <div className="attention-row" style={{ cursor: "default" }}>
            <span className="icon-badge tone-success">
              <Icon name="check" size={16} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "13.5px" }}>You're on track</div>
              <div style={{ fontSize: "12px", color: "var(--slate)" }}>Nothing urgent needs your attention right now.</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="attention-card" style={{ padding: "6px" }}>
            <AttentionRow {...top} />
          </div>
          {rest.length > 0 && (
            <button
              type="button"
              className="today-tasks-more"
              style={{ width: "100%", justifyContent: "center", background: "none", border: "none", padding: "14px 0 0", margin: "10px 0 0", font: "inherit", cursor: "pointer" }}
              onClick={() => setShowAll(true)}
            >
              +{rest.length} more needing attention
              <Icon name="chevron-right" size={14} />
            </button>
          )}
          {showAll && (
            <Modal open onClose={() => setShowAll(false)} title="Needs Your Attention">
              <div className="attention-card" style={{ padding: "6px" }}>
                {items.map((item) => (
                  <AttentionRow key={item.key} {...item} />
                ))}
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

// ================= Compact workday header =================
function Hero({ firstName, today }) {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const outstanding = today.total - today.doneCount;
  const subtitle = today.loading
    ? "Here's what needs your attention today."
    : today.total === 0
      ? "You're all caught up — here's what needs your attention today."
      : outstanding === 0
        ? "You've finished everything on your plate today. Nice work."
        : `${outstanding} thing${outstanding === 1 ? "" : "s"} left on your plate today.`;

  const percent = !today.loading && today.total > 0 ? Math.round((today.doneCount / today.total) * 100) : null;

  return (
    <div className="hero-banner rise-in">
      <div className="hero-banner-main">
        <div className="hero-date">{dateLabel}</div>
        <h1>
          {greeting()}, {firstName} 👋
        </h1>
        <p>{subtitle}</p>
      </div>
      {percent !== null && (
        <div className="hero-stat">
          <div className="hero-stat-value">
            {percent}
            <span>%</span>
          </div>
          <div className="hero-stat-label">
            {today.doneCount}/{today.total} tasks
          </div>
        </div>
      )}
    </div>
  );
}

// ================= Quick stats strip =================
function MiniStat({ icon, label, value, tone, loading, animationDelay }) {
  return (
    <div className="card-elevated rise-in" style={{ animationDelay }}>
      <div className="stat-tile">
        <span className={`icon-badge${tone ? ` tone-${tone}` : ""}`}>
          <Icon name={icon} size={18} />
        </span>
        <div>
          <div className="stat-tile-label">{label}</div>
          <div className="stat-tile-value" style={{ fontSize: "20px" }}>
            {loading ? "—" : value}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= Compact profile-setup nudge (banner, not a card) =================
// Self-removes the instant health.complete flips true -- no permanent
// dashboard real estate spent on a finished checklist.
function ProfileBanner({ health }) {
  if (health.complete) return null;
  const next = health.items.find((i) => !i.done);
  return (
    <div className="card-elevated rise-in" style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "14px" }}>
      <span className="icon-badge tone-warning" style={{ flexShrink: 0 }}>
        <Icon name="clipboard" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>Complete your profile</div>
        <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
          {health.percent}% complete{next ? ` — ${next.label}` : ""}
        </div>
      </div>
      <Link to="/profile" className="btn btn-secondary" style={{ flexShrink: 0 }}>
        Finish Setup
      </Link>
    </div>
  );
}

// ================= Compact rank journey: current -> next -> progress -> action =================
// Business Path v2: no fixed ladder, an admin can create any ranks they
// want (supabase/migrations/0059_business_path_v2_schema.sql) -- this reads
// the whole ordered list and highlights wherever profiles.rank_id currently
// sits in it. Deliberately doesn't render the full roadmap here (that's
// what /rank-journey is for) -- "requirements complete" reuses
// useTodayTasks' real activitiesDone/activitiesTotal split (this rank's
// tasks) rather than inventing a separate "progress to next rank" number
// nothing in the schema actually tracks.
function RankJourneyCard({ profile, today }) {
  const { loading, data: ranks } = useSupabaseQuery(
    () => supabase.from("ranks").select("id, title, order_index").order("order_index"),
    [],
  );

  if (loading) {
    return (
      <div className="card-elevated rise-in" style={{ animationDelay: "0.1s" }}>
        <Skeleton variant="text" width="140px" height="16px" style={{ marginBottom: "12px" }} />
        <Skeleton variant="card" height="60px" />
      </div>
    );
  }

  if (!ranks || ranks.length === 0) return null;

  const currentIndex = ranks.findIndex((r) => r.id === profile?.rank_id);
  const currentRank = currentIndex >= 0 ? ranks[currentIndex] : null;
  const nextRank = currentIndex >= 0 ? ranks[currentIndex + 1] : ranks[0];
  const reqTotal = today.activitiesTotal;
  const reqDone = today.activitiesDone;
  const reqPercent = reqTotal > 0 ? Math.round((reqDone / reqTotal) * 100) : 0;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.1s" }}>
      <div className="card-title" style={{ marginBottom: "10px" }}>
        <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Rank Journey
      </div>

      {!currentRank ? (
        <p className="card-subtitle">An admin hasn't assigned your rank yet — it'll show up here once they do.</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div>
            <div className="row-meta">Current</div>
            <div style={{ fontWeight: 700, fontSize: "16px" }}>{currentRank.title}</div>
          </div>
          {nextRank && (
            <>
              <Icon name="chevron-right" size={16} style={{ color: "var(--slate)", flexShrink: 0 }} />
              <div>
                <div className="row-meta">Next</div>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--blue-bright)" }}>{nextRank.title}</div>
              </div>
            </>
          )}
          {!nextRank && <span style={{ fontSize: "20px" }}>🏆</span>}
        </div>
      )}

      {reqTotal > 0 && (
        <>
          <div className="progress-bar" style={{ margin: "14px 0 6px" }}>
            <div className="progress-bar-fill" style={{ width: `${reqPercent}%` }} />
          </div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            {reqDone} / {reqTotal} requirements complete
          </p>
        </>
      )}

      <Link to="/rank-journey" className="btn btn-secondary" style={{ marginTop: "16px" }}>
        Continue Journey
      </Link>
    </div>
  );
}

// ================= Monthly goals =================
// The categorized Skill/Freelancing/Network Marketing/Personal monthly
// goals flow (submit -> admin review, supabase/migrations/0045_monthly_goals.sql)
// -- distinct from the always-editable income/team-size targets on Profile.
// Per-category done/total below is real: each category is a jsonb array of
// {text, target, progress, done} items the member maintains on /goals, not
// a computed aggregate the DB provides -- summed here client-side. `row` is
// lifted to Dashboard() (needed there for the attention/next-step signal
// too) rather than fetched a second time here.
const GOAL_CATEGORIES = [
  { key: "skill", label: "Skill" },
  { key: "freelancing", label: "Freelancing" },
  { key: "network_marketing", label: "Network Marketing" },
  { key: "personal", label: "Personal" },
];

function MonthlyGoalsCard({ row, loading, monthLabel }) {
  if (loading) {
    return (
      <div className="card-elevated rise-in" style={{ animationDelay: "0.14s" }}>
        <Skeleton variant="text" width="140px" height="16px" style={{ marginBottom: "12px" }} />
        <Skeleton variant="card" height="90px" />
      </div>
    );
  }

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.14s" }}>
      <div className="card-title">
        <Icon name="target" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        {monthLabel} Goals
      </div>

      {!row ? (
        <>
          <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
            You haven't set your goals for {monthLabel} yet.
          </p>
          <Link to="/goals" className="btn btn-primary">
            Set My Monthly Goals
          </Link>
        </>
      ) : (
        <>
          {row.status === "needs_revision" && (
            <p className="field-error" style={{ marginBottom: "12px" }}>
              An admin asked for changes to your goals — take another look.
            </p>
          )}
          <ul className="goal-category-list">
            {GOAL_CATEGORIES.map((c) => {
              const items = row.goals?.[c.key] ?? [];
              const done = items.filter((i) => i.done).length;
              const total = items.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <li key={c.key} className="goal-category-row">
                  <div className="goal-category-top">
                    <span>{c.label}</span>
                    <span className="goal-category-count">{total > 0 ? `${done} / ${total}` : "—"}</span>
                  </div>
                  {total > 0 && (
                    <div className="progress-bar goal-category-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Link to="/goals" className="btn btn-primary" style={{ marginTop: "16px" }}>
            View My Goals
          </Link>
        </>
      )}
    </div>
  );
}

// ================= Continue learning =================
// Picks one path to feature, preferring Mind Training's real per-lesson
// progress (get_my_mind_training_paths returns completedItems/totalItems --
// nothing else does) over a Learning Hub path, which only has a static
// courseCount, not a lesson counter -- shown honestly as "N courses"
// instead of a fabricated "lesson X of Y". lpPaths is lifted to Dashboard()
// and shared with BusinessWorkCard rather than each fetching it separately.
const LEARNING_SECTION_LABEL = {
  skill_set: "Freelancing",
  nm_business: "Network Marketing",
  mind_training: "Mind Training",
};

function ContinueLearningCard({ lpPaths, loadingLP }) {
  const { loading: loadingMT, data: mtPaths } = useSupabaseQuery(() => supabase.rpc("get_my_mind_training_paths", {}), []);
  const loading = loadingMT || loadingLP;

  if (loading) {
    return (
      <div className="card-elevated rise-in" style={{ animationDelay: "0.18s" }}>
        <Skeleton variant="text" width="140px" height="16px" style={{ marginBottom: "12px" }} />
        <Skeleton variant="card" height="70px" />
      </div>
    );
  }

  const mtInProgress = (mtPaths ?? []).find((p) => !p.locked && p.totalItems > 0 && p.completedItems < p.totalItems);
  const lpInProgress = !mtInProgress ? (lpPaths ?? []).find((p) => !p.completed) : null;

  let content = null;
  if (mtInProgress) {
    content = {
      track: "Mind Training",
      title: mtInProgress.title,
      sub: `${mtInProgress.completedItems} of ${mtInProgress.totalItems} complete`,
      to: `/learning/mind-training/${mtInProgress.id}`,
    };
  } else if (lpInProgress) {
    content = {
      track: LEARNING_SECTION_LABEL[lpInProgress.section] ?? "Learning",
      title: lpInProgress.title,
      sub: `${lpInProgress.courseCount} course${lpInProgress.courseCount === 1 ? "" : "s"}`,
      to: `/learning/${lpInProgress.id}`,
    };
  }

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.18s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="book" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Continue Learning
      </div>
      {!content ? (
        <>
          <p className="card-subtitle">You're all caught up on your learning paths.</p>
          <Link to="/learning" className="btn btn-secondary">
            Browse Learning Hub
          </Link>
        </>
      ) : (
        <>
          <div className="continue-learning-track">{content.track}</div>
          <div className="continue-learning-title">{content.title}</div>
          <p className="card-subtitle" style={{ marginBottom: "16px" }}>
            {content.sub}
          </p>
          <Link to={content.to} className="btn btn-primary">
            Continue Learning
          </Link>
        </>
      )}
    </div>
  );
}

// ================= My business: NM + Freelancing, learning -> work -> income =================
// No portfolio/client-work/Fiverr-Upwork tracking exists anywhere in the
// schema -- rather than invent numbers for it, Freelancing links straight
// into the real skill_set learning content. dueCount/lpPaths are both
// lifted to Dashboard() -- this used to fetch both itself, duplicating
// Dashboard's own attention-signal query and ContinueLearningCard's
// get_learning_paths call.
function BusinessWorkCard({ dueCount, lpPaths }) {
  const freelancingPaths = (lpPaths ?? []).filter((p) => p.section === "skill_set");
  const freelancingDone = freelancingPaths.filter((p) => p.completed).length;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.2s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="briefcase" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        My Business
      </div>
      <p className="card-subtitle">Where learning turns into real work.</p>

      <div className="business-work-grid">
        <div className="business-work-col">
          <div className="business-work-col-title">
            <Icon name="network" size={14} />
            Network Marketing
          </div>
          <p className="business-work-stat">
            {dueCount > 0 ? (
              <>
                <strong style={{ color: "var(--navy)" }}>{dueCount}</strong> follow-up{dueCount === 1 ? "" : "s"} due
              </>
            ) : (
              "No follow-ups due right now"
            )}
          </p>
          <Link to="/network" className="btn btn-secondary">
            Prospects
          </Link>
        </div>
        <div className="business-work-col">
          <div className="business-work-col-title">
            <Icon name="laptop" size={14} />
            Freelancing
          </div>
          <p className="business-work-stat">
            {freelancingPaths.length > 0 ? (
              <>
                <strong style={{ color: "var(--navy)" }}>{freelancingDone}</strong> of {freelancingPaths.length} path
                {freelancingPaths.length === 1 ? "" : "s"} complete
              </>
            ) : (
              "No freelancing paths yet"
            )}
          </p>
          <Link to="/learning" className="btn btn-secondary">
            Freelancing Skills
          </Link>
        </div>
      </div>
    </div>
  );
}

// ================= My network / team =================
// Real fields only -- get_network_overview (0060) has no "active this
// week"/"new this month" scoped to a member's own downline, so those
// aren't shown rather than faked.
function NetworkTeamCard({ uid }) {
  const { loading, data: overview } = useSupabaseQuery(
    () => uid && supabase.rpc("get_network_overview", { p_uid: uid }),
    [uid],
  );
  const { data: sponsor } = useSupabaseQuery(() => supabase.rpc("get_my_sponsor", {}), []);

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.24s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="network" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        My Network
      </div>

      {loading ? (
        <Skeleton variant="card" height="80px" />
      ) : (
        <>
          {sponsor && (
            <div className="network-sponsor-row">
              <Avatar name={sponsor.display_name} photoPath={sponsor.photo_url} size={32} />
              <div>
                <div className="row-meta">Sponsor</div>
                <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{sponsor.display_name}</div>
              </div>
            </div>
          )}
          <ul className="network-stat-list">
            <li>
              <span>Team members</span>
              <strong>{overview?.networkSize ?? 0}</strong>
            </li>
            <li>
              <span>Active</span>
              <strong>{overview?.activeCount ?? 0}</strong>
            </li>
            <li>
              <span>Inactive</span>
              <strong>{overview?.inactiveCount ?? 0}</strong>
            </li>
          </ul>
        </>
      )}

      <Link to="/network" className="btn btn-secondary" style={{ marginTop: "16px" }}>
        View Network
      </Link>
    </div>
  );
}

// ================= Announcements =================
// get_active_announcements (0090) -- the one broadcast-to-everyone
// notification concept the platform has; admin-authored on
// /admin/settings/notifications. Hidden entirely when empty rather than
// showing an empty card -- nothing to scan is not a status worth a card.
function AnnouncementsCard() {
  const { loading, data } = useSupabaseQuery(() => supabase.rpc("get_active_announcements", {}), []);
  if (!loading && (!data || data.length === 0)) return null;

  return (
    <div className="card-elevated rise-in" style={{ marginBottom: "20px" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="bell" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Announcements
      </div>
      {loading ? (
        <Skeleton variant="table-row" />
      ) : (
        <ul className="announcement-list">
          {data.map((a) => (
            <li key={a.id} className="announcement-row">
              <span aria-hidden="true">📢</span>
              <div>
                <div className="announcement-title">{a.title}</div>
                {a.body && <div className="announcement-body">{a.body}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Mirrors the three boards on the full Leaderboard page (get_leaderboards,
// supabase/migrations/0026_weekly_leaderboard.sql) but only ever shows each
// board's #1 entry -- a teaser, not a duplicate of that page.
const LEADER_CATEGORY = {
  tasks: { icon: "check-square", label: "Improved Players", format: (e) => `${Math.round(e.completionPercent)}%` },
  prospects: { icon: "network", label: "Top Team Production", format: (e) => `${e.prospectCount}` },
  earnings: { icon: "dollar-sign", label: "Top Earner", format: (e) => `$${Math.round(e.totalAmount)}` },
};

function TopLeadersCard({ uid }) {
  const { loading, data } = useSupabaseQuery(() => uid && supabase.rpc("get_leaderboards", {}), [uid]);
  const anyLeaders = data && Object.keys(LEADER_CATEGORY).some((key) => data[key]?.[0]);

  return (
    <div className="card-elevated leaders-card rise-in" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span className="icon-badge tone-warning" style={{ width: "46px", height: "46px", borderRadius: "13px" }}>
          <Icon name="trophy" size={22} />
        </span>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            This Week
          </div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            Who's #1 on each board right now.
          </p>
        </div>
      </div>

      {loading && (
        <div className="leader-board-grid">
          <Skeleton variant="card" height="180px" />
          <Skeleton variant="card" height="180px" />
          <Skeleton variant="card" height="180px" />
        </div>
      )}

      {!loading && !anyLeaders && (
        <p className="card-subtitle" style={{ marginTop: "16px", marginBottom: 0 }}>
          Leaderboard results will appear here once activity is recorded.
        </p>
      )}

      {!loading && anyLeaders && (
        <div className="leader-board-grid">
          {Object.entries(LEADER_CATEGORY).map(([key, meta], i) => {
            const leader = data?.[key]?.[0];
            return (
              <div key={key} className="podium-slot rank-1 rise-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <div className="leader-tile-category">
                  <Icon name={meta.icon} size={12} />
                  {meta.label}
                </div>
                {leader ? (
                  <>
                    <div className="podium-medal">🥇</div>
                    <div className="podium-avatar-wrap">
                      <Avatar name={leader.displayName} photoPath={leader.photoUrl} size={58} ring="var(--gold)" />
                    </div>
                    <div className="podium-name">
                      {leader.displayName}
                      {leader.uid === uid && " (you)"}
                    </div>
                    <div className="podium-score">{meta.format(leader)}</div>
                  </>
                ) : (
                  <>
                    <div className="leader-tile-empty-avatar">
                      <Icon name={meta.icon} size={22} />
                    </div>
                    <div className="leader-tile-empty">No one yet this week</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link to="/leaderboard" className="btn btn-secondary" style={{ marginTop: "10px" }}>
        View full leaderboard
      </Link>
    </div>
  );
}

const QUICK_ACTIONS = [
  { to: "/network", icon: "network", label: "Add Prospect" },
  { to: "/tasks", icon: "clipboard", label: "Submit Report" },
  { to: "/learning", icon: "book", label: "Continue Learning" },
  { to: "/goals", icon: "target", label: "Set Goals" },
  { to: "/rank-journey", icon: "compass", label: "Rank Journey" },
  { to: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { to: "/notifications", icon: "bell", label: "Notifications" },
];

export default function Dashboard() {
  const { user, profile } = useAuth();
  const period = currentPeriod();
  const today = useTodayTasks(user?.id);
  const todayStr = todayISO();

  const { data: whys } = useSupabaseQuery(
    () => user && supabase.from("member_whys").select("id").eq("uid", user.id),
    [user?.id],
  );
  const { data: goalsRow } = useSupabaseQuery(
    () => user && supabase.from("member_goals").select("*").eq("uid", user.id).maybeSingle(),
    [user?.id],
  );
  const { data: streak } = useSupabaseQuery(() => supabase.rpc("get_my_streak", {}), []);
  const health = computeProfileHealth({ profile, whysCount: whys?.length, goals: goalsRow });

  const { data: monthlyGoalsRow, loading: loadingMonthlyGoals } = useSupabaseQuery(
    () => user && supabase.from("monthly_goals").select("status, goals").eq("uid", user.id).eq("period", period).maybeSingle(),
    [user?.id, period],
  );

  // Same "follow-up due" definition My Network's own Follow-ups Due section
  // (NetworkDashboard.jsx) is built from -- lifted here once so the Quick
  // Stats strip, Needs Attention, Next Best Action, and My Business all
  // read the same number instead of four separate queries for it.
  const { data: dueProspects, loading: loadingProspects } = useSupabaseQuery(
    () =>
      user &&
      supabase
        .from("prospects")
        .select("id")
        .eq("owner_uid", user.id)
        .not("status", "in", "(joined,not_interested)")
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", todayStr),
    [user?.id],
  );
  const dueCount = dueProspects?.length ?? 0;

  const { data: reportToday, loading: loadingReport } = useSupabaseQuery(
    () => user && supabase.from("daily_reports").select("id").eq("uid", user.id).eq("report_date", todayStr).maybeSingle(),
    [user?.id],
  );

  // Shared by ContinueLearningCard and BusinessWorkCard -- both used to call
  // get_learning_paths independently on the same page load.
  const { loading: loadingLP, data: lpPaths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths", {}), []);

  const firstName = profile?.display_name?.split(" ")[0] ?? "there";
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const attentionLoading = today.loading || loadingMonthlyGoals || loadingReport;
  const attentionItems = buildAttentionItems({
    today,
    dueCount,
    hasReport: !!reportToday,
    hasMonthlyGoals: !!monthlyGoalsRow,
    health,
    monthLabel,
  });
  const action = nextBestAction(attentionItems, monthLabel);

  return (
    <div>
      <Hero firstName={firstName} today={today} />

      <div className="dash-primary-row">
        <TodayTasksCard today={today} />
        <div className="dash-side-col">
          <NextBestActionCard loading={attentionLoading} action={action} />
          <AttentionCard loading={attentionLoading} items={attentionItems} />
        </div>
      </div>

      <ProfileBanner health={health} />

      <div className="grid grid-4" style={{ marginBottom: "20px" }}>
        <MiniStat icon="check-square" label="Tasks today" value={`${today.doneCount}/${today.total}`} loading={today.loading} animationDelay="0s" />
        <MiniStat
          icon="clipboard"
          label="Today's report"
          value={reportToday ? "Submitted" : "Not yet"}
          tone={reportToday ? "success" : "warning"}
          loading={loadingReport}
          animationDelay="0.03s"
        />
        <MiniStat
          icon="network"
          label="Follow-ups due"
          value={dueCount}
          tone={dueCount > 0 ? "warning" : undefined}
          loading={loadingProspects}
          animationDelay="0.06s"
        />
        <MiniStat icon="activity" label="Streak" value={streak ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "No streak yet"} animationDelay="0.09s" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "20px" }}>
        <MonthlyGoalsCard row={monthlyGoalsRow} loading={loadingMonthlyGoals} monthLabel={monthLabel} />
        <ContinueLearningCard lpPaths={lpPaths} loadingLP={loadingLP} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "20px" }}>
        <BusinessWorkCard dueCount={dueCount} lpPaths={lpPaths} />
        <RankJourneyCard profile={profile} today={today} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "20px" }}>
        <NetworkTeamCard uid={user?.id} />
        <DailyReportCard uid={user?.id} today={today} />
      </div>

      <AnnouncementsCard />

      <TopLeadersCard uid={user?.id} />

      <div className="quick-actions">
        {QUICK_ACTIONS.map((qa, i) => (
          <Link key={qa.to} to={qa.to} className="quick-action rise-in" style={{ animationDelay: `${0.2 + i * 0.03}s` }}>
            <span className="qa-icon">
              <Icon name={qa.icon} size={17} />
            </span>
            <span className="qa-label">{qa.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
