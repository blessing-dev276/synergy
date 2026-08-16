import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import StatusSplitBar from "../../components/StatusSplitBar.jsx";

// Categorical triple validated against the dark surface with the dataviz
// skill's validator (all six checks pass) — kept separate from the lighter
// --gold/--success text tokens, which are tuned for legibility as text, not
// as fill marks on this dark background.
const ROLE_COLORS = { member: "#4C8DFF", mentor: "#B8792A", admin: "#0F9B6E" };

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTION_ICON = {
  task_completed: "check-square",
  task_assigned: "clipboard",
  member_stage_set: "compass",
  assignment_graded: "folder",
  assignment_submitted: "folder",
  weekly_leaderboard_finalized: "trophy",
  sponsor_assigned: "network",
  role_changed: "user",
  orientation_submitted: "check-square",
  member_status_changed: "user-x",
  content_assignment_completed: "check-square",
  earning_reviewed: "dollar-sign",
  earning_logged: "dollar-sign",
};

// Actions a human actor takes on themselves/another member get a "<actor>
// <verb>" sentence; system-triggered actions (no actor_uid, e.g. the weekly
// leaderboard cron) read as a standalone statement instead of "Someone …".
const ACTION_LABEL = {
  task_completed: "completed a task",
  task_assigned: "was assigned a task",
  member_stage_set: "moved to a new journey stage",
  assignment_graded: "had an assignment reviewed",
  assignment_submitted: "submitted an assignment",
  weekly_leaderboard_finalized: "Weekly leaderboard finalized",
  sponsor_assigned: "assigned a sponsor",
  role_changed: "had their role changed",
  orientation_submitted: "submitted orientation",
  member_status_changed: "had their account status changed",
  content_assignment_completed: "completed an activity",
  earning_reviewed: "reviewed an earning",
  earning_logged: "logged an earning",
};

const SYSTEM_ACTIONS = new Set(["weekly_leaderboard_finalized"]);

function StatTile({ label, value, icon, tone, loading, to }) {
  const inner = (
    <div className="stat-tile">
      <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="stat-tile-label">{label}</div>
        {loading ? <Skeleton variant="text" width="46px" height="26px" /> : <div className="stat-tile-value">{value}</div>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="card-elevated">
      {inner}
    </Link>
  ) : (
    <div className="card-elevated">{inner}</div>
  );
}

function AttentionRow({ icon, count, label, to }) {
  return (
    <Link to={to} className="attention-row">
      <span className="icon-badge tone-danger">
        <Icon name={icon} size={17} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "14px" }}>{label}</div>
      </div>
      <span className="attention-count" style={{ color: "var(--danger)" }}>
        {count}
      </span>
      <Icon name="chevron-right" size={16} style={{ color: "var(--slate)" }} />
    </Link>
  );
}

