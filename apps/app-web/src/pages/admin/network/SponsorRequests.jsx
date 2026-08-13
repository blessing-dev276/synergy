import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { resolveSponsorRequest, rejectSponsorRequest } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import SponsorPicker from "../../../components/SponsorPicker.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// New members whose typed sponsor name didn't match an existing account
// land here (see handle_new_user in
// supabase/migrations/0019_sponsor_functions.sql) — the name they typed is
// never lost, shown verbatim below, and resolution is always an explicit
// admin action, never an automatic name match (two different people can
// share a display name).
function RequestRow({ request, onResolved }) {
  const toast = useToast();
  const [picked, setPicked] = useState({ selected: null, claimedName: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    if (!picked.selected) return;
    setBusy(true);
    try {
      await resolveSponsorRequest(request.id, picked.selected.id, note.trim());
      toast.success("Sponsor request resolved.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't resolve that request.");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!window.confirm(`Reject the sponsor claim "${request.claimed_sponsor_name}" for ${request.member?.display_name ?? "this member"}?`)) return;
    setBusy(true);
    try {
      await rejectSponsorRequest(request.id, note.trim());
      toast.success("Sponsor request rejected.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't reject that request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{request.member?.display_name || request.member?.email || "Unknown member"}</div>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{request.member?.email}</div>
        </div>
        <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{new Date(request.created_at).toLocaleString()}</div>
      </div>

      <p style={{ fontSize: "13.5px", marginBottom: "12px" }}>
        Claimed sponsor: <strong>"{request.claimed_sponsor_name}"</strong>
      </p>

      <div className="field" style={{ marginBottom: "10px" }}>
        <label>Find the real account</label>
        <SponsorPicker
          value={picked}
          onChange={(v) => setPicked({ selected: v.selected, claimedName: "" })}
          initialQuery={request.claimed_sponsor_name}
        />
      </div>

      <div className="field" style={{ marginBottom: "10px" }}>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution notes for the audit trail" />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="btn btn-primary" onClick={resolve} disabled={busy || !picked.selected}>
          Link to selected account
        </button>
        <button type="button" className="btn btn-danger" onClick={reject} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default function SponsorRequests() {
  const { loading, data: requests, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("sponsor_requests")
        .select("*, member:profiles!sponsor_requests_member_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    [],
  );

  return (
    <div>
      <h1>Sponsor Requests</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        New members whose claimed sponsor wasn't found among existing accounts. Find the real account and link it,
        or reject the claim — nothing here is auto-matched.
      </p>

      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && (requests ?? []).length === 0 && (
        <EmptyState icon={<Icon name="folder" size={26} />} title="No pending sponsor requests" />
      )}
      {(requests ?? []).map((r) => (
        <RequestRow key={r.id} request={r} onResolved={refetch} />
      ))}
    </div>
  );
}
