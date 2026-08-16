import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { computeProfileHealth } from "../../lib/profileHealth.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// Business Path v2: no more stage/track progress to visualize -- a member
// just has one admin-assigned rank (profiles.rank_id, see supabase/
// migrations/0059_business_path_v2_schema.sql) and sees whichever Learning
// Hub paths are attached to it (get_learning_paths, 0060 -- already
// rank-filtered server-side, same call PathList.jsx uses).
function RankCard({ profile }) {
  const { data: rank } = useSupabaseQuery(
    () => profile?.rank_id && supabase.from("ranks").select("id, title").eq("id", profile.rank_id).maybeSingle(),
    [profile?.rank_id],
  );
  const { loading, data: paths } = useSupabaseQuery(() => supabase.rpc("get_learning_paths", {}), []);

  return (
    <div className="card-elevated" style={{ marginTop: "24px", marginBottom: "24px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Your rank
      </div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--gold)", marginTop: "4px" }}>
        {rank?.title ?? "Not yet assigned"}
      </div>
      {!profile?.rank_id && (
        <p style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "8px" }}>An admin hasn't assigned you a rank yet.</p>
      )}

      <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
        <div className="row-meta" style={{ marginBottom: "8px" }}>
          Your learning paths
        </div>
        {loading && <Skeleton variant="text" width="200px" height="18px" />}
        {!loading && (!paths || paths.length === 0) && (
          <p style={{ fontSize: "13px", color: "var(--slate)" }}>No paths available yet.</p>
        )}
        {paths && paths.length > 0 && (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {paths.slice(0, 5).map((p) => (
              <li key={p.id} style={{ fontSize: "13.5px" }}>{p.title}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: "16px" }}>
        <Link to="/learning" className="btn btn-secondary">
          Browse Learning Hub
        </Link>
      </div>
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

  const { data: whys } = useSupabaseQuery(
    () => user && supabase.from("member_whys").select("id").eq("uid", user.id),
    [user?.id],
  );
  const { data: goalsRow } = useSupabaseQuery(
    () => user && supabase.from("member_goals").select("*").eq("uid", user.id).maybeSingle(),
    [user?.id],
  );
  const health = computeProfileHealth({ profile, whysCount: whys?.length, goals: goalsRow });

  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <div className="hero-banner">
        <h1>
          {greeting()}, {firstName} 👋
        </h1>
        <p>You're making progress. Keep going.</p>
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

      <RankCard profile={profile} />

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
