import logoIcon from "../assets/images/logo-icon.png";

const POINTS = [
  { icon: "🎓", text: "Structured learning paths in real digital skills, not generic courses" },
  { icon: "🌐", text: "A sponsor and a network behind you, growing as you grow" },
  { icon: "💼", text: "A track built to take you from learning to earning" },
];

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="auth-brand-logo">
          <img src={logoIcon} alt="Synergy" style={{ height: "30px" }} />
        </div>

        <div className="auth-brand-copy">
          <div className="eyebrow-lite">Synergy Member Platform</div>
          <h2>Learn. Practice. Build your network. Start earning.</h2>
          <p>
            Everything you need to build a real digital skill, build a portfolio, and turn it
            into income — with a sponsor and a team behind you the whole way.
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
            <img src={logoIcon} alt="Synergy" style={{ height: "28px" }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
