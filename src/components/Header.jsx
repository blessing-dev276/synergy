import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import logoWordmark from "../assets/images/logo-wordmark.png";
import { NAV_LINKS, TRACKS_NAV } from "../data/site.js";
import { BUSINESS_TOOLKIT } from "../data/businessToolkit.js";
import { whatsappLink } from "../lib/whatsapp.js";
import { trackTikTok } from "../lib/tiktok.js";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const location = useLocation();
  const onToolkitRoute = location.pathname.startsWith("/business-toolkit");
  const onTracksRoute = TRACKS_NAV.some((t) => t.to === location.pathname);

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
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Home
          </NavLink>
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-dropdown-trigger ${onTracksRoute ? "active" : ""}`}
              aria-haspopup="true"
            >
              Tracks
              <svg
                className="nav-dropdown-chevron"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="nav-dropdown-menu">
              {TRACKS_NAV.map((track) => (
                <NavLink
                  key={track.to}
                  to={track.to}
                  className={({ isActive }) =>
                    `nav-dropdown-item ${isActive ? "active" : ""}`
                  }
                >
                  {track.label}
                </NavLink>
              ))}
            </div>
          </div>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {link.label}
            </NavLink>
          ))}
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-dropdown-trigger ${onToolkitRoute ? "active" : ""}`}
              aria-haspopup="true"
            >
              Business Toolkit
              <svg
                className="nav-dropdown-chevron"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="nav-dropdown-menu">
              {BUSINESS_TOOLKIT.map((tool) => (
                <NavLink
                  key={tool.slug}
                  to={`/business-toolkit/${tool.slug}`}
                  className={({ isActive }) =>
                    `nav-dropdown-item ${isActive ? "active" : ""}`
                  }
                >
                  {tool.name}
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        <div className="nav-right">
          <NavLink
            to="/join"
            className="nav-cta"
            onClick={() => trackTikTok("ClickButton", { content_name: "Join The Team (header)" })}
          >
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
        containing block for position:fixed descendants, that silently
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
              <NavLink
                to="/"
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Home
              </NavLink>
            </div>

            <div className="mobile-toolkit">
              <button
                type="button"
                className={`mobile-toolkit-trigger ${onTracksRoute ? "active" : ""}`}
                aria-expanded={tracksOpen}
                onClick={() => setTracksOpen((v) => !v)}
              >
                Tracks
                <svg
                  className={`nav-dropdown-chevron ${tracksOpen ? "open" : ""}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {tracksOpen && (
                <div className="mobile-toolkit-links">
                  {TRACKS_NAV.map((track) => (
                    <NavLink
                      key={track.to}
                      to={track.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        isActive ? "active" : undefined
                      }
                    >
                      {track.label}
                    </NavLink>
                  ))}
                </div>
              )}
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

            <div className="mobile-toolkit">
              <button
                type="button"
                className={`mobile-toolkit-trigger ${onToolkitRoute ? "active" : ""}`}
                aria-expanded={toolkitOpen}
                onClick={() => setToolkitOpen((v) => !v)}
              >
                Business Toolkit
                <svg
                  className={`nav-dropdown-chevron ${toolkitOpen ? "open" : ""}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {toolkitOpen && (
                <div className="mobile-toolkit-links">
                  {BUSINESS_TOOLKIT.map((tool) => (
                    <NavLink
                      key={tool.slug}
                      to={`/business-toolkit/${tool.slug}`}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        isActive ? "active" : undefined
                      }
                    >
                      {tool.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <NavLink
              to="/join"
              className="nav-cta"
              onClick={() => {
                setOpen(false);
                trackTikTok("ClickButton", { content_name: "Join The Team (mobile nav)" });
              }}
            >
              Join The Team →
            </NavLink>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noreferrer"
              className="mobile-nav-whatsapp"
              onClick={() => trackTikTok("Contact")}
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
