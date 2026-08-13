import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import AuthLayout from "../../components/AuthLayout.jsx";
import SponsorPicker from "../../components/SponsorPicker.jsx";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sponsor, setSponsor] = useState({ selected: null, claimedName: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const navigate = useNavigate();

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
          <label htmlFor="sponsor">Who invited/sponsored you?</label>
          <SponsorPicker value={sponsor} onChange={setSponsor} placeholder="Search by name…" />
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
