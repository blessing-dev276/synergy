import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import Skeleton from "./state/Skeleton.jsx";

// Only applies to members — mentors/admins are provisioned by an admin and
// skip the "choose your interests/goals" onboarding flow entirely.
export default function OnboardingGate() {
  const { role, profile, ready } = useAuth();
  const location = useLocation();

  if (!ready || (role === "member" && !profile)) {
    return (
      <div className="app-content">
        <Skeleton variant="card" height="160px" />
      </div>
    );
  }

  const needsOnboarding = role === "member" && !profile?.onboarding?.completed;

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
