import { Link } from "react-router-dom";
import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

// get_admin_prospecting_overview (0046) already returns one row per member
// -- same source NetworkOverview.jsx's OverviewSection.jsx aggregates
// across everyone; this just finds this one member's row instead of
// summing them.
export default function NetworkSection({ member, networkOverview, loadingNetworkOverview }) {
  const { loading: loadingProspecting, data: prospectingRows } = useSupabaseQuery(
    () => supabase.rpc("get_admin_prospecting_overview", {}),
    [],
  );

  const prospecting = (prospectingRows ?? []).find((r) => r.uid === member.id);
  const loading = loadingNetworkOverview || loadingProspecting;

  if (loading) return <Skeleton variant="card" height="100px" />;

  const hasAny = (prospecting?.totalProspects ?? 0) > 0 || (networkOverview?.personallySponsoredCount ?? 0) > 0;
  if (!hasAny) {
    return <EmptyState icon={<Icon name="network" size={24} />} title="No prospecting or network activity yet" />;
  }

  return (
    <div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", rowGap: "10px", fontSize: "13.5px", margin: "0 0 10px" }}>
        <div>
          <dt className="row-meta">Prospects added</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>{prospecting?.totalProspects ?? 0}</dd>
        </div>
        <div>
          <dt className="row-meta">Follow-ups overdue</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px", color: prospecting?.overdueFollowUps > 0 ? "var(--danger)" : undefined }}>
            {prospecting?.overdueFollowUps ?? 0}
          </dd>
        </div>
        <div>
          <dt className="row-meta">Personally sponsored</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>{networkOverview?.personallySponsoredCount ?? 0}</dd>
        </div>
      </dl>
      {prospecting?.lastActivityAt && (
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "10px" }}>
          Last prospecting activity {new Date(prospecting.lastActivityAt).toLocaleDateString()}
        </p>
      )}
      <Link to="/admin/network?section=prospecting" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "12.5px" }}>
        Open Prospecting
      </Link>
    </div>
  );
}
