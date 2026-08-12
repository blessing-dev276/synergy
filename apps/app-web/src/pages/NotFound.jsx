import { Link } from "react-router-dom";
import EmptyState from "../components/state/EmptyState.jsx";

export default function NotFound() {
  return (
    <div className="auth-screen">
      <EmptyState
        icon="🧭"
        title="Page not found"
        description="That page doesn't exist or may have moved."
        action={
          <Link to="/dashboard" className="btn btn-primary">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
