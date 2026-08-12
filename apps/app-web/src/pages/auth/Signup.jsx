import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import AuthLayout from "../../components/AuthLayout.jsx";

const ROLE_LABEL = { admin: "Admin", mentor: "Mentor", member: "Member" };

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitedByUid, setInvitedByUid] = useState("");
  const [inviterSearch, setInviterSearch] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const navigate = useNavigate();

  // Anon-callable on purpose (see supabase/migrations/0012) — the signup
  // form has no session yet.
  const { loading: loadingInviters, data: inviters } = useSupabaseQuery(() => supabase.rpc("list_inviters"), []);

  const filteredInviters = useMemo(() => {
    const list = inviters ?? [];
    const q = inviterSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => i.display_name.toLowerCase().includes(q));
  }, [inviters, inviterSearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!invitedByUid) {
      setError("Please select who invited you.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim(), invited_by_uid: invitedByUid } },
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
          <label htmlFor="invitedBy">Who invited you?</label>
          {loadingInviters && <div style={{ fontSize: "13px", color: "var(--slate)" }}>Loading…</div>}
          {!loadingInviters && (inviters ?? []).length === 0 && (
            <div className="field-error">
              We couldn't find anyone to select yet — ask whoever invited you to make sure their account is
              active, then refresh this page.
            </div>
          )}
          {!loadingInviters && (inviters ?? []).length > 0 && (
            <>
              <input
                type="text"
                placeholder="Search by name…"
                value={inviterSearch}
                onChange={(e) => setInviterSearch(e.target.value)}
                style={{ marginBottom: "8px" }}
              />
              <select
                id="invitedBy"
                required
                value={invitedByUid}
                onChange={(e) => setInvitedByUid(e.target.value)}
              >
                <option value="" disabled>
                  Select the person who invited you
                </option>
                {filteredInviters.map((inviter) => (
                  <option key={inviter.id} value={inviter.id}>
                    {inviter.display_name}
                    {inviter.role !== "member" ? ` — ${ROLE_LABEL[inviter.role] ?? inviter.role}` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {error && <div className="field-error" style={{ marginBottom: "16px" }}>{error}</div>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || loadingInviters}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  );
}
