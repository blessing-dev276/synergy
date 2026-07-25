import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { SITE } from "../data/site.js";

export default function Privacy() {
  return (
    <>
      <PageMeta
        title="Privacy"
        description="How SynergyTeam handles the information you share when you apply to join."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Privacy</span>
          </div>
          <div className="eyebrow">In plain language</div>
          <h1>Privacy</h1>
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="prose">
            <span className="updated">Last updated: 2026</span>

            <h2>What we collect</h2>
            <p>
              When you apply through the <Link to="/join">Join</Link> page, we
              collect the information you type in: your name, phone/WhatsApp
              number, email (if you provide one), which track you're interested
              in, and anything else you choose to share.
            </p>

            <h2>How it's used</h2>
            <p>
              Submitting the form opens a WhatsApp chat with your details, sent
              directly to the team — that's the only place your application goes
              by default. We use it solely to respond to your application and
              onboard you if you join. We do not sell, rent, or share your
              information with third parties for marketing purposes.
            </p>

            <h2>Cookies &amp; tracking</h2>
            <p>
              This site does not use tracking cookies or third-party analytics
              beyond what may be added later for basic, aggregate visit counts.
              It does not sell your data to advertisers.
            </p>

            <h2>Your choices</h2>
            <p>
              You can ask us to delete any information you've shared at any time
              — just message us on WhatsApp or email{" "}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we'll action
              it.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
