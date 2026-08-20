import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminSetWalletReferenceRate } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Wallet's singleton settings row (0084) -- read directly via RLS (select
// is open to any authenticated user, same as progress_weights), written
// only through admin_set_wallet_reference_rate (0085) for an activity_log
// audit trail, since this number gates real money decisions: it's used to
// compare a withdrawal request against a rank's tier cap whenever the two
// are denominated in different currencies (Wallet.jsx / RankBuilder.jsx's
// withdrawal tiers panel). The ACTUAL payout conversion an admin records
// when marking a request paid (Submissions.jsx) always uses its own rate,
// entered fresh each time -- never this one.
function WalletReferenceRateCard() {
  const toast = useToast();
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  const { loading, data: settings, refetch } = useSupabaseQuery(
    () => supabase.from("wallet_settings").select("*").eq("id", true).single(),
    [],
  );

  useEffect(() => {
    setRate(settings?.usd_to_ngn_reference_rate ? String(settings.usd_to_ngn_reference_rate) : "");
  }, [settings]);

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(rate) > 0)) {
      toast.error("Enter a rate greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await adminSetWalletReferenceRate(Number(rate));
      toast.success("Reference rate updated.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that rate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: "480px", marginBottom: "24px" }}>
      <div className="card-title">Wallet — USD to NGN reference rate</div>
      <p className="card-subtitle">
        Used only to compare a member's withdrawal request against their rank's tiered limit when the two are in different currencies. The actual
        payout rate is entered separately, per request, when you mark it paid.
      </p>
      {loading ? (
        <Skeleton variant="text" width="140px" height="34px" />
      ) : (
        <form onSubmit={submit} style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>₦ per $1</label>
            <input type="number" min="0.01" step="0.01" placeholder="e.g. 1600" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save rate"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function SettingsGeneral() {
  return (
    <div>
      <div className="section-heading">
        <h1>General</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Organization-wide preferences — name, branding, and defaults — will live here.
      </p>

      <WalletReferenceRateCard />

      <EmptyState icon={<Icon name="briefcase" size={26} />} title="More settings coming soon" />
    </div>
  );
}
