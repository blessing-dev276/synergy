import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { setMyBusinessPathSpecialization } from "../../lib/rpc.js";
import { computeProfileHealth } from "../../lib/profileHealth.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Track icons are admin-configurable free-text (emoji) in the DB, but the
// three built-in tracks get a matching line icon for visual consistency
// with the rest of the app; unknown/custom track keys fall back to
// whatever the admin set.
const TRACK_ICONS = { skill: "target", business: "briefcase", freelancing: "laptop" };

function TrackIcon({ track, size = 18 }) {
  const iconName = TRACK_ICONS[track.key];
  if (iconName) return <Icon name={iconName} size={size} />;
  return <span aria-hidden="true">{track.icon}</span>;
}

// Groups the flat daily-task list (get_or_generate_daily_tasks) by track so
// it reads like the spec's worked example (Skill Development / Freelancing /
// Network Marketing sections) instead of one undifferentiated list.
// Individually-assigned tasks (no track) land in their own "Assigned to you" group.
function groupDailyTasks(tasks) {
  const groups = new Map();
  for (const t of tasks ?? []) {
    const key = t.trackKey ?? "_individual";
    if (!groups.has(key)) {
      groups.set(key, { key, label: t.trackLabel ?? "Assigned to you", icon: TRACK_ICONS[t.trackKey] ?? "check-square", items: [] });
    }
    groups.get(key).items.push(t);
  }
  return [...groups.values()];
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function ProgressRing({ percent, size = 76, stroke = 7 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);

  return (
    <div className="progress-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--blue)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="progress-ring-label">{percent}%</div>
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

// One skill, chosen once (server-enforced in set_my_business_path_specialization
// — see supabase/migrations/0051_business_path_functions.sql). Graphics Design
// stays unlocked during the newbie stage for everyone regardless of pick
// (server marks it `locked: false`); the rest show a lock icon until an
// admin reassigns the member's choice.
function SpecializationPicker({ track, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const specializations = track.specializations ?? [];
  const selectedId = track.selectedSpecializationId;

  if (specializations.length === 0) return null;

  const choose = async (spec) => {
    if (selectedId || saving) return;
    setSaving(true);
    try {
      await setMyBusinessPathSpecialization(track.trackId, spec.id);
      toast.success(`${spec.label} is now your skill.`);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't set your skill.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
      <div
        style={{
          fontSize: "11.5px",
          fontWeight: 600,
          color: "var(--slate)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "8px",
        }}
      >
        {selectedId ? "Your skill" : "Choose your one skill"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {specializations.map((spec) => {
          const isChosen = spec.id === selectedId;
          const disabled = saving || Boolean(selectedId);
          const title = isChosen
            ? "Your chosen skill"
            : selectedId
              ? "Locked — ask an admin to change your skill"
              : spec.locked
                ? "Choose this as your one skill"
                : "Unlocked for the Newbie stage";

          return (
            <button
              key={spec.id}
              type="button"
              className={`badge ${isChosen ? "badge-success" : "badge-neutral"}`}
              onClick={() => choose(spec)}
              disabled={disabled}
              title={title}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: "none",
                cursor: disabled ? (isChosen ? "default" : "not-allowed") : "pointer",
                opacity: !isChosen && selectedId ? 0.55 : 1,
              }}
            >
              <span aria-hidden="true">{spec.icon}</span>
              {spec.label}
              {isChosen && <Icon name="check" size={11} />}
              {!isChosen && spec.locked && <Icon name="lock" size={11} />}
            </button>
          );
        })}
      </div>
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
    <div className="card-elevated">
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
    <div className="card-elevated">
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

export default function Dashboard() {
  const { user, profile } = useAuth();

  // get_business_path_overview/get_next_business_path_action are reads
  // despite being RPCs (progress/next-action logic must be
  // server-authoritative, see supabase/migrations/0051_business_path_
  // functions.sql) — used the same way as any other useSupabaseQuery read.
  const {
    loading: loadingJourney,
    error: journeyError,
    data: journey,
    refetch: refetchJourney,
  } = useSupabaseQuery(() => user && supabase.rpc("get_business_path_overview", { p_uid: user.id }), [user?.id]);

  const {
    loading: loadingAction,
    error: actionError,
    data: nextAction,
  } = useSupabaseQuery(() => user && supabase.rpc("get_next_business_path_action", { p_uid: user.id }), [user?.id]);

  // Today's list is generated once per calendar day and then stays fixed
  // (see get_or_generate_daily_tasks, supabase/migrations/0044_daily_tasks.sql)
  // -- completion status (isDone) still reflects reality live.
  const {
    loading: loadingDailyTasks,
    error: dailyTasksError,
    data: dailyTasks,
  } = useSupabaseQuery(() => user && supabase.rpc("get_or_generate_daily_tasks", { p_uid: user.id }), [user?.id]);

  const { data: whys } = useSupabaseQuery(
    () => user && supabase.from("member_whys").select("id").eq("uid", user.id),
    [user?.id],
  );
  const { data: goalsRow } = useSupabaseQuery(
    () => user && supabase.from("member_goals").select("*").eq("uid", user.id).maybeSingle(),
    [user?.id],
  );
  const health = computeProfileHealth({ profile, whysCount: whys?.length, goals: goalsRow });

  const stage = journey?.stage;
  const tracks = journey?.tracks ?? [];
  const level = journey?.level;
  const levelProgressPercent = journey?.levelProgressPercent ?? 0;
  const nextLevel = journey?.nextLevel;
  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <div className="hero-banner">
        <h1>
          {greeting()}, {firstName} 👋
        </h1>
        <p>{stage ? `Your Business Path — ${stage.title}` : "You're making progress. Keep going."}</p>
      </div>

      {!health.complete && (
        <div className="card-elevated" style={{ marginTop: "24px", borderColor: "var(--blue)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div className="card-title" style={{ marginBottom: "4px" }}>
                Finish setting up your profile
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--slate)" }}>
                {health.items
                  .filter((i) => !i.done)
                  .map((i) => i.label)
                  .join(" · ")}
              </p>
            </div>
            <Link to="/profile" className="btn btn-primary">
              Complete profile
            </Link>
          </div>
        </div>
      )}

      {level && (
        <div className="card-elevated" style={{ marginTop: "24px", borderColor: "var(--gold)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Path Level
              </div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--gold)", marginTop: "4px" }}>{level.label}</div>
            </div>
            {nextLevel && (
              <div style={{ minWidth: "200px", flex: 1, maxWidth: "320px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "var(--slate)", marginBottom: "6px" }}>
                  <span>{levelProgressPercent}% to {nextLevel.label}</span>
                </div>
                <div style={{ height: "8px", borderRadius: "100px", background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(levelProgressPercent, 100)}%`, height: "100%", borderRadius: "100px", background: "var(--gold)" }} />
                </div>
              </div>
            )}
          </div>
          {level.purpose && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "14px" }}>{level.purpose}</p>}
        </div>
      )}

      {loadingJourney && <Skeleton variant="card" height="100px" style={{ marginTop: "24px" }} />}
      {journeyError && <ErrorState description="Couldn't load your journey." />}
      {!loadingJourney && !journeyError && !stage && (
        <div style={{ marginTop: "24px" }}>
          <EmptyState
            icon={<Icon name="compass" size={28} />}
            title="Your Business Path hasn't started yet"
            description="An admin will get you set up shortly."
          />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="grid grid-3" style={{ marginTop: "24px", marginBottom: "24px" }}>
          {tracks.map((track) => (
            <div key={track.trackId} className="card-elevated">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <TrackIcon track={track} />
                {track.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "10px" }}>
                <ProgressRing percent={track.progressPercent ?? 0} size={60} stroke={6} />
                <div style={{ fontSize: "13px", color: "var(--slate)" }}>
                  {track.progressPercent ?? 0}% complete
                </div>
              </div>
              <SpecializationPicker track={track} onChanged={refetchJourney} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <div className="card-elevated">
          <div className="card-title">Your Next Best Action</div>
          {loadingAction && <Skeleton variant="card" height="80px" />}
          {actionError && <ErrorState description="Couldn't load your next step." />}
          {!loadingAction && !actionError && !nextAction && (
            <EmptyState icon={<Icon name="check" size={28} />} title="You're all caught up" description="Check back soon for your next task." />
          )}
          {nextAction && (
            <>
              <span className="badge badge-neutral" style={{ marginBottom: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Icon name={TRACK_ICONS[nextAction.trackKey] ?? "target"} size={13} />
                {nextAction.trackLabel}
              </span>
              <div style={{ fontWeight: 600, margin: "6px 0" }}>{nextAction.title}</div>
              {nextAction.description && (
                <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>{nextAction.description}</p>
              )}
              <Link to="/tasks" className="btn btn-primary">
                Continue →
              </Link>
            </>
          )}
        </div>

        <div className="card-elevated">
          <div className="card-title">Today's Tasks</div>
          {loadingDailyTasks && <Skeleton variant="card" height="80px" />}
          {dailyTasksError && <ErrorState description="Couldn't load today's tasks." />}
          {!loadingDailyTasks && !dailyTasksError && (!dailyTasks || dailyTasks.length === 0) && (
            <EmptyState icon={<Icon name="check-square" size={28} />} title="Nothing assigned for today" />
          )}
          {dailyTasks && dailyTasks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {groupDailyTasks(dailyTasks).map((group) => (
                <div key={group.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "var(--slate)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "8px",
                    }}
                  >
                    <Icon name={group.icon} size={13} />
                    {group.label}
                  </div>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {group.items.map((task) => (
                      <li key={task.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                        <span>{task.title}</span>
                        <span className={`badge ${task.isDone ? "badge-success" : "badge-neutral"}`}>
                          {task.isDone ? "Done" : task.taskType?.replace("_", " ") ?? "task"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: "14px" }}>
            <Link to="/tasks" className="btn btn-secondary">
              View all tasks
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "24px" }}>
        <GoalsNudgeCard uid={user?.id} />
        <ProspectFollowUpCard uid={user?.id} />
      </div>

      <div className="quick-actions">
        {QUICK_ACTIONS.map((qa) => (
          <Link key={qa.to} to={qa.to} className="quick-action">
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
