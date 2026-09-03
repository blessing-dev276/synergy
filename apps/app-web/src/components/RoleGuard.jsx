import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import Skeleton from "./state/Skeleton.jsx";

const HOME_BY_ROLE = {
  member: "/dashboard",
  admin: "/admin",
};

// UX-only redirect based on profiles.role. Never treat this as the security
// boundary — RLS policies and SECURITY DEFINER RPCs (see supabase/migrations)
// read current_role() independently and are the actual enforcement.
//
// viewAsMember (AuthContext) is an admin-only UI preview toggle, not a role
// change — it never touches `role` itself, only what this guard lets
// through: while it's on, an admin passes member-allowed groups and is
// bounced OUT of admin-allowed ones (back to /dashboard, not /admin), so
// the two route trees stay mutually exclusive and the admin can't just
// wander back into /admin/* by URL mid-preview.
export default function RoleGuard({ allow }) {
  const { role, ready, viewAsMember } = useAuth();

  if (!ready || role === null) {
    return (
      <div className="app-content">
        <Skeleton variant="card" height="160px" />
      </div>
    );
  }

  const passes = viewAsMember ? allow.includes("member") : allow.includes(role);

  if (!passes) {
    const home = viewAsMember ? "/dashboard" : (HOME_BY_ROLE[role] ?? "/403");
    return <Navigate to={home} replace />;
  }

  return <Outlet />;
}
