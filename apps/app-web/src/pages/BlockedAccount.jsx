import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import EmptyState from "../components/state/EmptyState.jsx";
import Icon from "../components/Icon.jsx";

const COPY = {
  suspended: {
    title: "Your account is suspended",
    description: "An admin has paused your access to training, tasks, and assignments. This isn't permanent — reach out to your mentor or an admin to find out why and get reinstated.",
  },
  removed: {
    title: "Your account has been removed",
    description: "An admin has removed your access to the program. Your history hasn't been deleted. If you think this is a mistake, contact an admin.",
  },
};

export default function BlockedAccount() {
  const { profile } = useAuth();
  const copy = COPY[profile?.status] ?? COPY.suspended;

  return (
    <div className="auth-screen">
      <EmptyState
        icon={<Icon name="ban" size={26} />}
        title={copy.title}
        description={copy.description}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        }
      />
    </div>
  );
}
