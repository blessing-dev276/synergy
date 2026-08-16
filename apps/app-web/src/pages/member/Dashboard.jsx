import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { computeProfileHealth } from "../../lib/profileHealth.js";
import { completeContentAssignment, submitRankTask } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Avatar from "../../components/Avatar.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import StatusSplitBar from "../../components/StatusSplitBar.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ================= Today's Tasks =================
// Merges the two task sources a member actually has (Business Path v2 --
// see supabase/migrations/0058_business_path_v2_drop_v1.sql -- dropped
// everything else): content_assignments due today/overdue
// (get_my_content_assignments, same source TaskList.jsx's "/tasks" page
// reads) and this rank's daily/outstanding rank_tasks (get_my_rank_tasks).
// "done" means the same thing TaskList.jsx already treats as done for each
// source -- isDone for an assignment, a non-rejected submission for a rank
// task -- so the progress bar here never disagrees with what "/tasks" shows.
function useTodayTasks(uid) {
  const assignmentsQ = useSupabaseQuery(
    () => uid && supabase.rpc("get_my_content_assignments", { p_uid: uid }),
    [uid],
  );
  const rankTasksQ = useSupabaseQuery(() => supabase.rpc("get_my_rank_tasks", {}), []);

  const today = todayISO();

  const assignmentItems = (assignmentsQ.data ?? [])
    .filter((t) => t.dueDate && t.dueDate <= today)
    .map((t) => ({
      kind: "assignment",
      id: t.id,
      title: t.title,
      description: t.description,
      overdue: t.dueDate < today,
      done: t.isDone,
      actionable: t.contentType === "bare" && !t.requiresAdminApproval,
      needsEvidence: t.contentType === "bare" && t.requiresAdminApproval,
      evidenceStatus: t.evidenceStatus,
    }));

  const rankItems = (rankTasksQ.data ?? []).map((t) => ({
    kind: "rank",
    id: t.id,
    title: t.title,
    description: t.description,
    daily: t.recurrence === "daily",
    done: Boolean(t.submission) && t.submission.status !== "rejected",
    pending: t.submission?.status === "pending",
    manual: t.proxyType === "manual",
  }));

  // Overdue and not-done first (most urgent), done items sink to the
  // bottom -- same "unfinished work first" ordering as any todo list.
  const items = [...assignmentItems, ...rankItems].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (Boolean(a.overdue) !== Boolean(b.overdue)) return a.overdue ? -1 : 1;
    return 0;
  });

  return {
    loading: assignmentsQ.loading || rankTasksQ.loading,
    error: assignmentsQ.error || rankTasksQ.error,
    items,
    doneCount: items.filter((i) => i.done).length,
    total: items.length,
    refetch: () => {
      assignmentsQ.refetch();
      rankTasksQ.refetch();
    },
  };
}

