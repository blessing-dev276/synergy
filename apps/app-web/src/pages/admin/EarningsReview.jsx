import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { reviewEarning } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

// Verification matters here: a real weekly incentive (see Leaderboard.jsx)
// is riding on this number, and there's no payments system behind it to
// cross-check against — see supabase/migrations/0026_weekly_leaderboard.sql
// for why this can't just be trusted on submission.
function EarningRow({ entry, onResolved }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    if (decision === "rejected" && !window.confirm(`Reject this $${entry.amount} earning submission?`)) return;
    setBusy(true);
    try {
      await reviewEarning(entry.id, decision, note.trim());
      toast.success(decision === "verified" ? "Earning verified." : "Earning rejected.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that submission.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <Link to={`/admin/members/${entry.uid}`} style={{ fontWeight: 600 }}>
            {entry.member?.display_name || entry.member?.email || "Unknown member"}
          </Link>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{new Date(entry.earned_at).toLocaleString()}</div>
        </div>
        <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>${entry.amount}</div>
      </div>

      {entry.note && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "12px" }}>"{entry.note}"</p>}

      <div className="field" style={{ marginBottom: "10px" }}>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, if rejecting" />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="btn btn-primary" onClick={() => decide("verified")} disabled={busy}>
          Verify
        </button>
        <button type="button" className="btn btn-danger" onClick={() => decide("rejected")} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default function EarningsReview() {
  const { loading, data: entries, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("earnings_logs")
        .select("*, member:profiles!earnings_logs_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("earned_at", { ascending: true }),
    [],
  );

  return (
    <div>
      <h1>Earnings Review</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Members self-report earnings for the weekly leaderboard. Only verified amounts count toward Top Earner —
        review each submission before it's counted.
      </p>

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (entries ?? []).length === 0 && (
        <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="No earnings waiting for review" />
      )}
      {(entries ?? []).map((e) => (
        <EarningRow key={e.id} entry={e} onResolved={refetch} />
      ))}
    </div>
  );
}
