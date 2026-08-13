import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { reviewStagePromotion } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// A request only lands here once request_stage_promotion (0025) has already
// re-verified server-side that every track in the member's current stage is
// at 100% — the button labels below reflect that ("Approve" moves them,
// nothing here re-checks progress).
function RequestRow({ request, onResolved }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    if (decision === "rejected" && !window.confirm(`Decline ${request.member?.display_name ?? "this member"}'s promotion request?`)) return;
    setBusy(true);
    try {
      await reviewStagePromotion(request.id, decision, note.trim());
      toast.success(decision === "approved" ? "Promotion approved." : "Promotion declined.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <Link to={`/admin/members/${request.uid}`} style={{ fontWeight: 600 }}>
            {request.member?.display_name || request.member?.email || "Unknown member"}
          </Link>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{request.member?.email}</div>
        </div>
        <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{new Date(request.requested_at).toLocaleString()}</div>
      </div>

      <p style={{ fontSize: "13.5px", marginBottom: "12px" }}>
        {request.from_stage?.title ?? "No stage"} → <strong>{request.to_stage?.title}</strong>
      </p>

      <div className="field" style={{ marginBottom: "10px" }}>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Feedback for the member" />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="btn btn-primary" onClick={() => decide("approved")} disabled={busy}>
          Approve
        </button>
        <button type="button" className="btn btn-danger" onClick={() => decide("rejected")} disabled={busy}>
          Decline
        </button>
      </div>
    </div>
  );
}

export default function PromotionRequests() {
  const { loading, data: requests, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("stage_promotion_requests")
        .select(
          "*, member:profiles!stage_promotion_requests_uid_fkey(display_name, email), from_stage:stages!stage_promotion_requests_from_stage_id_fkey(title), to_stage:stages!stage_promotion_requests_to_stage_id_fkey(title)",
        )
        .eq("status", "pending")
        .order("requested_at", { ascending: true }),
    [],
  );

  return (
    <div>
      <h1>Stage Promotions</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Members who've finished every track in their current stage and are asking to move forward. Nothing advances
        automatically — review and approve, or decline with a note.
      </p>

      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && (requests ?? []).length === 0 && (
        <EmptyState icon={<Icon name="trophy" size={26} />} title="No pending promotion requests" />
      )}
      {(requests ?? []).map((r) => (
        <RequestRow key={r.id} request={r} onResolved={refetch} />
      ))}
    </div>
  );
}