function TodayTaskRow({ item, busy, onComplete, index }) {
  const { kind, title, description, done } = item;
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
    } else {
      cta = (
        <Link to="/tasks" className="badge badge-neutral">
          Continue
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
        <span className="badge badge-neutral" title="Completes automatically as you make progress">
          Auto-tracked
        </span>
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
      <div className="today-task-body">
        <div className="today-task-title">{title}</div>
        {description && <div className="today-task-desc">{description}</div>}
      </div>
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

  const visible = items.slice(0, 6);
  const remaining = items.length - visible.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="card-elevated today-tasks-card rise-in">
      <div className="today-tasks-header">
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            <Icon name="check-square" size={17} style={{ verticalAlign: "-3px", marginRight: "7px" }} />
            Today's Tasks
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
  const { data: paths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths", {}), []);

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
              <strong style={{ color: "var(--navy)" }}>{nextRank.title}</strong>
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
              {i < currentIndex ? <Icon name="check" size={13} /> : i + 1}
            </div>
            <div className="rank-journey-step-label">{r.title}</div>
          </div>
        ))}
      </div>

      {paths && paths.length > 0 && (
        <div style={{ marginTop: "6px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
          <div className="row-meta" style={{ marginBottom: "8px" }}>
            Your learning paths
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {paths.slice(0, 4).map((p) => (
              <li key={p.id} style={{ fontSize: "13.5px" }}>
                {p.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link to="/learning" className="btn btn-secondary" style={{ marginTop: "16px" }}>
        Browse Learning Hub
      </Link>
    </div>
  );
}

// Nudges toward the categorized Skill/Freelancing/NM/Personal monthly goals
// flow (submit -> admin review, see supabase/migrations/0045_monthly_goals.sql)
// -- distinct from the always-editable income/team-size targets on Profile.
function GoalsNudgeCard({ uid }) {
  const period = currentPeriod();
  const { data: row } = useSupabaseQuery(
    () => uid && supabase.from("monthly_goals").select("status").eq("uid", uid).eq("period", period).maybeSingle(),
    [uid, period],
  );

  if (row && (row.status === "submitted" || row.status === "approved")) return null;

  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.14s" }}>
      <div className="card-title">
        <Icon name="target" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Monthly Goals
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        {row?.status === "needs_revision"
          ? "An admin asked for changes to your goals — take another look."
          : `Set what you're working toward for ${monthLabel} across Skill, Freelancing, Network Marketing, and Personal.`}
      </p>
      <Link to="/goals" className="btn btn-primary">
        {row ? "Review your goals" : "Set your goals"}
      </Link>
    </div>
  );
}

// Sponsor-network snapshot (get_network_overview, same RPC NetworkDashboard.jsx
// and admin's OverviewSection.jsx already read) -- the active/non-active split
// mirrors AdminDashboard.jsx's "Team status" card, just scoped to this
// member's own downline instead of the whole roster.
function MyNetworkCard({ uid }) {
  const { loading, data: overview } = useSupabaseQuery(
    () => uid && supabase.rpc("get_network_overview", { p_uid: uid }),
    [uid],
  );

  const networkSize = overview?.networkSize ?? 0;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.16s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="network" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        My Network
      </div>
      <p className="card-subtitle" style={{ marginBottom: "12px" }}>
        {loading ? "Loading…" : `${networkSize} member${networkSize === 1 ? "" : "s"} in your network`}
      </p>

      {loading && <Skeleton variant="card" height="60px" />}

      {!loading && networkSize === 0 && (
        <EmptyState
          icon={<Icon name="network" size={24} />}
          title="Your network is empty so far"
          description="Once people join using your referral link, they'll show up here."
        />
      )}

      {!loading && networkSize > 0 && <StatusSplitBar active={overview.activeCount} inactive={overview.inactiveCount} />}

      <Link to="/network" className="btn btn-secondary" style={{ marginTop: "16px" }}>
        View network
      </Link>
    </div>
  );
}

// Follow-up-due count from the prospecting CRM (supabase/migrations/0046_prospecting_crm.sql).
function ProspectFollowUpCard({ uid }) {
  const { data: dueProspects } = useSupabaseQuery(
    () =>
      uid &&
      supabase
        .from("prospects")
        .select("id, next_follow_up_at")
        .eq("owner_uid", uid)
        .not("status", "in", "(joined,not_interested)")
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", new Date().toISOString().slice(0, 10)),
    [uid],
  );

  const dueCount = dueProspects?.length ?? 0;

  return (
    <div className="card-elevated rise-in" style={{ animationDelay: "0.18s" }}>
      <div className="card-title">
        <Icon name="network" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Prospecting
      </div>
      {dueCount > 0 ? (
        <p style={{ fontSize: "13.5px", marginBottom: "14px" }}>
          <strong style={{ color: "var(--navy)" }}>{dueCount}</strong> follow-up{dueCount === 1 ? "" : "s"} due today or overdue.
        </p>
      ) : (
        <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>No follow-ups due right now.</p>
      )}
      <Link to="/network/prospects" className="btn btn-secondary">
        View prospects
      </Link>
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
    <div className="card-elevated rise-in" style={{ animationDelay: "0.22s" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="trophy" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        This Week's Leaders
      </div>
      <p className="card-subtitle">Who's #1 on each board right now.</p>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      )}

      {!loading && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
          {Object.entries(LEADER_CATEGORY).map(([key, meta]) => {
            const leader = data?.[key]?.[0];
            return (
              <li key={key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", color: "var(--slate)" }}>
                  <Icon name={meta.icon} size={14} />
                </span>
                {leader ? (
                  <>
                    <Avatar name={leader.displayName} photoPath={leader.photoUrl} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "13.5px",
                          fontWeight: 600,
                          color: "var(--navy)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {leader.displayName}
                        {leader.uid === uid && " (you)"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--slate)" }}>{meta.label}</div>
                    </div>
                    <span style={{ fontSize: "15px" }}>🥇</span>
                    <span style={{ fontWeight: 700, fontSize: "13.5px", flexShrink: 0 }}>{meta.format(leader)}</span>
                  </>
                ) : (
                  <div style={{ flex: 1, fontSize: "13px", color: "var(--slate)" }}>{meta.label} — no one yet this week</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link to="/leaderboard" className="btn btn-secondary" style={{ marginTop: "16px" }}>
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
  { to: "/network/prospects", icon: "network", label: "Prospects" },
  { to: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { to: "/notifications", icon: "bell", label: "Notifications" },
];

function Hero({ firstName, today }) {
  const outstanding = today.total - today.doneCount;
  const subtitle = today.loading
    ? "Loading your day…"
    : today.total === 0
      ? "You're all caught up — nothing needs your attention today."
      : outstanding === 0
        ? "Everything's done for today. Nice work."
        : `You have ${outstanding} thing${outstanding === 1 ? "" : "s"} to knock out today.`;

  return (
    <div className="hero-banner rise-in">
      <h1>
        {greeting()}, {firstName} 👋
      </h1>
      <p>{subtitle}</p>
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
  const health = computeProfileHealth({ profile, whysCount: whys?.length, goals: goalsRow });
  const today = useTodayTasks(user?.id);

  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <Hero firstName={firstName} today={today} />

      <TodayTasksCard today={today} />

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <ProfileProgressCard health={health} />
        <RankJourneyCard profile={profile} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <MyNetworkCard uid={user?.id} />
        <GoalsNudgeCard uid={user?.id} />
        <ProspectFollowUpCard uid={user?.id} />
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
