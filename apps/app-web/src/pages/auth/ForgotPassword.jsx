import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import logoWordmark from "../../assets/images/logo-wordmark.png";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email.trim());
    // Show the same confirmation regardless of outcome — standard practice
    // to avoid account enumeration via this form.
    setSubmitting(false);
    setSent(true);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <img src={logoWordmark} alt="Synergy" />
        </div>
        <h1>Reset your password</h1>
        <p className="sub">We'll email you a link to set a new one.</p>

        {sent ? (
          <div className="badge badge-success" style={{ display: "block", padding: "14px" }}>
            If an account exists for {email}, a reset link is on its way.
          </div>
        ) : (
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
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
