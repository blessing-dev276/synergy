import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import Skeleton from "./state/Skeleton.jsx";

// Client-side redirect only, for UX — the real gate is Firestore Security
// Rules and Cloud Functions, which never trust anything from the client.
export default function ProtectedRoute() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="auth-screen">
        <Skeleton variant="card" width="360px" height="200px" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