function TeamComposition({ counts }) {
  const total = counts.member + counts.mentor + counts.admin;
  if (total === 0) return <EmptyState icon={<Icon name="users" size={24} />} title="No accounts yet" />;

  const segments = [
    { key: "member", label: "Members", value: counts.member },
    { key: "mentor", label: "Mentors", value: counts.mentor },
    { key: "admin", label: "Admins", value: counts.admin },
  ].filter((s) => s.value > 0);

  return (
    <>
      <div className="stacked-bar">
        {segments.map((s) => (
          <div
            key={s.key}
            className="stacked-bar-seg"
            style={{ width: `${(s.value / total) * 100}%`, background: ROLE_COLORS[s.key] }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="stacked-bar-legend">
        {segments.map((s) => (
          <div key={s.key} className="stacked-bar-legend-item">
            <span className="stacked-bar-legend-dot" style={{ background: ROLE_COLORS[s.key] }} />
            {s.label} · {s.value}
          </div>
        ))}
      </div>
    </>
  );
}

const QUICK_LINKS = [
  { to: "/admin/content", icon: "layers", label: "Learning Hub" },
  { to: "/admin/business-path", icon: "compass", label: "Business Path" },
  { to: "/admin/submissions", icon: "check-square", label: "Submissions" },
  { to: "/admin/settings/team", icon: "users", label: "Team" },
  { to: "/admin/network", icon: "network", label: "Network" },
  { to: "/admin/leaderboard", icon: "dollar-sign", label: "Leaderboard" },
  { to: "/admin/settings/activity", icon: "activity", label: "Activity Log" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        members,
        mentors,
        admins,
        activeThisWeek,
        newThisMonth,
        coursesPublished,
        coursesTotal,
        pendingAssignments,
        pendingEvidence,
        pendingRankTasks,
        quizAgg,
        activeNetwork,
        verifiedEarnings,
        statusRows,
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "member"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "mentor"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin"),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "member")
          .gt("last_active_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "member")
          .gt("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("published", true),
        supabase.from("courses").select("*", { count: "exact", head: true }),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("content_evidence_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("rank_task_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("quiz_attempts").select("score"),
        supabase.from("sponsor_relationships").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("earnings_logs").select("amount").eq("status", "verified"),
        supabase.from("profiles").select("status"),
      ]);
      if (cancelled) return;

      const scores = quizAgg.data ?? [];
      const avgQuizScore = scores.length > 0 ? Math.round(scores.reduce((sum, r) => sum + r.score, 0) / scores.length) : null;
      const earningsTotal = (verifiedEarnings.data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      const activeStatusCount = (statusRows.data ?? []).filter((r) => r.status === "active").length;
      const totalAccounts = (statusRows.data ?? []).length;

      setStats({
        members: members.count ?? 0,
        mentors: mentors.count ?? 0,
        admins: admins.count ?? 0,
        activeThisWeek: activeThisWeek.count ?? 0,
        newThisMonth: newThisMonth.count ?? 0,
        coursesPublished: coursesPublished.count ?? 0,
        coursesTotal: coursesTotal.count ?? 0,
        pendingReviews: (pendingAssignments.count ?? 0) + (pendingEvidence.count ?? 0) + (pendingRankTasks.count ?? 0),
        avgQuizScore,
        activeNetwork: activeNetwork.count ?? 0,
        earningsTotal,
        totalAccounts,
        activeAccounts: activeStatusCount,
        nonActiveAccounts: totalAccounts - activeStatusCount,
      });
    })();
    (async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("*, actor:profiles!activity_log_actor_uid_fkey(display_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setActivity(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPending = stats?.pendingReviews ?? 0;

  return (
    <div>
      <div className="hero-banner">
        <h1>Admin Overview</h1>
        <p>Manage the member journey, learning content, and your team from here.</p>
      </div>

      {stats && (
        <div className={`attention-card ${totalPending === 0 ? "all-clear" : ""}`} style={{ marginBottom: "24px" }}>
          {totalPending === 0 ? (
            <div className="attention-row">
              <span className="icon-badge tone-success">
                <Icon name="check" size={17} />
              </span>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>All caught up — nothing needs review right now.</div>
            </div>
          ) : (
            <>
              {stats.pendingReviews > 0 && (
                <AttentionRow icon="folder" count={stats.pendingReviews} label="Submissions awaiting review" to="/admin/submissions" />
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatTile label="Total members" value={stats?.members} icon="users" loading={!stats} to="/admin/settings/team" />
        <StatTile label="Active this week" value={stats?.activeThisWeek} icon="activity" tone="success" loading={!stats} />
        <StatTile label="New this month" value={stats?.newThisMonth} icon="user" loading={!stats} />
        <StatTile label="Published courses" value={stats && `${stats.coursesPublished}/${stats.coursesTotal}`} icon="book" loading={!stats} to="/admin/content" />
        <StatTile label="Avg. quiz score" value={stats && (stats.avgQuizScore === null ? "—" : `${stats.avgQuizScore}%`)} icon="target" loading={!stats} />
        <StatTile label="Active network" value={stats?.activeNetwork} icon="network" tone="warning" loading={!stats} to="/admin/network" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <div className="card-elevated">
          <div className="card-title" style={{ marginBottom: "16px" }}>
            Team composition
          </div>
          {!stats ? <Skeleton variant="card" height="60px" /> : <TeamComposition counts={{ member: stats.members, mentor: stats.mentors, admin: stats.admins }} />}
        </div>

        <div className="card-elevated">
          <div className="card-title" style={{ marginBottom: "4px" }}>
            <Icon name="activity" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
            Team status
          </div>
          <p className="card-subtitle" style={{ marginBottom: "12px" }}>
            {stats ? `${stats.totalAccounts} account${stats.totalAccounts === 1 ? "" : "s"} total` : "Loading…"}
          </p>
          {!stats ? (
            <Skeleton variant="card" height="60px" />
          ) : (
            <StatusSplitBar active={stats.activeAccounts} inactive={stats.nonActiveAccounts} />
          )}
        </div>

        <div className="card-elevated">
          <div className="card-title" style={{ marginBottom: "4px" }}>
            <Icon name="dollar-sign" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
            Verified earnings
          </div>
          {!stats ? (
            <Skeleton variant="text" width="120px" height="30px" />
          ) : (
            <>
              <div className="stat-tile-value" style={{ fontSize: "28px", marginTop: "10px" }}>
                ${stats.earningsTotal.toLocaleString()}
              </div>
              <div className="row-meta" style={{ marginTop: "6px" }}>
                Across all members, verified to date
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Quick links
      </div>
      <div className="quick-actions" style={{ marginTop: 0, marginBottom: "24px" }}>
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} className="quick-action">
            <span className="qa-icon">
              <Icon name={q.icon} size={17} />
            </span>
            <span className="qa-label">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Recent activity
      </div>
      {!activity && <Skeleton variant="card" height="160px" />}
      {activity && activity.length === 0 && <EmptyState icon={<Icon name="clipboard" size={26} />} title="No activity yet" />}
      {activity && activity.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          {activity.map((a) => (
            <div key={a.id} className="activity-row">
              <span className="activity-row-icon">
                <Icon name={ACTION_ICON[a.action] ?? "activity"} size={15} />
              </span>
              <div>
                <div className="activity-row-text">
                  {SYSTEM_ACTIONS.has(a.action) ? (
                    ACTION_LABEL[a.action]
                  ) : (
                    <>
                      <strong>{a.actor?.display_name ?? "Someone"}</strong> {ACTION_LABEL[a.action] ?? a.action.replaceAll("_", " ")}
                    </>
                  )}
                </div>
                <div className="activity-row-time">{relativeTime(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
