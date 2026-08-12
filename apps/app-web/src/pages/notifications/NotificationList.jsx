import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function NotificationList() {
  const { user } = useAuth();

  const {
    loading,
    error,
    data: notifications,
    refetch,
  } = useSupabaseQuery(
    () => user && supabase.from("notifications").select("*").eq("uid", user.id).order("created_at", { ascending: false }),
    [user?.id],
  );

  const markRead = async (id) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    refetch();
  };

  return (
    <div>
      <h1>Notifications</h1>
      {loading && <Skeleton variant="card" height="100px" />}
      {error && <ErrorState description="Couldn't load notifications." />}
      {!loading && !error && (!notifications || notifications.length === 0) && (
        <EmptyState icon="🔔" title="You're all caught up" />
      )}
      {notifications && notifications.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                padding: "16px 22px",
                borderBottom: i === notifications.length - 1 ? "none" : "1px solid var(--line)",
                background: n.read ? "transparent" : "var(--bg)",
                cursor: n.read ? "default" : "pointer",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "14px" }}>{n.title}</div>
              <div style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "3px" }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
