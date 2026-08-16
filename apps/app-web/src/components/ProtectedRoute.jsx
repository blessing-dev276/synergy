import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import BootLoader from "./state/BootLoader.jsx";

// Client-side redirect only, for UX — the real gate is Firestore Security
// Rules and Cloud Functions, which never trust anything from the client.
export default function ProtectedRoute() {
  const { user, ready } = useAuth();
  const location = useLocation();

  // The one loading state nearly every visit passes through for a real
  // duration (session restore on first load) — worth the full branded
  // BootLoader rather than a plain skeleton.
  if (!ready) {
    return <BootLoader />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
