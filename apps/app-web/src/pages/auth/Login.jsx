import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import logoWordmark from "../../assets/images/logo-wordmark.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(
        signInError.message === "Email not confirmed"
          ? "Please confirm your email first — check your inbox for the link."
          : "That email or password isn't right.",
      );
      return;
    }
    navigate(location.state?.from?.pathname ?? "/dashboard", { replace: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <img src={logoWordmark} alt="Synergy" />
        </div>
        <h1>Welcome back</h1>
        <p className="sub">Log in to continue your learning journey.</p>

        <form onSubmit={handleSubmit}>
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="field-error" style={{ marginBottom: "14px" }}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div className="auth-switch">
          <Link to="/forgot-password">Forgot your password?</Link>
        </div>
        <div className="auth-switch">
          New to Synergy? <Link to="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
