import { useState } from "react";
import { Link } from "react-router-dom";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { getAdminProgressionOverview } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const TRACK_ORDER = ["skill", "business", "freelancing"];
const TRACK_ICONS = { skill: "target", business: "briefcase", freelancing: "laptop" };

function MiniBar({ percent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "48px", height: "6px", borderRadius: "100px", background: "var(--line)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(percent ?? 0, 100)}%`, height: "100%", background: "var(--gold)", borderRadius: "100px" }} />
      </div>
      <span style={{ fontSize: "11.5px", color: "var(--slate)", width: "28px" }}>{percent ?? 0}%</span>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "overdue", label: "Overdue (most first)" },
  { value: "pending", label: "Pending review (most first)" },
];

// One row per active member, computed server-side in a single call (see
// get_admin_progression_overview, supabase/migrations/0034_admin_
// progression_overview.sql) rather than looping get_journey_overview per
// member — this page exists specifically so admins can spot who needs
// support without opening every profile.
export default function ProgressionOverview() {
  const [sort, setSort] = useState("overdue");
  const { loading, data: rows } = useSupabaseQuery(() => getAdminProgressionOverview(), []);

  const sorted = [...(rows ?? [])].sort((a, b) => {
    if (sort === "overdue") return (b.overdueCount ?? 0) - (a.overdueCount ?? 0);
    if (sort === "pending") return (b.pendingReviewCount ?? 0) - (a.pendingReviewCount ?? 0);
    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
  });

  return (
    <div>
      <div className="section-heading">
        <h1>Progression</h1>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px" }}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Every active member's development progress in one place. Official Rank is set by hand from each member's real
        NeoLife back office status — it's never computed or inferred from this data.
      </p>

      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && sorted.length === 0 && <EmptyState icon={<Icon name="compass" size={26} />} title="No active members yet" />}

      {sorted.length > 0 && (
        <div className="card-elevated" style={{ padding: 0, overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Level</th>
                <th>Tracks (Skill / Business / Freelancing)</th>
                <th>Stage</th>
                <th>Overdue</th>
                <th>Pending review</th>
                <th>Sponsored</th>
                <th>Official rank</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.uid}>
                  <td>
                    <Link to={`/admin/members/${row.uid}`} style={{ fontWeight: 600 }}>
                      {row.displayName || "—"}
                    </Link>
                  </td>
                  <td>
                    {row.level ? (
                      <>
                        {row.level.label}{" "}
                        <span style={{ fontSize: "12px", color: "var(--slate)" }}>{row.levelProgressPercent}%</span>
                      </>
                    ) : (
                      <span style={{ color: "var(--slate)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "12px" }}>
                      {TRACK_ORDER.map((key) => (
                        <span key={key} title={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Icon name={TRACK_ICONS[key]} size={12} />
                          <MiniBar percent={row.trackProgress?.[key]} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{row.stage?.title ?? <span style={{ color: "var(--slate)" }}>Not started</span>}</td>
                  <td>
                    {row.overdueCount > 0 ? (
                      <span className="badge badge-warning">{row.overdueCount}</span>
                    ) : (
                      <span className="badge badge-success">0</span>
                    )}
                  </td>
                  <td>
                    {row.pendingReviewCount > 0 ? (
                      <span className="badge badge-info">{row.pendingReviewCount}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td>{row.sponsoredCount}</td>
                  <td style={{ fontSize: "12.5px" }}>
                    {row.officialRank ?? <span style={{ color: "var(--slate)" }}>Not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
