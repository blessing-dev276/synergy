import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import SponsorPicker from "../../../components/SponsorPicker.jsx";
import NetworkTree from "../../../components/NetworkTree.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

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

export default function NetworkOverview() {
  const [picked, setPicked] = useState({ selected: null, claimedName: "" });

  const { loading: loadingCounts, data: counts } = useSupabaseQuery(
    () =>
      Promise.all([
        supabase.from("sponsor_relationships").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("sponsor_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).is("sponsor_uid", null).eq("role", "member"),
      ]).then(([sponsored, pending, unsponsored]) => ({
        data: {
          sponsoredCount: sponsored.count ?? 0,
          pendingRequestCount: pending.count ?? 0,
          unsponsoredCount: unsponsored.count ?? 0,
        },
        error: sponsored.error ?? pending.error ?? unsponsored.error,
      })),
    [],
  );

  const { loading: loadingTree, data: tree } = useSupabaseQuery(
    () => picked.selected && supabase.rpc("get_network", { p_uid: picked.selected.id }),
    [picked.selected?.id],
  );
  const { data: pickedOverview } = useSupabaseQuery(
    () => picked.selected && supabase.rpc("get_network_overview", { p_uid: picked.selected.id }),
    [picked.selected?.id],
  );

  return (
    <div>
      <div className="section-heading">
        <h1>Network</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Sponsor relationships across Synergy. See <Link to="/admin/network/requests">Sponsor Requests</Link> for
        pending claims and <Link to="/admin/network/legacy-mentors">Legacy Mentors</Link> for pre-sponsor-model
        oversight assignments.
      </p>

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatCard label="Active sponsor links" value={counts?.sponsoredCount} icon="network" loading={loadingCounts} />
        <StatCard label="Pending sponsor requests" value={counts?.pendingRequestCount} icon="folder" loading={loadingCounts} />
        <StatCard label="Members with no sponsor" value={counts?.unsponsoredCount} icon="user-x" loading={loadingCounts} />
      </div>

      <div className="card-elevated">
        <div className="card-title">Explore a member's network</div>
        <SponsorPicker value={picked} onChange={(v) => setPicked({ selected: v.selected, claimedName: "" })} placeholder="Search for a member…" />

        {picked.selected && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <strong>{picked.selected.display_name}</strong>
              <Link to={`/admin/members/${picked.selected.id}`} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "12.5px" }}>
                Manage member
              </Link>
            </div>
            {pickedOverview && (
              <div className="grid grid-3" style={{ marginBottom: "16px" }}>
                <StatCard label="Personally sponsored" value={pickedOverview.personallySponsoredCount} icon="users" />
                <StatCard label="Total network" value={pickedOverview.networkSize} icon="network" />
                <StatCard label="Overdue training" value={pickedOverview.membersWithOverdueTasks} icon="clock" />
              </div>
            )}
            {loadingTree && <Skeleton variant="card" height="160px" />}
            {!loadingTree && <NetworkTree nodes={tree ?? []} rootLabel={picked.selected.display_name} />}
          </div>
        )}

        {!picked.selected && (
          <div style={{ marginTop: "12px" }}>
            <EmptyState icon={<Icon name="network" size={26} />} title="Search for a member to view their network" />
          </div>
        )}
      </div>
    </div>
  );
}
