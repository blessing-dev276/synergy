import { Link } from "react-router-dom";
import Icon from "../../components/Icon.jsx";
import logoIcon from "../../assets/images/logo-icon.png";
import "../../styles/landing.css";

// Placeholder Privacy Policy / Terms of Service pages -- exist purely so
// the footer's "Legal" links (LandingPage.jsx) aren't dead routes. Content
// here is intentionally generic and clearly marked draft: real privacy/
// terms language is a legal decision for Synergy's own team to write and
// have reviewed, not something to fabricate and present as binding policy.
const CONTENT = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      { h: "What this page is", p: "This is a placeholder. Synergy's real Privacy Policy — covering what member data is collected, how it's used, and how it's protected — will replace this page before launch." },
      { h: "In the meantime", p: "If you have questions about your data or account, reach out to your Synergy admin directly." },
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      { h: "What this page is", p: "This is a placeholder. Synergy's real Terms of Service — covering account use, member conduct, and platform rules — will replace this page before launch." },
      { h: "In the meantime", p: "If you have questions about how the platform works, reach out to your Synergy admin directly." },
    ],
  },
};

export default function LegalPage({ page = "privacy" }) {
  const content = CONTENT[page] ?? CONTENT.privacy;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <img src={logoIcon} alt="" />
            <span>Synergy</span>
          </Link>
          <div className="lp-nav-actions">
            <Link to="/" className="lp-btn lp-btn-ghost lp-btn-sm">
              <Icon name="chevron-left" size={14} />
              Back home
            </Link>
          </div>
        </div>
      </header>

      <section className="lp-section" style={{ paddingBottom: "40px" }}>
        <div className="lp-container" style={{ maxWidth: "680px" }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "32px", marginBottom: "28px" }}>{content.title}</h1>
          {content.sections.map((s) => (
            <div key={s.h} style={{ marginBottom: "22px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px" }}>{s.h}</h2>
              <p style={{ fontSize: "14.5px", lineHeight: 1.7, color: "var(--navy-soft)" }}>{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-bottom">
          <span>© {new Date().getFullYear()} Synergy. Build your future.</span>
        </div>
      </footer>
    </div>
  );
}
