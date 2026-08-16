import { Link, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ROLE_LABEL } from "../lib/roles.js";
import Icon from "./Icon.jsx";
import Avatar from "./Avatar.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import Sidebar from "./Sidebar.jsx";
import BottomNav from "./BottomNav.jsx";

// Desktop: fixed sidebar (collapsible, icon-only <-> expanded). Mobile:
// bottom tab bar. One shell, parameterized by the nav config each role's
// layout supplies (spec section 32).
export default function AppShell({ sections, bottomItems, title }) {
  const { profile, user, role } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <Sidebar
        sections={sections}
        footer={(collapsed) => (
          <button type="button" className="btn btn-secondary logout-btn" onClick={handleLogout} title={collapsed ? "Log out" : undefined}>
            <Icon name="log-out" size={16} />
            {!collapsed && <span>Log out</span>}
          </button>
        )}
      />
      <div className="app-main">
        <header className="app-topbar">
          <div className="display" style={{ fontSize: "17px", fontWeight: 600 }}>
            {title}
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <Link to="/profile" className="topbar-user">
              <Avatar name={profile?.display_name} photoPath={profile?.photo_url} size={34} />
              <span className="topbar-user-info">
                <span className="topbar-user-name">{profile?.display_name ?? user?.email}</span>
                <span className="topbar-user-role">{ROLE_LABEL[role] ?? role}</span>
              </span>
            </Link>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      {bottomItems && <BottomNav items={bottomItems} />}
    </div>
  );
}
