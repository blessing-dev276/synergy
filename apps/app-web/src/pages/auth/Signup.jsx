import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import logoWordmark from "../../assets/images/logo-wordmark.png";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
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

    // The handle_new_user trigger creates the profiles row synchronously
    // (same transaction as the auth.users insert), so there's no
    // token-refresh race here — but if the project requires email
    // confirmation, `data.session` is null until the user clicks the link.
    if (data.session) {
      navigate("/onboarding", { replace: true });
    } else {
      setNeedsConfirmation(true);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand">
            <img src={logoWordmark} alt="Synergy" />
          </div>
          <h1>Check your email</h1>
          <p className="sub">
            We sent a confirmation link to {email}. Click it, then come back and log in.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ width: "100%", display: "block", textAlign: "center" }}>
            Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <img src={logoWordmark} alt="Synergy" />
        </div>
        <h1>Join Synergy</h1>
        <p className="sub">Create your account to start learning.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
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
          <div className="field">
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
          {error && <div className="field-error" style={{ marginBottom: "14px" }}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
