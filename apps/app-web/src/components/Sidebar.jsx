import { useState } from "react";
import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";
import logoIcon from "../assets/images/logo-icon.png";

export default function Sidebar({ sections, footer }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <img src={logoIcon} alt="Synergy" />
      </div>

      <nav className="app-nav">
        {sections.map((section) => (
          <div key={section.label ?? section.items[0]?.to}>
            {section.label && !collapsed && <div className="app-nav-section">{section.label}</div>}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
              >
                <Icon name={item.icon} size={18} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button type="button" className="sidebar-toggle" onClick={toggle} title={collapsed ? "Expand" : "Collapse"}>
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
      </button>

      {footer && <div className="app-sidebar-footer">{footer(collapsed)}</div>}
    </aside>
  );
}
