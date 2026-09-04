import { useParams, Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import Avatar from "../../../components/Avatar.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import BackLink from "../../../components/BackLink.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import EvaluationNotesPanel from "./components/EvaluationNotesPanel.jsx";
import EvaluationHistory from "./components/EvaluationHistory.jsx";
import RecentActivity from "./components/RecentActivity.jsx";
import WorkTasksSection from "./sections/WorkTasksSection.jsx";
import LearningSection from "./sections/LearningSection.jsx";
import NetworkSection from "./sections/NetworkSection.jsx";
import FreelancingSection from "./sections/FreelancingSection.jsx";
import PersonalDevelopmentSection from "./sections/PersonalDevelopmentSection.jsx";
import RankJourneySection from "./sections/RankJourneySection.jsx";
import ReportsSection from "./sections/ReportsSection.jsx";
import TeamSection from "./sections/TeamSection.jsx";

const STATUS_BADGE = { pending: "badge-info", active: "badge-success", suspended: "badge-warning", removed: "badge-danger" };

// One evaluation category, in a plain card rather than an accordion --
// Evaluation Center's whole point is not making an admin open six sections
// just to see what's going on (see the request's own §20).
function Section({ icon, title, children }) {
  return (
    <div className="card-elevated" style={{ marginBottom: "16px" }}>
      <div className="card-title" style={{ marginBottom: "12px" }}>
        <Icon name={icon} size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        {title}
      </div>
      {children}
    </div>
  );
}

export default function MemberEvaluation() {
  const { uid } = useParams();

  const { loading, data: member } = useSupabaseQuery(() => supabase.from("profiles").select("*").eq("id", uid).single(), [uid]);
  const { data: ranks } = useSupabaseQuery(() => supabase.rpc("admin_list_ranks", {}), []);
  const { data: sponsor } = useSupabaseQuery(
    () => member?.sponsor_uid && supabase.from("profiles").select("display_name").eq("id", member.sponsor_uid).single(),
    [member?.sponsor_uid],
  );
  const { data: networkOverview, loading: loadingNetworkOverview } = useSupabaseQuery(
    () => supabase.rpc("get_network_overview", { p_uid: uid }),
    [uid],
  );
  const { loading: loadingHistory, data: history, refetch: refetchHistory } = useSupabaseQuery(
    () => supabase.rpc("get_member_evaluation_history", { p_uid: uid }),
    [uid],
  );

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!member) return null;

  const rankTitle = (ranks ?? []).find((r) => r.id === member.rank_id)?.title;
  const lastEvaluation = (history ?? [])[0];

  return (
    <div>
      <BackLink to="/admin/evaluation">Back to Evaluation Center</BackLink>

      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "16px", marginBottom: "22px", flexWrap: "wrap" }}>
        <Avatar name={member.display_name} photoPath={member.photo_url} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: "4px" }}>Evaluate {member.display_name || member.email}</h1>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span className={`badge ${STATUS_BADGE[member.status] ?? "badge-neutral"}`}>{member.status}</span>
            <StatusBadge status={lastEvaluation?.status ?? "not_evaluated"} />
          </div>
        </div>
        <Link to={`/admin/members/${member.id}`} className="btn btn-secondary">
          Manage member
        </Link>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", rowGap: "10px", fontSize: "13.5px", marginBottom: "24px" }}>
        <div>
          <dt className="row-meta">Rank</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{rankTitle ?? "No rank assigned"}</dd>
        </div>
        <div>
          <dt className="row-meta">Joined</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}</dd>
        </div>
        <div>
          <dt className="row-meta">Sponsor</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{sponsor?.display_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="row-meta">Last evaluated</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{lastEvaluation ? new Date(lastEvaluation.createdAt).toLocaleDateString() : "Never"}</dd>
        </div>
      </dl>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Section icon="check-square" title="Work & Tasks">
          <WorkTasksSection member={member} />
        </Section>
        <Section icon="book" title="Learning">
          <LearningSection member={member} />
        </Section>
        <Section icon="network" title="Network Marketing">
          <NetworkSection member={member} networkOverview={networkOverview} loadingNetworkOverview={loadingNetworkOverview} />
        </Section>
        <Section icon="briefcase" title="Freelancing">
          <FreelancingSection member={member} />
        </Section>
        <Section icon="target" title="Personal Development">
          <PersonalDevelopmentSection member={member} />
        </Section>
        <Section icon="compass" title="Rank Journey">
          <RankJourneySection member={member} />
        </Section>
        <Section icon="clipboard" title="Reports">
          <ReportsSection member={member} />
        </Section>
        {!loadingNetworkOverview && networkOverview?.personallySponsoredCount > 0 && (
          <Section icon="users" title="Team">
            <TeamSection member={member} networkOverview={networkOverview} />
          </Section>
        )}
      </div>

      <div className="grid grid-2" style={{ alignItems: "start", marginTop: "8px" }}>
        <EvaluationNotesPanel member={member} onSaved={refetchHistory} />
        <RecentActivity uid={member.id} />
      </div>

      <div style={{ marginTop: "16px" }}>
        <EvaluationHistory loading={loadingHistory} entries={history ?? []} />
      </div>
    </div>
  );
}
