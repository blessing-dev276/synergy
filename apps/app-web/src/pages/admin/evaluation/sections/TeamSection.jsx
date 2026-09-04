import { Link } from "react-router-dom";
import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Avatar from "../../../../components/Avatar.jsx";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";

// Only rendered by MemberEvaluation.jsx once networkOverview says this
// member actually has a downline -- get_personally_sponsored(p_uid) is the
// same list NetworkTree/OverviewSection draw from, admin-scoped the same
// way get_network_overview already is (0019: any uid, if caller is admin).
export default function TeamSection({ member, networkOverview }) {
  const { loading, data: sponsored } = useSupabaseQuery(() => supabase.rpc("get_personally_sponsored", { p_uid: member.id }), [member.id]);

  if (loading) return <Skeleton variant="card" height="90px" />;

  const rows = sponsored ?? [];

  return (
    <div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", rowGap: "10px", fontSize: "13.5px", margin: "0 0 12px" }}>
        <div>
          <dt className="row-meta">Personally sponsored</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>{networkOverview?.personallySponsoredCount ?? rows.length}</dd>
        </div>
        <div>
          <dt className="row-meta">Total network</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>{networkOverview?.networkSize ?? "—"}</dd>
        </div>
        <div>
          <dt className="row-meta">Overdue training in network</dt>
          <dd style={{ margin: 0, fontWeight: 700, fontSize: "18px", color: networkOverview?.membersWithOverdueTasks > 0 ? "var(--danger)" : undefined }}>
            {networkOverview?.membersWithOverdueTasks ?? "—"}
          </dd>
        </div>
      </dl>

      {rows.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          {rows.slice(0, 6).map((s) => (
            <li key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <Avatar name={s.displayName} photoPath={s.photoUrl} size={24} />
              <span style={{ flex: 1 }}>{s.displayName}</span>
              {s.overdueTaskCount > 0 && <span className="badge badge-warning">{s.overdueTaskCount} overdue</span>}
            </li>
          ))}
        </ul>
      )}

      <Link to="/admin/network" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "12.5px" }}>
        <Icon name="network" size={12} style={{ verticalAlign: "-1px", marginRight: "4px" }} />
        Explore in Network
      </Link>
    </div>
  );
}
