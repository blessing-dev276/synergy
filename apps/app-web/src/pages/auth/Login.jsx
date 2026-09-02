import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import AuthLayout from "../../components/AuthLayout.jsx";
import Icon from "../../components/Icon.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthLayout>
      <h1>Welcome back</h1>
      <p className="sub">Log in to enter your Synergy Office.</p>

      <form onSubmit={handleSubmit}>
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
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? "Hide password" : "Show password"}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: "4px",
                display: "flex",
                color: "var(--slate)",
                cursor: "pointer",
              }}
            >
              <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
        </div>
        {error && <div className="field-error" style={{ marginBottom: "16px" }}>{error}</div>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="auth-switch">
        <Link to="/forgot-password">Forgot your password?</Link>
      </div>
      <div className="auth-switch">
        New to Synergy? <Link to="/signup">Create an account</Link>
      </div>
    </AuthLayout>
  );
}
