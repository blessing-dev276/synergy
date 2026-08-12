import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";

// /refer is deliberately not gated by Netlify Identity, that login also
// opens /gallery-admin and /stories-admin, and referral members shouldn't
// get content-editing access just to grab a link. Instead it's a single
// shared passcode (checked server-side in refer-auth.js, see README) plus a
// typed name, remembered on this device so members don't re-enter it every
// visit.
const NAME_KEY = "refer_name";

function referralLink(name) {
  return `${window.location.origin}/join?ref=${encodeURIComponent(name)}`;
}

export default function Refer() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");

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
          {name ? (
            <ReferPanel
              name={name}
              onForget={() => {
                localStorage.removeItem(NAME_KEY);
                setName("");
              }}
            />
          ) : (
            <PasscodeGate onUnlock={setName} />
          )}
        </div>
      </section>
    </>
  );
}

function PasscodeGate({ onUnlock }) {
  const [nameInput, setNameInput] = useState("");
  const [passcode, setPasscode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setError("Enter your name, it's what shows up as the sponsor.");
      return;
    }
    if (!passcode.trim()) {
      setError("Enter the referral passcode, ask the site owner for it.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/.netlify/functions/refer-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wrong passcode");
      localStorage.setItem(NAME_KEY, nameInput.trim());
      onUnlock(nameInput.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form
      className="admin-gate"
      onSubmit={handleSubmit}
      style={{ maxWidth: 420, margin: "0 auto", textAlign: "left", alignItems: "stretch" }}
    >
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="refer-name">Your name</label>
        <input
          id="refer-name"
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Exactly how you want it shown as sponsor"
          disabled={checking}
        />
      </div>
      <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
        <label htmlFor="refer-passcode">Referral passcode</label>
        <input
          id="refer-passcode"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          disabled={checking}
        />
      </div>
      {error && (
        <div className="field-error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      <button
        className="btn btn-primary"
        type="submit"
        disabled={checking}
        style={{ marginTop: 18 }}
      >
        {checking ? "Checking…" : "Unlock my referral link"}
      </button>
    </form>
  );
}

function ReferPanel({ name, onForget }) {
  const [copied, setCopied] = useState(false);
  const link = referralLink(name);
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
        <span>Sponsor name: {name}</span>
        <button className="admin-logout" onClick={onForget}>
          Not you? Reset
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
        Your name is typed in, not tied to an account, double check it's
        spelled exactly how you want it shown before sharing your link.
      </p>
    </div>
  );
}
