import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

const MILESTONES = [
  { key: "skill_selected_at", label: "Skill selected" },
  { key: "portfolio_built_at", label: "Portfolio built" },
  { key: "freelancing_started_at", label: "Freelancing started" },
  { key: "first_income_at", label: "First income logged" },
  { key: "consistency_at", label: "Consistent income" },
];

// Training: Income Development stage (0112) -- income_development_progress
// is the same milestone timeline the member's own stage view tracks
// (skill_selected_at -> ... -> consistency_at, each a timestamp or null).
export default function FreelancingSection({ member }) {
  const { loading: loadingProgress, data: progress } = useSupabaseQuery(
    () => supabase.from("income_development_progress").select("*").eq("user_id", member.id).maybeSingle(),
    [member.id],
  );
  const { loading: loadingPortfolio, data: portfolio } = useSupabaseQuery(
    () => supabase.from("income_development_portfolio_items").select("id, title").eq("user_id", member.id),
    [member.id],
  );
  const { data: incomeEntries } = useSupabaseQuery(
    () => supabase.from("income_development_income_entries").select("amount").eq("user_id", member.id),
    [member.id],
  );

  const loading = loadingProgress || loadingPortfolio;
  if (loading) return <Skeleton variant="card" height="100px" />;

  const achieved = MILESTONES.filter((m) => progress?.[m.key]);
  const totalIncome = (incomeEntries ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  if (achieved.length === 0 && (portfolio ?? []).length === 0) {
    return <EmptyState icon={<Icon name="briefcase" size={24} />} title="No freelancing activity yet" />;
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
        {MILESTONES.map((m) => {
          const done = Boolean(progress?.[m.key]);
          return (
            <span key={m.key} className={`badge ${done ? "badge-success" : "badge-neutral"}`}>
              {done && <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: "4px" }} />}
              {m.label}
            </span>
          );
        })}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", rowGap: "10px", fontSize: "13.5px", margin: 0 }}>
        <div>
          <dt className="row-meta">Portfolio items</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>{(portfolio ?? []).length}</dd>
        </div>
        <div>
          <dt className="row-meta">Logged income</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>${totalIncome.toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}
