import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import NetworkTree from "../../../../components/NetworkTree.jsx";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

function StatTile({ label, value, icon, tone, loading, to }) {
  const inner = (
    <div className="stat-tile">
      <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="stat-tile-label">{label}</div>
        {loading ? <Skeleton variant="text" width="46px" height="26px" /> : <div className="stat-tile-value">{value}</div>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="card-elevated">
      {inner}
    </Link>
  ) : (
    <div className="card-elevated">{inner}</div>
  );
}

function AttentionRow({ icon, count, label, to }) {
  return (
    <Link to={to} className="attention-row">
      <span className="icon-badge tone-danger">
        <Icon name={icon} size={17} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "14px" }}>{label}</div>
      </div>
      <span className="attention-count" style={{ color: "var(--danger)" }}>
        {count}
      </span>
      <Icon name="chevron-right" size={16} style={{ color: "var(--slate)" }} />
    </Link>
  );
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function OverviewSection() {
  const [picked, setPicked] = useState({ selected: null, claimedName: "" });
  const period = currentPeriod();

  const { data: members } = useSupabaseQuery(
    () => supabase.from("profiles").select("id, display_name").eq("status", "active").order("display_name"),
    [],
  );

  // Every "needs a human to look at this" queue across the network area,
  // rolled up in one place — course + activity-evidence + rank-task
  // submissions (the full breakdown lives at /admin/submissions; this is
  // just the count), monthly goal reviews, and overdue prospecting
  // follow-ups. (Sponsor
  // Requests and Legacy Mentors were removed from this page on request —
  // no counts for either are fetched anymore.)
  //
  // Each call is caught individually (not a single Promise.all) so one
  // broken/undeployed piece (e.g. an RPC whose migration hasn't shipped yet)
  // degrades that one number to 0 instead of blanking the whole dashboard —
  // a widget failing silently-to-zero is far better than the page going dark.
  const safeCount = (query) => query.then((r) => r.count ?? 0).catch(() => 0);
  const safeRows = (query) => query.then((r) => r.data ?? []).catch(() => []);

  const { loading: loadingCounts, data: counts } = useSupabaseQuery(
    () =>
      Promise.all([
        safeCount(supabase.from("sponsor_relationships").select("*", { count: "exact", head: true }).eq("active", true)),
        safeCount(supabase.from("profiles").select("*", { count: "exact", head: true }).is("sponsor_uid", null).eq("role", "member")),
        safeCount(supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted")),
        safeCount(supabase.from("content_evidence_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted")),
        safeCount(supabase.from("rank_task_submissions").select("*", { count: "exact", head: true }).eq("status", "pending")),
        safeRows(supabase.rpc("get_admin_goal_overview", { p_period: period })),
        safeRows(supabase.rpc("get_admin_prospecting_overview", {})),
      ]).then(([sponsoredCount, unsponsoredCount, submittedAssignments, submittedEvidence, pendingRankTasks, goalRows, prospectingRows]) => ({
        data: {
          sponsoredCount,
          unsponsoredCount,
          pendingReviewCount: submittedAssignments + submittedEvidence + pendingRankTasks,
          pendingGoalReviewCount: goalRows.filter((r) => r.status === "submitted").length,
          dueTodayFollowUps: prospectingRows.reduce((sum, r) => sum + (r.dueTodayFollowUps ?? 0), 0),
          overdueFollowUps: prospectingRows.reduce((sum, r) => sum + (r.overdueFollowUps ?? 0), 0),
        },
        error: null,
      })),
    [period],
  );

  const { loading: loadingTree, data: tree } = useSupabaseQuery(
    () => picked.selected && supabase.rpc("get_network", { p_uid: picked.selected.id }),
    [picked.selected?.id],
  );
  const { data: pickedOverview } = useSupabaseQuery(
    () => picked.selected && supabase.rpc("get_network_overview", { p_uid: picked.selected.id }),
    [picked.selected?.id],
  );

  const totalAttention = (counts?.pendingReviewCount ?? 0) + (counts?.pendingGoalReviewCount ?? 0) + (counts?.overdueFollowUps ?? 0);

  return (
    <div>
      {counts && (
        <div className={`attention-card ${totalAttention === 0 ? "all-clear" : ""}`} style={{ marginBottom: "20px" }}>
          {totalAttention === 0 ? (
            <div className="attention-row">
              <span className="icon-badge tone-success">
                <Icon name="check" size={17} />
              </span>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>Network's all caught up — nothing needs review right now.</div>
            </div>
          ) : (
            <>
              {counts.pendingReviewCount > 0 && (
                <AttentionRow icon="folder" count={counts.pendingReviewCount} label="Reports awaiting review" to="/admin/submissions" />
              )}
              {counts.pendingGoalReviewCount > 0 && (
                <AttentionRow icon="target" count={counts.pendingGoalReviewCount} label="Monthly goals awaiting review" to="/admin/network?section=goals" />
              )}
              {counts.overdueFollowUps > 0 && (
                <AttentionRow icon="clock" count={counts.overdueFollowUps} label="Overdue prospecting follow-ups across the team" to="/admin/network?section=prospecting" />
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatTile label="Active sponsor links" value={counts?.sponsoredCount} icon="network" loading={loadingCounts} />
        <StatTile label="Members with no sponsor" value={counts?.unsponsoredCount} icon="user-x" tone="warning" loading={loadingCounts} to="/admin/settings/team?sponsor=none" />
        <StatTile label="Follow-ups due today" value={counts?.dueTodayFollowUps} icon="clock" loading={loadingCounts} to="/admin/network?section=prospecting" />
      </div>

      <div className="card-elevated">
        <div className="card-title">Explore a member's network</div>
        <select
          value={picked.selected?.id ?? ""}
          onChange={(e) => {
            const member = (members ?? []).find((m) => m.id === e.target.value) ?? null;
            setPicked({ selected: member, claimedName: "" });
          }}
          style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px", minWidth: "260px" }}
        >
          <option value="">Select a member…</option>
          {(members ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>

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
                <StatTile label="Personally sponsored" value={pickedOverview.personallySponsoredCount} icon="users" />
                <StatTile label="Total network" value={pickedOverview.networkSize} icon="network" />
                <StatTile label="Overdue training" value={pickedOverview.membersWithOverdueTasks} icon="clock" tone="warning" />
              </div>
            )}
            {loadingTree && <Skeleton variant="card" height="160px" />}
            {!loadingTree && <NetworkTree nodes={tree ?? []} rootLabel={picked.selected.display_name} />}
          </div>
        )}

        {!picked.selected && (
          <div style={{ marginTop: "12px" }}>
            <EmptyState icon={<Icon name="network" size={26} />} title="Select a member to view their network" />
          </div>
        )}
      </div>
    </div>
  );
}
