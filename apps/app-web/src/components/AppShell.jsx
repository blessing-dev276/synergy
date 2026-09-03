import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ROLE_LABEL } from "../lib/roles.js";
import Icon from "./Icon.jsx";
import Avatar from "./Avatar.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import NotificationBell from "./NotificationBell.jsx";
import RefreshButton from "./RefreshButton.jsx";
import Sidebar from "./Sidebar.jsx";
import BottomNav from "./BottomNav.jsx";

// Desktop: fixed sidebar (collapsible, icon-only <-> expanded). Mobile:
// bottom tab bar. One shell, parameterized by the nav config each role's
// layout supplies (spec section 32).
export default function AppShell({ sections, bottomItems, title }) {
  const { profile, user, role, viewAsMember, setViewAsMember } = useAuth();
  const navigate = useNavigate();
  // The sidebar already shows its own "Synergy" wordmark once expanded --
  // this title is only useful as a stand-in for that when the sidebar
  // shrinks to icon-only (collapsed) or disappears for the mobile bottom
  // nav (handled in CSS, see .topbar-title's media query).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Bumped by RefreshButton -- see its own comment for why remounting the
  // routed page (key below) is how "refresh all data" works here.
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Both directions navigate too, not just flip the flag — RoleGuard would
  // bounce a stale route on the very next render anyway (an admin's
  // current /admin/... URL isn't member-allowed, and vice versa), so this
  // just lands them somewhere sensible in the same step instead of via an
  // extra redirect flicker.
  const enterMemberView = () => {
    setViewAsMember(true);
    navigate("/dashboard");
  };
  const exitMemberView = () => {
    setViewAsMember(false);
    navigate("/admin");
  };

  return (
    <div className="app-shell">
      <Sidebar
        sections={sections}
        onCollapsedChange={setSidebarCollapsed}
        footer={(collapsed) => (
          <button type="button" className="btn btn-secondary logout-btn" onClick={handleLogout} title={collapsed ? "Log out" : undefined}>
            <Icon name="log-out" size={16} />
            {!collapsed && <span>Log out</span>}
          </button>
        )}
      />
      <div className="app-main">
        {viewAsMember && (
          <div className="preview-banner">
            <Icon name="eye" size={14} />
            <span>Previewing as Member</span>
            <button type="button" onClick={exitMemberView}>
              Return to Admin
            </button>
          </div>
        )}
        <header className="app-topbar">
          <div className={`display topbar-title${sidebarCollapsed ? " is-visible" : ""}`} style={{ fontSize: "17px", fontWeight: 600 }}>
            {title}
          </div>
          <div className="topbar-actions">
            {/* Always in the (sticky) topbar, not just the banner below —
                the banner scrolls away with the page; this is the one
                control guaranteed reachable regardless of scroll position,
                in both directions. */}
            {role === "admin" && (viewAsMember ? (
              <button type="button" className="btn btn-secondary" onClick={exitMemberView}>
                <Icon name="eye-off" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                Return to Admin
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={enterMemberView}>
                <Icon name="eye" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                View as Member
              </button>
            ))}
            <RefreshButton onRefresh={() => setRefreshKey((k) => k + 1)} />
            <NotificationBell />
            <ThemeToggle />
            <Link to="/profile" className="topbar-user">
              <Avatar name={profile?.display_name} photoPath={profile?.photo_url} size={34} />
              <span className="topbar-user-info">
                <span className="topbar-user-name">{profile?.display_name ?? user?.email}</span>
                <span className="topbar-user-role">{viewAsMember ? "Admin (previewing)" : ROLE_LABEL[role] ?? role}</span>
              </span>
            </Link>
          </div>
        </header>
        <main className="app-content">
          <Outlet key={refreshKey} />
        </main>
      </div>
      {bottomItems && <BottomNav items={bottomItems} />}
    </div>
  );
}
