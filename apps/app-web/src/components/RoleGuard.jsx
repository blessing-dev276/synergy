import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import Skeleton from "./state/Skeleton.jsx";

const HOME_BY_ROLE = {
  member: "/dashboard",
  mentor: "/mentor",
  admin: "/admin",
};

// UX-only redirect based on profiles.role. Never treat this as the security
// boundary — RLS policies and SECURITY DEFINER RPCs (see supabase/migrations)
// read current_role() independently and are the actual enforcement.
export default function RoleGuard({ allow }) {
  const { role, ready } = useAuth();

  if (!ready || role === null) {
    return (
      <div className="app-content">
        <Skeleton variant="card" height="160px" />
      </div>
    );
  }

  if (!allow.includes(role)) {
    return <Navigate to={HOME_BY_ROLE[role] ?? "/403"} replace />;
  }

  return <Outlet />;
}
