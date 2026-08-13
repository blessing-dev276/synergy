import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import logoIcon from "../../assets/images/logo-icon.png";

export default function PendingApproval() {
  const { user } = useAuth();

  const { loading, data: attempt } = useSupabaseQuery(
    () => supabase.from("orientation_attempts").select("*").eq("uid", user.id).maybeSingle(),
    [user.id],
  );

  return (
    <div className="onboarding-shell">
      <div className="onboarding-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="Synergy" style={{ height: "26px" }} />
        </div>
      </div>

      <div className="onboarding-main">
        <div className="onboarding-card" style={{ textAlign: "center" }}>
          <div
            className="qa-icon"
            style={{ width: "56px", height: "56px", margin: "0 auto 18px", background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            <Icon name="clock" size={24} />
          </div>
          <h1>You're all set — for now</h1>
          <p className="sub">
            Thanks for going through the orientation. Your application is waiting on an admin's review — you'll get access to
            the full program as soon as it's approved.
          </p>

          {loading && <Skeleton variant="card" height="60px" />}
          {!loading && attempt && (
            <div
              className="card-elevated"
              style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}
            >
              <span className="qa-icon" style={{ width: "40px", height: "40px" }}>
                <Icon name="award" size={18} />
              </span>
              <div>
                <div style={{ fontSize: "12px", color: "var(--slate)" }}>Your orientation score</div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>
                  {attempt.score}% <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--slate)" }}>({attempt.total} questions)</span>
                </div>
              </div>
            </div>
          )}

          <button type="button" className="btn btn-secondary" style={{ marginTop: "24px" }} onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
