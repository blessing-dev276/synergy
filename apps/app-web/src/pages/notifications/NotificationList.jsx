import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { notificationIcon } from "../../lib/notificationIcons.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function NotificationList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    loading,
    error,
    data: notifications,
    refetch,
  } = useSupabaseQuery(
    () => user && supabase.from("notifications").select("*").eq("uid", user.id).order("created_at", { ascending: false }),
    [user?.id],
  );

  // Same "mark read, then go where it points" flow as the bell dropdown
  // (NotificationBell.jsx's openNotification) -- this page used to only
  // mark read and go nowhere, which broke the "click -> land on the right
  // page/item" flow the whole notification system exists for. Navigates
  // regardless of read state, so an already-read row is still a working
  // link back to whatever it was about.
  const openNotification = async (n) => {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      refetch();
    }
    if (n.link_to) navigate(n.link_to);
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
            <button
              type="button"
              key={n.id}
              onClick={() => openNotification(n)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "16px 22px",
                borderBottom: i === notifications.length - 1 ? "none" : "1px solid var(--line)",
                backgroundColor: n.read ? "transparent" : "var(--bg)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "14px" }}>
                <span aria-hidden="true">{notificationIcon(n.type)}</span> {n.title}
                {!n.read && <span className="badge badge-info" style={{ marginLeft: "8px", verticalAlign: "1px" }}>New</span>}
              </div>
              <div style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "3px" }}>{n.body}</div>
              <div style={{ fontSize: "11.5px", color: "var(--slate)", marginTop: "6px" }}>{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
