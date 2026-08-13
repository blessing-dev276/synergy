import { supabase } from "../../supabaseClient.js";
import Icon from "../../components/Icon.jsx";
import logoIcon from "../../assets/images/logo-icon.png";

export default function PendingApproval() {
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
            Thanks for signing up. Your application is waiting on an admin's review — you'll get access to
            the full program as soon as it's approved.
          </p>

          <button type="button" className="btn btn-secondary" style={{ marginTop: "24px" }} onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
