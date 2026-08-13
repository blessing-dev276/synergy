import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import AuthLayout from "../../components/AuthLayout.jsx";
import SponsorPicker from "../../components/SponsorPicker.jsx";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Signup() {
  const [searchParams] = useSearchParams();
  const refUid = searchParams.get("ref");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sponsor, setSponsor] = useState({ selected: null, claimedName: "" });
  const [showPicker, setShowPicker] = useState(!refUid);
  const [refStatus, setRefStatus] = useState(refUid ? "loading" : "none");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const navigate = useNavigate();

  // A referral link (see NetworkDashboard.jsx) is "/signup?ref=<sponsor's
  // uid>" — resolve it to a name up front so signup skips search_sponsors
  // entirely for the common case (typing a name to find the right match was
  // reported as stressful). Falls back to the normal picker if the link is
  // malformed or the account isn't found/active.
  useEffect(() => {
    if (!refUid) return;
    if (!UUID_RE.test(refUid)) {
      setRefStatus("invalid");
      setShowPicker(true);
      return;
    }
    let cancelled = false;
    supabase
      .rpc("get_sponsor_by_id", { p_id: refUid })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        const match = data?.[0];
        if (rpcError || !match) {
          setRefStatus("invalid");
          setShowPicker(true);
          return;
        }
        setSponsor({ selected: match, claimedName: "" });
        setRefStatus("resolved");
      });
    return () => {
      cancelled = true;
    };
  }, [refUid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!sponsor.selected && !sponsor.claimedName) {
      setError("Please tell us who invited/sponsored you.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: name.trim(),
          whatsapp_number: whatsapp.trim(),
          sponsor_uid: sponsor.selected?.id ?? null,
          claimed_sponsor_name: sponsor.selected ? null : sponsor.claimedName,
        },
      },
    });

    setSubmitting(false);
    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "That email already has an account, try logging in instead."
          : signUpError.message.includes("Password")
            ? "Please use at least 6 characters."
            : "Couldn't create your account, please try again.",
      );
      return;
    }

    if (data.session) {
      navigate("/onboarding", { replace: true });
    } else {
      setNeedsConfirmation(true);
    }
  };

  if (needsConfirmation) {
    return (
      <AuthLayout>
        <h1>Check your email</h1>
        <p className="sub">We sent a confirmation link to {email}. Click it, then come back and log in.</p>
        <Link to="/login" className="btn btn-primary btn-lg" style={{ display: "block", textAlign: "center" }}>
          Back to log in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>Join Synergy</h1>
      <p className="sub">Create your account to start learning.</p>

      <form onSubmit={handleSubmit}>
        <div className="field field-lg">
          <label htmlFor="name">Full name</label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field field-lg">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field field-lg">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field field-lg">
          <label htmlFor="whatsapp">WhatsApp number</label>
          <input
            id="whatsapp"
            type="tel"
            autoComplete="tel"
            placeholder="e.g. +234 801 234 5678"
            required
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          <div style={{ fontSize: "12px", color: "var(--slate)", marginTop: "4px" }}>
            So we can add you to the office WhatsApp group.
          </div>
        </div>

        <div className="field field-lg">
          <label htmlFor="sponsor">Who invited/sponsored you?</label>

          {refStatus === "loading" && <div style={{ fontSize: "13px", color: "var(--slate)" }}>Checking your referral link…</div>}

          {refStatus === "invalid" && (
            <div className="field-error" style={{ marginBottom: "8px" }}>
              That referral link wasn't recognized — search for your sponsor below instead.
            </div>
          )}

          {refStatus === "resolved" && !showPicker && sponsor.selected && (
            <div className="sponsor-picker-selected" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="badge badge-success">Invited by {sponsor.selected.display_name}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSponsor({ selected: null, claimedName: "" });
                  setShowPicker(true);
                }}
              >
                Not you? Search instead
              </button>
            </div>
          )}

          {refStatus !== "loading" && showPicker && (
            <SponsorPicker value={sponsor} onChange={setSponsor} placeholder="Search or pick your sponsor…" />
          )}
        </div>

        {error && <div className="field-error" style={{ marginBottom: "16px" }}>{error}</div>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  );
}
