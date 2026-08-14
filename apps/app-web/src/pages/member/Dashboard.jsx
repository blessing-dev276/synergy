import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { requestStagePromotion, setMemberSpecialization } from "../../lib/rpc.js";
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
  { to: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { to: "/notifications", icon: "bell", label: "Notifications" },
];

// Shown once every track in the member's current stage hits 100% — lets
// them ask an admin to review and move them forward, rather than an admin
// having to notice on their own (see request_stage_promotion in
// supabase/migrations/0025_stage_promotion_requests.sql). The server
// re-verifies 100% completion itself, so this button is just a convenience
// gate, not the actual check.
function PromotionCard({ uid, tracks, onRequested }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: pending, refetch } = useSupabaseQuery(
    () =>
      uid &&
      supabase
        .from("stage_promotion_requests")
        .select("*, to_stage:stages!stage_promotion_requests_to_stage_id_fkey(title)")
        .eq("uid", uid)
        .eq("status", "pending")
        .maybeSingle(),
    [uid],
  );

  const allComplete = tracks.length > 0 && tracks.every((t) => (t.progressPercent ?? 0) >= 100);
  if (!pending && !allComplete) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await requestStagePromotion();
      toast.success("Promotion requested — an admin will review it shortly.");
      refetch();
      onRequested?.();
    } catch (err) {
      toast.error(err.message ?? "Couldn't request a promotion right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "24px", borderColor: "var(--gold)" }}>
      <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon name="trophy" size={16} />
        {pending ? "Promotion requested" : "Every track complete!"}
      </div>
      {pending ? (
        <p style={{ fontSize: "13.5px", color: "var(--slate)" }}>
          Waiting on an admin to review your move to <strong style={{ color: "var(--navy)" }}>{pending.to_stage?.title}</strong>.
        </p>
      ) : (
        <>
          <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
            You've finished every track in this stage. Ask an admin to review and move you to the next one.
          </p>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Requesting…" : "Request promotion"}
          </button>
        </>
      )}
    </div>
  );
}

// Milestones the member has earned, plus the next few unearned published
// ones as a preview — mirrors the ✓ / ○ checklist from the architecture
// proposal. Read directly off milestones/member_milestones (both readable
// by any authenticated member via RLS, see 0033) rather than an RPC, same
// pattern as other simple read-only lists in this app.
function MilestonesCard({ uid }) {
  const { data: milestones } = useSupabaseQuery(() => supabase.from("milestones").select("*").eq("published", true).order("order_index"), []);
  const { data: earned } = useSupabaseQuery(
    () => uid && supabase.from("member_milestones").select("milestone_id, achieved_at").eq("uid", uid),
    [uid],
  );

  if (!milestones || milestones.length === 0) return null;

  const earnedIds = new Set((earned ?? []).map((e) => e.milestone_id));
  const rows = [...milestones].sort((a, b) => (earnedIds.has(b.id) ? 1 : 0) - (earnedIds.has(a.id) ? 1 : 0));

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">Milestones</div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
        {rows.map((m) => {
          const done = earnedIds.has(m.id);
          return (
            <li key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", opacity: done ? 1 : 0.6 }}>
              <span
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  background: done ? "var(--gold-soft)" : "transparent",
                  color: done ? "var(--gold)" : "var(--slate)",
                  border: done ? "none" : "1px solid var(--line)",
                }}
              >
                {done ? "✓" : "○"}
              </span>
              <span style={{ fontSize: "13.5px" }}>{m.title}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// One skill, chosen once (server-enforced in set_member_specialization —
// see supabase/migrations/0038_specialization_lock.sql). Graphics Design
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
      await setMemberSpecialization(track.trackId, spec.id);
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

export default function Dashboard() {
  const { user, profile } = useAuth();

  // get_journey_overview/get_next_best_action are reads despite being RPCs
  // (progress/next-action logic must be server-authoritative, see
  // supabase/migrations/0009_journey_functions.sql) — used the same way as
  // any other useSupabaseQuery read.
  const {
    loading: loadingJourney,
    error: journeyError,
    data: journey,
    refetch: refetchJourney,
  } = useSupabaseQuery(() => user && supabase.rpc("get_journey_overview", { p_uid: user.id }), [user?.id]);

  const {
    loading: loadingAction,
    error: actionError,
    data: nextAction,
  } = useSupabaseQuery(() => user && supabase.rpc("get_next_best_action", { p_uid: user.id }), [user?.id]);

  const {
    loading: loadingTasks,
    error: tasksError,
    data: tasks,
  } = useSupabaseQuery(
    () => user && supabase.rpc("get_my_content_assignments", { p_uid: user.id }),
    [user?.id],
  );

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
  const rank = journey?.rank;
  const rankProgressPercent = journey?.rankProgressPercent ?? 0;
  const nextRank = journey?.nextRank;
  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <div className="hero-banner">
        <h1>
          {greeting()}, {firstName} 👋
        </h1>
        <p>{stage ? `Your Synergy Journey — ${stage.title}` : "You're making progress. Keep going."}</p>
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

      {rank && (
        <div className="card-elevated" style={{ marginTop: "24px", borderColor: "var(--gold)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Rank
              </div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--gold)", marginTop: "4px" }}>{rank.label}</div>
            </div>
            {nextRank && (
              <div style={{ minWidth: "200px", flex: 1, maxWidth: "320px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "var(--slate)", marginBottom: "6px" }}>
                  <span>{rankProgressPercent}% to {nextRank.label}</span>
                </div>
                <div style={{ height: "8px", borderRadius: "100px", background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(rankProgressPercent, 100)}%`, height: "100%", borderRadius: "100px", background: "var(--gold)" }} />
                </div>
              </div>
            )}
          </div>
          {rank.purpose && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "14px" }}>{rank.purpose}</p>}
        </div>
      )}

      {loadingJourney && <Skeleton variant="card" height="100px" style={{ marginTop: "24px" }} />}
      {journeyError && <ErrorState description="Couldn't load your journey." />}
      {!loadingJourney && !journeyError && !stage && (
        <div style={{ marginTop: "24px" }}>
          <EmptyState
            icon={<Icon name="compass" size={28} />}
            title="Your journey hasn't started yet"
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

      {!loadingJourney && <PromotionCard uid={user?.id} tracks={tracks} />}

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
          {loadingTasks && <Skeleton variant="card" height="80px" />}
          {tasksError && <ErrorState description="Couldn't load your tasks." />}
          {!loadingTasks && !tasksError && (!tasks || tasks.length === 0) && (
            <EmptyState icon={<Icon name="check-square" size={28} />} title="Nothing assigned right now" />
          )}
          {tasks && tasks.length > 0 && (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {tasks.slice(0, 5).map((task) => (
                <li key={task.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{task.title}</span>
                  <span className={`badge ${task.isDone ? "badge-success" : "badge-neutral"}`}>
                    {task.isDone ? "Done" : task.taskType?.replace("_", " ") ?? "task"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "14px" }}>
            <Link to="/tasks" className="btn btn-secondary">
              View all tasks
            </Link>
          </div>
        </div>
      </div>

      <MilestonesCard uid={user?.id} />

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
