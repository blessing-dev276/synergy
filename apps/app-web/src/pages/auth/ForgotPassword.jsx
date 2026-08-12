import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import AuthLayout from "../../components/AuthLayout.jsx";

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
    <AuthLayout>
      <h1>Reset your password</h1>
      <p className="sub">We'll email you a link to set a new one.</p>

      {sent ? (
        <div className="badge badge-success" style={{ display: "block", padding: "16px", fontSize: "13.5px" }}>
          If an account exists for {email}, a reset link is on its way.
        </div>
      ) : (
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
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <div className="auth-switch">
        <Link to="/login">Back to log in</Link>
      </div>
    </AuthLayout>
  );
}
