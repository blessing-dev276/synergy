import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";
import logoIcon from "../assets/images/logo-icon.png";

export default function Sidebar({ sections, footer, onCollapsedChange }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");

  // AppShell's topbar title only makes sense once the sidebar's own brand
  // mark shrinks to icon-only (collapsed) or disappears entirely (mobile,
  // handled in CSS) -- this is the one bit of that state it needs.
  useEffect(() => {
    onCollapsedChange?.(collapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

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
        <img src={logoIcon} alt={collapsed ? "Synergy" : ""} />
        {!collapsed && (
          <span className="brand-name" style={{ fontSize: "17px" }}>
            Synergy
          </span>
        )}
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
                title={collapsed ? (item.badge > 0 ? `${item.label} (${item.badge})` : item.label) : undefined}
                className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
              >
                <Icon name={item.icon} size={18} />
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {item.badge > 0 && <span className="nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>}
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
