import { NavLink } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";

// Prospects used to be its own sidebar item, parallel to My Network --
// it's really a sub-section of it (same CRM data backs this badge and
// Dashboard.jsx's ProspectFollowUpCard), so it lives as a tab here instead.
export default function NetworkTabs({ uid }) {
  const { data: dueProspects } = useSupabaseQuery(
    () =>
      uid &&
      supabase
        .from("prospects")
        .select("id")
        .eq("owner_uid", uid)
        .not("status", "in", "(joined,not_interested)")
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", new Date().toISOString().slice(0, 10)),
    [uid],
  );
  const dueCount = dueProspects?.length ?? 0;

  return (
    <div className="page-tabs">
      <NavLink to="/network" end className={({ isActive }) => `page-tab${isActive ? " active" : ""}`}>
        Overview
      </NavLink>
      <NavLink to="/network/prospects" className={({ isActive }) => `page-tab${isActive ? " active" : ""}`}>
        Prospects
        {dueCount > 0 && <span className="nav-badge">{dueCount > 99 ? "99+" : dueCount}</span>}
      </NavLink>
    </div>
  );
}
