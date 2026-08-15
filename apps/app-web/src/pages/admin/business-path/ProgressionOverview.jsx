import { useState } from "react";
import { Link } from "react-router-dom";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { getAdminBusinessPathOverview } from "../../../lib/rpc.js";
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
// get_admin_business_path_overview, supabase/migrations/0051_business_path_
// functions.sql) rather than looping get_business_path_overview per member —
// this page exists specifically so admins can spot who needs support without
// opening every profile. Milestones/promotions are gone, so this no longer
// carries any milestone- or promotion-derived columns — just progress,
// overdue tasks, and pending evidence review.
export default function ProgressionOverview() {
  const [sort, setSort] = useState("overdue");
  const { loading, data: rows } = useSupabaseQuery(() => getAdminBusinessPathOverview(), []);

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
        Every active member's progress in one place — Path Level categorizes members and determines which training they get.
      </p>

      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && sorted.length === 0 && <EmptyState icon={<Icon name="compass" size={26} />} title="No active members yet" />}

      {sorted.length > 0 && (
        <div className="card-elevated" style={{ padding: 0, overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Path Level</th>
                <th>Tracks (Skill / Business / Freelancing)</th>
                <th>Stage</th>
                <th>Overdue</th>
                <th>Pending review</th>
                <th>Sponsored</th>
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
                  {/* get_admin_business_path_overview returns `level`/`levelProgressPercent`
                      (not `rank`) to match business_path_levels and the "Path Level" branding
                      this ladder now carries (see 0051). */}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
