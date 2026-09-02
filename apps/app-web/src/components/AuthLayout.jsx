import logoIcon from "../assets/images/logo-icon.png";

const POINTS = [
  {
    icon: "🎓",
    title: "Structured Learning",
    text: "Build practical skills through guided learning paths, training, and personal development.",
  },
  {
    icon: "🌐",
    title: "Build Your Network",
    text: "Work with your sponsor, team, and community while growing your Network Marketing business.",
  },
  {
    icon: "💼",
    title: "Work Like a Real Job",
    text: "Set goals, complete daily activities, track your progress, and stay accountable.",
  },
];

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="auth-brand-logo">
          <img src={logoIcon} alt="Synergy" style={{ height: "30px" }} />
        </div>

        <div className="auth-brand-copy">
          <div className="eyebrow-lite">Synergy Member Office</div>
          <h2>Learn. Work. Build. Earn.</h2>
          <p>
            Your digital office for building real skills, growing your business, and creating
            income through Network Marketing and Freelancing — all from one place.
          </p>
          <div className="auth-brand-points">
            {POINTS.map((p) => (
              <div key={p.title} className="auth-brand-point">
                <span className="point-icon" aria-hidden="true">
                  {p.icon}
                </span>
                <div className="point-copy">
                  <div className="point-title">{p.title}</div>
                  <p className="point-text">{p.text}</p>
                </div>
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
