import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import BootLoader from "./state/BootLoader.jsx";

// Only applies to members — admins are provisioned by an admin and skip
// the "choose your interests/goals" onboarding flow entirely.
export default function OnboardingGate() {
  const { role, profile, ready } = useAuth();
  const location = useLocation();

  if (!ready || (role === "member" && !profile)) {
    return <BootLoader />;
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
