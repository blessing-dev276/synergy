import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Icon from "../../components/Icon.jsx";
import NetworkTree from "../../components/NetworkTree.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function StatCard({ label, value, icon, loading }) {
  return (
    <div className="card-elevated" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <span className="qa-icon" style={{ width: "44px", height: "44px" }}>
        <Icon name={icon} size={19} />
      </span>
      <div>
        <div className="card-subtitle" style={{ marginBottom: "2px" }}>
          {label}
        </div>
        {loading ? <Skeleton variant="text" width="50px" height="24px" /> : <div style={{ fontSize: "24px", fontWeight: 700 }}>{value}</div>}
      </div>
    </div>
  );
}

export default function NetworkDashboard() {
  const { user } = useAuth();

  const { loading: loadingOverview, data: overview } = useSupabaseQuery(
    () => user && supabase.rpc("get_network_overview", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingSponsored, data: sponsored } = useSupabaseQuery(
    () => user && supabase.rpc("get_personally_sponsored", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingTree, data: tree } = useSupabaseQuery(
    () => user && supabase.rpc("get_network", { p_uid: user.id }),
    [user?.id],
  );

  return (
    <div>
      <div className="hero-banner">
        <h1>My Network</h1>
        <p>Sponsor is a relationship, not a rank — anyone you bring into Synergy becomes part of your network.</p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatCard label="Personally sponsored" value={overview?.personallySponsoredCount ?? 0} icon="users" loading={loadingOverview} />
        <StatCard label="Total network" value={overview?.networkSize ?? 0} icon="network" loading={loadingOverview} />
        <StatCard label="Active in network" value={overview?.activeCount ?? 0} icon="check-square" loading={loadingOverview} />
        <StatCard label="Inactive" value={overview?.inactiveCount ?? 0} icon="ban" loading={loadingOverview} />
        <StatCard label="Currently in training" value={overview?.inTrainingCount ?? 0} icon="compass" loading={loadingOverview} />
        <StatCard label="Completed training" value={overview?.completedTrainingCount ?? 0} icon="award" loading={loadingOverview} />
      </div>

      {!loadingOverview && (overview?.membersWithOverdueTasks ?? 0) > 0 && (
        <div className="card-elevated" style={{ marginBottom: "24px", borderLeft: "3px solid var(--warning, #d97706)" }}>
          <div className="card-title">Network Development</div>
          <p style={{ fontSize: "13.5px" }}>
            {overview.membersWithOverdueTasks} member{overview.membersWithOverdueTasks === 1 ? "" : "s"} in your network{" "}
            {overview.membersWithOverdueTasks === 1 ? "has" : "have"} overdue training tasks. Building your network isn't just
            about recruiting — check in and help them keep moving.
          </p>
        </div>
      )}

      <div className="card-elevated" style={{ marginBottom: "24px" }}>
        <div className="card-title">
          <Icon name="award" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
          Rank & milestones
        </div>
        <EmptyState
          icon={<Icon name="clock" size={26} />}
          title="Coming soon"
          description="Rank progress and milestones will appear here once your compensation plan is configured — we won't show earnings or rank claims before then."
        />
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Personally sponsored
      </div>
      {loadingSponsored && <Skeleton variant="card" height="140px" />}
      {!loadingSponsored && (sponsored ?? []).length === 0 && (
        <EmptyState icon={<Icon name="users" size={26} />} title="You haven't sponsored anyone yet" />
      )}
      {!loadingSponsored && (sponsored ?? []).length > 0 && (
        <div className="card-elevated" style={{ padding: 0, marginBottom: "24px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Joined</th>
                <th>Overdue tasks</th>
              </tr>
            </thead>
            <tbody>
              {sponsored.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.displayName}</td>
                  <td>
                    <span className={`badge ${m.status === "active" ? "badge-success" : "badge-neutral"}`}>{m.status}</span>
                  </td>
                  <td>{m.stageTitle ?? "Not started"}</td>
                  <td>{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    {m.overdueTaskCount > 0 ? (
                      <span className="badge badge-warning">{m.overdueTaskCount}</span>
                    ) : (
                      <span style={{ color: "var(--slate)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Network tree
      </div>
      {loadingTree && <Skeleton variant="card" height="200px" />}
      {!loadingTree && (
        <div className="card-elevated">
          <NetworkTree nodes={tree ?? []} />
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <Link to="/profile" className="btn btn-secondary">
          Back to profile
        </Link>
      </div>
    </div>
  );
}
