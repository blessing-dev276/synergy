import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import Sidebar from "./Sidebar.jsx";
import BottomNav from "./BottomNav.jsx";

// Desktop: fixed sidebar. Mobile: bottom tab bar. One shell, parameterized
// by the nav config each role's layout supplies (spec section 32).
export default function AppShell({ sections, bottomItems, title }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <Sidebar
        sections={sections}
        footer={
          <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={handleLogout}>
            Log out
          </button>
        }
      />
      <div className="app-main">
        <header className="app-topbar">
          <div className="display" style={{ fontSize: "17px", fontWeight: 600 }}>
            {title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "13.5px", color: "var(--slate)" }}>
              {profile?.display_name ?? user?.email}
            </span>
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
