import { NavLink } from "react-router-dom";
import logoIcon from "../assets/images/logo-icon.png";
import logoWordmark from "../assets/images/logo-wordmark.png";

export default function Sidebar({ sections, footer }) {
  return (
    <aside className="app-sidebar">
      <div className="brand">
        <img src={logoIcon} alt="" />
        <img src={logoWordmark} alt="Synergy" style={{ height: "22px" }} />
      </div>
      <nav className="app-nav">
        {sections.map((section) => (
          <div key={section.label ?? "default"}>
            {section.label && <div className="app-nav-section">{section.label}</div>}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {footer && <div className="app-sidebar-footer">{footer}</div>}
    </aside>
  );
}
