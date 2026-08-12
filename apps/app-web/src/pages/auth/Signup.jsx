import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import logoWordmark from "../../assets/images/logo-wordmark.png";

const ERROR_MESSAGES = {
  "auth/email-already-in-use": "That email already has an account, try logging in instead.",
  "auth/weak-password": "Please use at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
};

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refreshRole } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      // The onCreate Cloud Function assigns the "member" role + creates the
      // users/{uid} profile doc asynchronously — force a token refresh so
      // this session picks up the claim as soon as it lands, rather than
      // racing it. A short retry loop covers the trigger's cold-start delay.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const role = await refreshRole();
        if (role) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? "Couldn't create your account, please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
