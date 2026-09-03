import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// "What I did" -- the counterpart to /tasks ("what I need to do"). Reads
// the member's own daily_reports history (0094); creating a new one stays
// on the Tasks page itself (TaskList.jsx's DailyReportCard), since a
// report is naturally tied to that day's real task/activity counts, not
// a standalone form.
const STATUS_BADGE = {
  submitted: "badge-info",
  reviewed: "badge-success",
  needs_attention: "badge-danger",
};
const STATUS_LABEL = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  needs_attention: "Needs Attention",
};

export default function MyReports() {
  const { user } = useAuth();

  const { loading, error, data: reports } = useSupabaseQuery(
    () => user && supabase.from("daily_reports").select("*").eq("uid", user.id).order("report_date", { ascending: false }),
    [user?.id],
  );

  return (
    <div>
      <h1>Reports</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        A record of the daily reports you've submitted, and their review status.
      </p>

      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load your reports." />}
      {!loading && !error && (!reports || reports.length === 0) && (
        <EmptyState
          icon={<Icon name="clipboard" size={26} />}
          title="No reports yet"
          description="Once you submit a daily report from the Tasks page, it'll show up here."
        />
      )}

      {reports && reports.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tasks</th>
                <th>Activities</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{new Date(r.report_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                    {r.summary && <div style={{ fontSize: "13px", color: "var(--slate)", maxWidth: "360px" }}>{r.summary}</div>}
                    {r.status === "needs_attention" && r.review_note && (
                      <div style={{ fontSize: "12.5px", color: "var(--danger)", marginTop: "4px" }}>{r.review_note}</div>
                    )}
                  </td>
                  <td>
                    {r.tasks_completed} / {r.tasks_total}
                  </td>
                  <td>
                    {r.activities_completed} / {r.activities_total}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status] ?? "badge-neutral"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
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
