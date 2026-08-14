import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { reviewMemberGoals } from "../../../lib/rpc.js";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";

const CATEGORIES = [
  { key: "skill", label: "Skill" },
  { key: "freelancing", label: "Freelancing" },
  { key: "network_marketing", label: "Network Marketing" },
  { key: "personal", label: "Personal" },
];

const STATUS_BADGE = {
  not_started: "badge-neutral",
  draft: "badge-neutral",
  submitted: "badge-info",
  approved: "badge-success",
  needs_revision: "badge-warning",
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// Full itemized view + approve/request-revision, opened from a row's
// "Review" button. Fetched fresh on open (admin RLS on monthly_goals allows
// reading any member's row, see supabase/migrations/0045_monthly_goals.sql).
function ReviewModal({ uid, period, onClose, onResolved }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const { loading, data: row } = useSupabaseQuery(
    () => uid && supabase.from("monthly_goals").select("*").eq("uid", uid).eq("period", period).maybeSingle(),
    [uid, period],
  );

  const decide = async (decision) => {
    setSaving(true);
    try {
      await reviewMemberGoals(uid, period, decision, comment.trim());
      toast.success(decision === "approved" ? "Goals approved." : "Sent back for revision.");
      onResolved();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review these goals.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Review monthly goals">
      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && row && (
        <div>
          {CATEGORIES.map((c) => {
            const items = row.goals?.[c.key] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={c.key} style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--slate)", marginBottom: "6px" }}>{c.label}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
                  {items.map((item, i) => (
                    <li key={i} style={{ fontSize: "13.5px" }}>
                      {item.text}
                      {item.target != null && (
                        <span style={{ color: "var(--slate)" }}>
                          {" "}
                          ({item.progress ?? 0} / {item.target})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="field" style={{ marginTop: "14px" }}>
            <label>Comment (shown to the member)</label>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional feedback" />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" onClick={() => decide("approved")} disabled={saving}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" onClick={() => decide("needs_revision")} disabled={saving}>
              Request revision
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function GoalReview() {
  const period = currentPeriod();
  const [reviewingUid, setReviewingUid] = useState(null);

  // get_admin_goal_overview: one row per active member with status ('not_started'
  // if they haven't touched this period yet), item count, submitted date --
  // answers "who hasn't set monthly goals" directly (see
  // supabase/migrations/0045_monthly_goals.sql).
  const { loading, data: rows, refetch } = useSupabaseQuery(
    () => supabase.rpc("get_admin_goal_overview", { p_period: period }),
    [period],
  );

  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const list = rows ?? [];
  const needsReview = list.filter((r) => r.status === "submitted").length;
  const notStarted = list.filter((r) => r.status === "not_started").length;

  return (
    <div>
      <h1>Monthly Goals — {monthLabel}</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
        {needsReview} awaiting review · {notStarted} haven't set goals yet
      </p>

      {loading && <Skeleton variant="card" height="240px" />}
      {!loading && list.length === 0 && <EmptyState icon={<Icon name="target" size={26} />} title="No members yet" />}
      {!loading && list.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Items</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.uid}>
                  <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status] ?? "badge-neutral"}`}>{r.status.replace("_", " ")}</span>
                  </td>
                  <td>{r.itemCount}</td>
                  <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    {r.status !== "not_started" && (
                      <button type="button" className="btn btn-secondary" onClick={() => setReviewingUid(r.uid)}>
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewingUid && (
        <ReviewModal uid={reviewingUid} period={period} onClose={() => setReviewingUid(null)} onResolved={refetch} />
      )}
    </div>
  );
}
