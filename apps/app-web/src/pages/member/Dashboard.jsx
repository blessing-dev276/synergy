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
import ProgressRing from "../../components/ProgressRing.jsx";

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

  const visible = items.slice(0, 2);
  const remaining = items.length - visible.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className={`card-elevated today-tasks-card rise-in${percent === 100 ? " celebration-banner" : ""}`}>
      <div className="today-tasks-header">
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            <Icon name="check-square" size={17} style={{ verticalAlign: "-3px", marginRight: "7px" }} />
            Today's Work
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
          <div className="state-title">You're all caught up</div>
          <p className="state-desc">Nothing needs your attention today. Check back tomorrow, or get ahead in the Learning Hub.</p>
          <Link to="/learning" className="btn btn-secondary">
            Browse Learning Hub
          </Link>
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

// ================= Daily progress: totals + per-category breakdown + streak =================
// Same `today` data Today's Work already fetched -- no extra queries beyond
// the streak, which is genuinely new (get_my_streak, 0090): consecutive
// days with at least one real submission (content_evidence_submissions /
// assignment_submissions / rank_task_submissions), not a fabricated counter.
function ProgressCategoryRow({ label, icon, done, total }) {
  const complete = total > 0 && done === total;
  return (
    <li className="progress-category-row">
      <span className="progress-category-label">
        <Icon name={icon} size={14} />
        {label}
      </span>
      {total === 0 ? (
        <span className="progress-category-status muted">Nothing today</span>
      ) : complete ? (
        <span className="progress-category-status done">
          <Icon name="check" size={12} />
        </span>
      ) : (
        <span className="progress-category-status">
          {done} / {total}
        </span>
      )}
    </li>
  );
}

