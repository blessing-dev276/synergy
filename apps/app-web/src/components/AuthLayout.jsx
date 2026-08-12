import logoIcon from "../assets/images/logo-icon.png";
import logoWordmark from "../assets/images/logo-wordmark.png";

const POINTS = [
  { icon: "🎓", text: "Structured learning paths in real digital skills, not generic courses" },
  { icon: "🧑‍🏫", text: "A mentor reviewing your work and pushing you forward" },
  { icon: "💼", text: "A track built to take you from learning to earning" },
];

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="auth-brand-logo">
          <img src={logoIcon} alt="" style={{ height: "30px" }} />
          <span className="auth-brand-wordmark">Synergy</span>
        </div>

        <div className="auth-brand-copy">
          <div className="eyebrow-lite">Synergy Member Platform</div>
          <h2>Learn. Practice. Get mentored. Start earning.</h2>
          <p>
            Everything you need to build a real digital skill, build a portfolio, and turn it
            into income — with a mentor and a team behind you the whole way.
          </p>
          <div className="auth-brand-points">
            {POINTS.map((p) => (
              <div key={p.text} className="auth-brand-point">
                <span className="point-icon" aria-hidden="true">
                  {p.icon}
                </span>
                <span>{p.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-brand-foot">© {new Date().getFullYear()} Synergy. Build your future.</div>
      </aside>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="mobile-brand">
            <img src={logoIcon} alt="" style={{ height: "28px" }} />
            <img src={logoWordmark} alt="Synergy" style={{ height: "20px" }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
