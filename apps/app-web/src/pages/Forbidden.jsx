import { Link } from "react-router-dom";
import EmptyState from "../components/state/EmptyState.jsx";

export default function Forbidden() {
  return (
    <div className="auth-screen">
      <EmptyState
        icon="🔒"
        title="You don't have access to this page"
        description="If you think this is a mistake, contact an admin."
        action={
          <Link to="/dashboard" className="btn btn-primary">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
