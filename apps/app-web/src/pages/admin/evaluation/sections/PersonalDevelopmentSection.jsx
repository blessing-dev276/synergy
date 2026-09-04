import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// Two real sources: Training's Personal Development stage completions
// (0107/0108) and this month's "personal" category on their monthly goals
// (same jsonb shape GoalReviewsSection.jsx already reads: goals.personal =
// [{ text, progress, target, unit }]).
export default function PersonalDevelopmentSection({ member }) {
  const { loading: loadingCompletions, data: completions } = useSupabaseQuery(
    () =>
      supabase
        .from("personal_development_completions")
        .select("id, completed_on, resource:resources(title)")
        .eq("user_id", member.id)
        .order("completed_on", { ascending: false }),
    [member.id],
  );
  const period = currentPeriod();
  const { data: goalsRow } = useSupabaseQuery(
    () => supabase.from("monthly_goals").select("goals").eq("uid", member.id).eq("period", period).maybeSingle(),
    [member.id, period],
  );

  if (loadingCompletions) return <Skeleton variant="card" height="90px" />;

  const rows = completions ?? [];
  const personalGoals = goalsRow?.goals?.personal ?? [];

  if (rows.length === 0 && personalGoals.length === 0) {
    return <EmptyState icon={<Icon name="target" size={24} />} title="No personal development activity yet" />;
  }

  return (
    <div>
      <div style={{ marginBottom: personalGoals.length > 0 ? "14px" : 0 }}>
        <div className="row-meta" style={{ marginBottom: "6px" }}>
          Resources completed ({rows.length})
        </div>
        {rows.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--slate)" }}>None yet.</p>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
            {rows.slice(0, 5).map((c) => (
              <li key={c.id} style={{ fontSize: "13px" }}>
                <Icon name="check" size={11} style={{ color: "var(--success)", verticalAlign: "-1px", marginRight: "5px" }} />
                {c.resource?.title ?? "Resource"} <span style={{ color: "var(--slate)" }}>— {new Date(c.completed_on).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {personalGoals.length > 0 && (
        <div>
          <div className="row-meta" style={{ marginBottom: "6px" }}>
            This month's Personal Development goals
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
            {personalGoals.map((g, i) => (
              <li key={i} style={{ fontSize: "13px" }}>
                {g.text}
                {g.target != null && (
                  <span style={{ color: "var(--slate)" }}>
                    {" "}
                    ({g.progress ?? 0}/{g.target} {g.unit ?? ""})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
