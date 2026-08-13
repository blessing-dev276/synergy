import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import Skeleton from "./state/Skeleton.jsx";

const HOME_BY_ROLE = {
  member: "/dashboard",
  admin: "/admin",
};

// Runs after OnboardingGate (so profile.onboarding is already done) and
// before the role-guarded sections. Handles the two ways profiles.status
// can block someone from the app proper:
//   - suspended/removed: always bounced to /blocked, any role.
//   - pending (members only, fresh signups): bounced straight to
//     /pending-approval until an admin approves them.
export default function StatusGate() {
  const { role, profile, ready } = useAuth();
  const location = useLocation();

  const status = profile?.status ?? "active";
  const isPendingMember = ready && role === "member" && status === "pending";

  if (!ready) {
    return (
      <div className="app-content">
        <Skeleton variant="card" height="160px" />
      </div>
    );
  }

  const blocked = status === "suspended" || status === "removed";
  if (blocked) {
    return location.pathname === "/blocked" ? <Outlet /> : <Navigate to="/blocked" replace />;
  }
  if (!blocked && location.pathname === "/blocked") {
    return <Navigate to={HOME_BY_ROLE[role] ?? "/dashboard"} replace />;
  }

  if (isPendingMember) {
    if (location.pathname !== "/pending-approval") {
      return <Navigate to="/pending-approval" replace />;
    }
    return <Outlet />;
  }

  // Not pending — an approved member (or admin) shouldn't be able to sit
  // on the waiting screen.
  if (location.pathname === "/pending-approval") {
    return <Navigate to={HOME_BY_ROLE[role] ?? "/dashboard"} replace />;
  }

  return <Outlet />;
}
