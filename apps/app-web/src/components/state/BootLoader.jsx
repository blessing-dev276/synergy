import logoIcon from "../../assets/images/logo-icon.png";

// Full-screen branded loading state for the one moment users actually sit
// on a loading screen for a real duration: initial session restore in
// ProtectedRoute. Dual counter-rotating rings + a pulsing glow + a
// breathing logo — purely CSS-driven (see .boot-loader* in app.css) so it
// costs nothing to keep mounted.
export default function BootLoader({ label = "Loading your workspace" }) {
  return (
    <div className="boot-loader" role="status" aria-live="polite">
      <div className="boot-loader-orb">
        <span className="boot-loader-ring" />
        <span className="boot-loader-ring boot-loader-ring-2" />
        <img src={logoIcon} alt="" className="boot-loader-logo" />
      </div>
      <div className="boot-loader-label">{label}</div>
      <div className="boot-loader-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
