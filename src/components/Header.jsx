import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import logoWordmark from "../assets/images/logo-wordmark.png";
import { NAV_LINKS } from "../data/site.js";
import { whatsappLink } from "../lib/whatsapp.js";

export default function Header() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the mobile drawer is open, and let Escape close it.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="site-header">
      <nav className="wrap">
        <NavLink to="/" className="logo-mark" onClick={() => setOpen(false)}>
          <img src={logoWordmark} alt="SynergyTeam" className="wordmark" />
        </NavLink>

        <div className="nav-links">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="nav-right">
          <NavLink to="/join" className="nav-cta">
            Join The Team
          </NavLink>
          <button
            className="nav-toggle"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="#0B1F3A"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/*
        Rendered via portal straight onto <body>, not nested inside <header>.
        header.site-header uses backdrop-filter, which establishes a
        containing block for position:fixed descendants — that silently
        shrank this drawer down to the header's own ~75px height when it
        lived inside <header>. Portalling it out sidesteps that entirely.
      */}
      {createPortal(
        <>
          <div
            className={`mobile-nav-backdrop ${open ? "open" : ""}`}
            onClick={() => setOpen(false)}
          />
          <aside
            className={`mobile-nav ${open ? "open" : ""}`}
            aria-hidden={!open}
          >
            <div className="mobile-nav-top">
              <img src={logoWordmark} alt="SynergyTeam" className="wordmark" />
              <button
                className="mobile-nav-close"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="#0B1F3A"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="mobile-nav-links">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    isActive ? "active" : undefined
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
            <NavLink
              to="/join"
              className="nav-cta"
              onClick={() => setOpen(false)}
            >
              Join The Team →
            </NavLink>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noreferrer"
              className="mobile-nav-whatsapp"
            >
              Chat on WhatsApp
            </a>
          </aside>
        </>,
        document.body,
      )}
    </header>
  );
}
