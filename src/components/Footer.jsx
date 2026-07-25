import { NavLink } from "react-router-dom";
import logoWordmark from "../assets/images/logo-wordmark.png";
import { FOOTER_LINKS, SITE } from "../data/site.js";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo-mark">
              <img src={logoWordmark} alt={SITE.name} className="wordmark" />
            </div>
            <p>{SITE.shortTagline}</p>
          </div>

          <div className="footer-cols">
            <div className="footer-col">
              <h5>Tracks</h5>
              {FOOTER_LINKS.tracks.map((link) => (
                <NavLink key={link.to} to={link.to}>
                  {link.label}
                </NavLink>
              ))}
            </div>
            <div className="footer-col">
              <h5>Team</h5>
              {FOOTER_LINKS.team.map((link) => (
                <NavLink key={link.to} to={link.to}>
                  {link.label}
                </NavLink>
              ))}
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              {FOOTER_LINKS.legal.map((link) => (
                <NavLink key={link.to} to={link.to}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        <p className="footer-disclaimer">
          Income results mentioned or implied anywhere on this site are not typical and are not guaranteed.
          Both the freelancing and network marketing tracks require consistent individual effort — see our{" "}
          <NavLink to="/disclaimer">income disclaimer</NavLink> for details.
        </p>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {SITE.name}. All rights reserved.</span>
          <span>{SITE.location}</span>
        </div>
      </div>
    </footer>
  );
}