function DailyProgressCard({ today, streak }) {
  const { loading, items, doneCount, total } = today;
  if (loading || total === 0) return null;

  const percent = Math.round((doneCount / total) * 100);
  const learning = items.filter((i) => i.kind === "assignment");
  const networkMarketing = items.filter((i) => i.kind === "rank");

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.04s" }}>
      <div className="daily-progress-header">
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            Today's Progress
          </div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            {doneCount} / {total} tasks completed
          </p>
        </div>
        {streak > 0 && (
          <div className="streak-badge" title={`${streak}-day streak — keep it going`}>
            <span aria-hidden="true">🔥</span> {streak} day{streak === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="progress-bar" style={{ margin: "14px 0" }}>
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <ul className="progress-category-list">
        <ProgressCategoryRow label="Learning" icon="book" done={learning.filter((i) => i.done).length} total={learning.length} />
        <ProgressCategoryRow
          label="Network Marketing"
          icon="network"
          done={networkMarketing.filter((i) => i.done).length}
          total={networkMarketing.length}
        />
      </ul>
    </div>
  );
}

// ================= Progress: profile setup =================
function ProfileProgressCard({ health }) {
  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.06s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        Profile setup
      </div>
      <p className="card-subtitle">{health.complete ? "You're fully set up." : "A few things left to unlock the full experience."}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <ProgressRing percent={health.percent} size={72} strokeWidth={7} fillColor={health.complete ? "var(--success)" : "var(--blue)"} />
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", flex: 1, minWidth: 0 }}>
          {health.items.map((item) => (
            <li key={item.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <Icon
                name={item.done ? "check-square" : "clipboard"}
                size={14}
                style={{ color: item.done ? "var(--success)" : "var(--slate)", flexShrink: 0 }}
              />
              <span style={{ color: item.done ? "var(--slate)" : "var(--navy)", textDecoration: item.done ? "line-through" : "none" }}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {!health.complete && (
        <Link to="/profile" className="btn btn-primary" style={{ marginTop: "16px" }}>
          Finish setup
        </Link>
      )}
    </div>
  );
}

// ================= Progress: rank journey =================
// Business Path v2: no fixed ladder, an admin can create any ranks they
// want (supabase/migrations/0059_business_path_v2_schema.sql) -- this reads
// the whole ordered list and highlights wherever profiles.rank_id currently
// sits in it, which is the closest thing to a "career path" a member has.
function RankJourneyCard({ profile }) {
  const { loading, data: ranks } = useSupabaseQuery(
    () => supabase.from("ranks").select("id, title, order_index").order("order_index"),
    [],
  );

  if (loading) {
    return (
      <div className="card-elevated rise-in" style={{ animationDelay: "0.1s" }}>
        <Skeleton variant="text" width="140px" height="16px" style={{ marginBottom: "12px" }} />
        <Skeleton variant="card" height="90px" />
      </div>
    );
  }

  if (!ranks || ranks.length === 0) return null;

  const currentIndex = ranks.findIndex((r) => r.id === profile?.rank_id);
  const currentRank = currentIndex >= 0 ? ranks[currentIndex] : null;
  const nextRank = currentIndex >= 0 ? ranks[currentIndex + 1] : ranks[0];

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.1s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Your rank journey
      </div>
      <p className="card-subtitle">
        {currentRank ? (
          nextRank ? (
            <>
              You're at <strong style={{ color: "var(--navy)" }}>{currentRank.title}</strong> — next up:{" "}
              <span className="rank-journey-next-chip">{nextRank.title}</span>
            </>
          ) : (
            <>
              You've reached the top rank: <strong style={{ color: "var(--navy)" }}>{currentRank.title}</strong> 🏆
            </>
          )
        ) : (
          "An admin hasn't assigned your rank yet — it'll show up here once they do."
        )}
      </p>

      <div className="rank-journey-track">
        {ranks.map((r, i) => (
          <div key={r.id} className={`rank-journey-step${i < currentIndex ? " done" : ""}${i === currentIndex ? " current" : ""}`}>
            <div className={`stepper-step${i < currentIndex ? " done" : ""}${i === currentIndex ? " current" : ""}`} title={r.title}>
              {i < currentIndex ? <Icon name="check" size={16} /> : i === currentIndex ? <Icon name="trophy" size={19} /> : i + 1}
            </div>
            <div className="rank-journey-step-label">{r.title}</div>
          </div>
        ))}
      </div>

      <Link to="/learning" className="btn btn-secondary" style={{ marginTop: "20px" }}>
        Browse Learning Hub
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
// a computed aggregate the DB provides -- summed here client-side.
const GOAL_CATEGORIES = [
  { key: "skill", label: "Skill" },
  { key: "freelancing", label: "Freelancing" },
  { key: "network_marketing", label: "Network Marketing" },
  { key: "personal", label: "Personal" },
];

function MonthlyGoalsCard({ uid }) {
  const period = currentPeriod();
  const { loading, data: row } = useSupabaseQuery(
    () => uid && supabase.from("monthly_goals").select("status, goals").eq("uid", uid).eq("period", period).maybeSingle(),
    [uid, period],
  );
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

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
// instead of a fabricated "lesson X of Y".
const LEARNING_SECTION_LABEL = {
  skill_set: "Freelancing",
  nm_business: "Network Marketing",
  mind_training: "Mind Training",
};

function ContinueLearningCard() {
  const { loading: loadingMT, data: mtPaths } = useSupabaseQuery(() => supabase.rpc("get_my_mind_training_paths", {}), []);
  const { loading: loadingLP, data: lpPaths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths", {}), []);
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

// ================= Your business: NM + Freelancing, learning -> work -> income =================
// No portfolio/client-work/Fiverr-Upwork tracking exists anywhere in the
// schema -- rather than invent numbers for it, Freelancing links straight
// into the real skill_set learning content. Network Marketing's follow-up
// count is the same live prospects query NetworkTabs.jsx's badge uses.
function BusinessWorkCard({ uid }) {
  const today = todayISO();
  const { data: dueProspects } = useSupabaseQuery(
    () =>
      uid &&
      supabase
        .from("prospects")
        .select("id")
        .eq("owner_uid", uid)
        .not("status", "in", "(joined,not_interested)")
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", today),
    [uid],
  );
  const { data: lpPaths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths", {}), []);

  const dueCount = dueProspects?.length ?? 0;
  const freelancingPaths = (lpPaths ?? []).filter((p) => p.section === "skill_set");
  const freelancingDone = freelancingPaths.filter((p) => p.completed).length;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.2s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="briefcase" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Your Business
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

// ================= Today's reports (accountability) =================
// Narrower than the Daily Report on /tasks (daily_reports, 0094, one
// free-form wrap-up per day covering all of today's work): this card is
// specifically about content_assignments that need admin-reviewed written
// evidence, whose real status (not submitted / pending / done) already
// flows through get_my_content_assignments -- a different, more specific
// kind of reporting, not a duplicate of the Daily Report.
function AccountabilityCard({ today }) {
  const { loading, items } = today;
  if (loading) return null;

  const evidenceItems = items.filter((i) => i.kind === "assignment" && i.needsEvidence);

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.26s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="clipboard" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Today's Reports
      </div>

      {evidenceItems.length === 0 ? (
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          Nothing needs a report today.
        </p>
      ) : (
        <>
          <p className="card-subtitle">
            {evidenceItems.every((i) => i.done)
              ? "All of today's reports are in."
              : `${evidenceItems.filter((i) => i.done).length} of ${evidenceItems.length} submitted`}
          </p>
          <ul className="accountability-list">
            {evidenceItems.map((i) => (
              <li key={i.id} className="accountability-row">
                <span>{i.title}</span>
                <span className={`badge ${i.done ? "badge-success" : i.evidenceStatus === "submitted" ? "badge-info" : "badge-neutral"}`}>
                  {i.done ? "Approved" : i.evidenceStatus === "submitted" ? "Pending review" : "Not submitted"}
                </span>
              </li>
            ))}
          </ul>
          {!evidenceItems.every((i) => i.done) && (
            <Link to="/tasks" className="btn btn-primary" style={{ marginTop: "14px" }}>
              Submit Evidence
            </Link>
          )}
        </>
      )}
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
    <div className="card-elevated rise-in" style={{ animationDelay: "0.28s" }}>
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

  return (
    <div className="card-elevated leaders-card rise-in" style={{ animationDelay: "0.3s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span className="icon-badge tone-warning" style={{ width: "46px", height: "46px", borderRadius: "13px" }}>
          <Icon name="trophy" size={22} />
        </span>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            This Week's Leaders
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

      {!loading && (
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
  { to: "/learning", icon: "book", label: "Browse Learning" },
  { to: "/assignments", icon: "clipboard", label: "Assignments" },
  { to: "/tasks", icon: "check-square", label: "Tasks" },
  { to: "/goals", icon: "target", label: "Monthly Goals" },
  { to: "/network", icon: "network", label: "Prospects" },
  { to: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { to: "/notifications", icon: "bell", label: "Notifications" },
];

function Hero({ firstName, today }) {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const outstanding = today.total - today.doneCount;
  const subtitle = today.loading
    ? "Here's what you need to get done today."
    : today.total === 0
      ? "Here's what you need to get done today — you're all caught up already."
      : outstanding === 0
        ? "Here's what you need to get done today — and you've already finished it. Nice work."
        : `Here's what you need to get done today — ${outstanding} thing${outstanding === 1 ? "" : "s"} left.`;

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
          <div className="hero-stat-label">today's progress</div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, profile } = useAuth();

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
  const today = useTodayTasks(user?.id);

  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <Hero firstName={firstName} today={today} />

      <TodayTasksCard today={today} />

      <div style={{ marginBottom: "24px" }}>
        <DailyProgressCard today={today} streak={streak ?? 0} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <MonthlyGoalsCard uid={user?.id} />
        <ContinueLearningCard />
      </div>

      <div style={{ marginBottom: "24px" }}>
        <BusinessWorkCard uid={user?.id} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <NetworkTeamCard uid={user?.id} />
        <AccountabilityCard today={today} />
      </div>

      <div style={{ marginBottom: "24px" }}>
        <AnnouncementsCard />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <ProfileProgressCard health={health} />
        <RankJourneyCard profile={profile} />
      </div>

      <div style={{ marginBottom: "24px" }}>
        <TopLeadersCard uid={user?.id} />
      </div>

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
