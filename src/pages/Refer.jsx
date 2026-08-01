import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { useNetlifyIdentity } from "../lib/useNetlifyIdentity.js";

function memberDisplayName(user) {
  return user.user_metadata?.full_name?.trim() || user.email;
}

function referralLink(user) {
  const name = memberDisplayName(user);
  return `${window.location.origin}/join?ref=${encodeURIComponent(name)}`;
}

export default function Refer() {
  const { user, ready } = useNetlifyIdentity();

  return (
    <>
      <PageMeta
        title="Refer & Earn"
        description="Generate your personal SynergyTeam referral link."
      />
      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Refer</span>
          </div>
          <div className="eyebrow">Members only</div>
          <h1>Your referral link</h1>
          <p className="lede">
            Share your link, when someone joins SynergyTeam through it, your
            name goes straight to the team as their sponsor.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {!ready ? (
            <p className="mono">Loading…</p>
          ) : !user ? (
            <div className="admin-gate">
              <p>Log in with your member account to get your referral link.</p>
              <button
                className="btn btn-primary"
                onClick={() => window.netlifyIdentity.open("login")}
              >
                Log in
              </button>
            </div>
          ) : (
            <ReferPanel user={user} />
          )}
        </div>
      </section>
    </>
  );
}

function ReferPanel({ user }) {
  const [copied, setCopied] = useState(false);
  const link = referralLink(user);
  const name = memberDisplayName(user);
  const shareText = `Join SynergyTeam with me, freelancing + network marketing training, apply here: ${link}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your referral link:", link);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <span>Logged in as {user.email}</span>
        <button
          className="admin-logout"
          onClick={() => window.netlifyIdentity.logout()}
        >
          Log out
        </button>
      </div>

      <div className="form-side-card whatsapp">
        <h4>Your link, sponsor name: {name}</h4>
        <p>
          Anyone who applies through this link has your name sent to the team
          as their sponsor, automatically.
        </p>
        <div className="field" style={{ marginTop: 14 }}>
          <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={copyLink}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            Share on WhatsApp
          </a>
        </div>
      </div>

      <p className="admin-note">
        Your name only appears exactly as set on your account (
        {user.user_metadata?.full_name
          ? "your full name"
          : "your account has no full name set, so your email is used instead"}
        ). To change it, ask the site owner to update your Netlify Identity
        profile.
      </p>
    </div>
  );
}
