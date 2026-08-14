import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import Icon from "../../../components/Icon.jsx";

// One row per active member: who is actually prospecting and following up,
// not just who logged in (see supabase/migrations/0046_prospecting_crm.sql).
export default function ProspectingOverview() {
  const { loading, data: rows } = useSupabaseQuery(() => supabase.rpc("get_admin_prospecting_overview", {}), []);

  const list = rows ?? [];
  const totalOverdue = list.reduce((sum, r) => sum + (r.overdueFollowUps ?? 0), 0);
  const totalDueToday = list.reduce((sum, r) => sum + (r.dueTodayFollowUps ?? 0), 0);

  return (
    <div>
      <h1>Prospecting</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
        {totalDueToday} follow-up{totalDueToday === 1 ? "" : "s"} due today across the team · {totalOverdue} overdue
      </p>

      {loading && <Skeleton variant="card" height="240px" />}
      {!loading && list.length === 0 && <EmptyState icon={<Icon name="network" size={26} />} title="No members yet" />}
      {!loading && list.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Total prospects</th>
                <th>Joined</th>
                <th>Due today</th>
                <th>Overdue</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.uid}>
                  <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                  <td>{r.totalProspects}</td>
                  <td>{r.statusCounts?.joined ?? 0}</td>
                  <td>
                    {r.dueTodayFollowUps > 0 ? <span className="badge badge-warning">{r.dueTodayFollowUps}</span> : <span style={{ color: "var(--slate)" }}>—</span>}
                  </td>
                  <td>
                    {r.overdueFollowUps > 0 ? <span className="badge badge-danger">{r.overdueFollowUps}</span> : <span style={{ color: "var(--slate)" }}>—</span>}
                  </td>
                  <td>{r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
