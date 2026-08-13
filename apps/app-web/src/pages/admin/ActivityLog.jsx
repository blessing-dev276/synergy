import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

const PAGE_SIZE = 50;

function formatAction(action) {
  return (action ?? "").replace(/_/g, " ");
}

export default function ActivityLog() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [actionFilter, setActionFilter] = useState("all");

  const { loading, data: rows } = useSupabaseQuery(
    () =>
      supabase
        .from("activity_log")
        .select("*, actor:profiles!activity_log_actor_uid_fkey(display_name, email)")
        .order("created_at", { ascending: false })
        .limit(limit),
    [limit],
  );

  const actions = [...new Set((rows ?? []).map((r) => r.action))].sort();
  const visibleRows = (rows ?? []).filter((r) => actionFilter === "all" || r.action === actionFilter);

  return (
    <div>
      <div className="section-heading">
        <h1>Activity Log</h1>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px" }}
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {formatAction(a)}
            </option>
          ))}
        </select>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Every admin action — role changes, sponsor assignments, stage moves, status changes, task completions — in one place.
      </p>

      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && visibleRows.length === 0 && <EmptyState icon={<Icon name="activity" size={26} />} title="No activity yet" />}
      {visibleRows.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "13px", color: "var(--slate)" }}>
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td>{r.actor?.display_name || r.actor?.email || "System"}</td>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{formatAction(r.action)}</td>
                  <td style={{ fontSize: "13px", color: "var(--slate)" }}>
                    {r.target_type ? `${r.target_type} · ${r.target_id}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length >= limit && (
        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
