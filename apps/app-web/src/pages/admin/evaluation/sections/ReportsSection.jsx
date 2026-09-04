import { Link } from "react-router-dom";
import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

const STATUS_BADGE = { submitted: "badge-info", auto_generated: "badge-warning", reviewed: "badge-success", needs_attention: "badge-danger" };

// Read-only, same daily_reports rows Submissions.jsx's Daily Reports
// section reviews -- review/decision actions stay centralized there (same
// "read here, act over there" precedent WalletSummaryPanel in
// MemberDetail.jsx already uses for withdrawal requests).
export default function ReportsSection({ member }) {
  const { loading, data: reports } = useSupabaseQuery(
    () => supabase.from("daily_reports").select("*").eq("uid", member.id).order("report_date", { ascending: false }).limit(7),
    [member.id],
  );

  if (loading) return <Skeleton variant="card" height="100px" />;

  const rows = reports ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={<Icon name="clipboard" size={24} />} title="No daily reports on record" />;
  }

  const pending = rows.filter((r) => r.status === "submitted" || r.status === "auto_generated").length;
  const flagged = rows.filter((r) => r.status === "needs_attention").length;

  return (
    <div>
      <p style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "10px" }}>
        Last {rows.length} days · {pending} awaiting review{flagged > 0 && ` · ${flagged} flagged`}
      </p>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {rows.map((r) => (
          <li key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span>
              {new Date(`${r.report_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              <span style={{ color: "var(--slate)" }}>
                {" "}
                — tasks {r.tasks_completed}/{r.tasks_total}
              </span>
            </span>
            <span className={`badge ${STATUS_BADGE[r.status] ?? "badge-neutral"}`}>{r.status.replace("_", " ")}</span>
          </li>
        ))}
      </ul>
      {pending > 0 || flagged > 0 ? (
        <Link to="/admin/evaluation/reports?section=daily-reports" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "12.5px" }}>
          Review in Reports
        </Link>
      ) : null}
    </div>
  );
}
