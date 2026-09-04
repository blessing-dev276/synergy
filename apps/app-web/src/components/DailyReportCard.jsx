import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import { todayISO } from "../lib/useTodayTasks.js";
import { submitDailyReport } from "../lib/rpc.js";
import { useToast } from "./state/Toast.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

// Shared by TaskList.jsx (the full workday desk) and Dashboard.jsx's compact
// "Today's Report" card -- one definition of "has today's report been filed
// yet", not a second copy drifting out of sync with submit_daily_report's
// real shape (0094). `today` is the same useTodayTasks() result the caller
// already has, snapshotted into the report at submit time.
export default function DailyReportCard({ uid, today }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: report, loading, refetch } = useSupabaseQuery(
    () => uid && supabase.from("daily_reports").select("*").eq("uid", uid).eq("report_date", todayISO()).maybeSingle(),
    [uid],
  );

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitDailyReport(today.tasksDone, today.tasksTotal, today.activitiesDone, today.activitiesTotal, summary.trim());
      toast.success("Daily report submitted.");
      setOpen(false);
      setSummary("");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your report.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="card-elevated">
      {report ? (
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span className="icon-badge tone-success">
            <Icon name="check" size={18} />
          </span>
          <div>
            <div className="card-title" style={{ marginBottom: "2px" }}>
              Daily Report Submitted
            </div>
            <p className="card-subtitle" style={{ marginBottom: 0 }}>
              Submitted today at {new Date(report.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {report.status === "reviewed" && " · Reviewed by an admin"}
              {report.status === "needs_attention" && " · An admin flagged this — check your notifications"}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div className="card-title" style={{ marginBottom: "2px" }}>
              Ready to report your work?
            </div>
            <p className="card-subtitle" style={{ marginBottom: 0 }}>
              Record what you accomplished today and keep your progress on track.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            Create Daily Report
          </button>
        </div>
      )}

      {open && (
        <Modal open onClose={() => setOpen(false)} title="Create Daily Report">
          <form onSubmit={submit}>
            <div className="grid grid-2" style={{ marginBottom: "16px" }}>
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">
                    {today.tasksDone}/{today.tasksTotal}
                  </div>
                  <div className="stat-tile-label">Tasks completed</div>
                </div>
              </div>
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">
                    {today.activitiesDone}/{today.activitiesTotal}
                  </div>
                  <div className="stat-tile-label">Activities completed</div>
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="summary">What did you accomplish today? (optional)</label>
              <textarea
                id="summary"
                rows={4}
                placeholder="e.g. Finished Lesson 6, followed up with 3 prospects, sent 2 proposals…"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
