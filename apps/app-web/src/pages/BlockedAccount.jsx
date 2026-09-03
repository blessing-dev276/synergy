import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import EmptyState from "../components/state/EmptyState.jsx";
import Icon from "../components/Icon.jsx";

const COPY = {
  suspended: {
    title: "Your account is suspended",
    description: "An admin has paused your access to training, tasks, and assignments. This isn't permanent — reach out to your sponsor or an admin to find out why and get reinstated.",
  },
  removed: {
    title: "Your account has been removed",
    description: "An admin has removed your access to the program. Your history hasn't been deleted. If you think this is a mistake, contact an admin.",
  },
  // Same underlying status as `removed` (leave_office, 0092, sets status
  // = 'removed' same as an admin removing someone would) -- left_at is
  // the one signal that distinguishes "you left" from "an admin removed
  // you", so this takes priority over the generic removed copy below.
  left: {
    title: "You've left the Synergy Office",
    description: "You chose to leave — your history hasn't been deleted. If you'd like to come back, contact an admin to have your access reinstated.",
  },
};

export default function BlockedAccount() {
  const { profile } = useAuth();
  const copy = profile?.left_at ? COPY.left : (COPY[profile?.status] ?? COPY.suspended);

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
