import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import Icon from "./Icon.jsx";

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Lives in AppShell.jsx's topbar, right next to ThemeToggle -- reuses its
// .theme-toggle circular-icon-button styling directly rather than a new
// class, so the two sit visually matched with no extra CSS needed for the
// trigger itself. Was previously a full sidebar nav tab (NotificationList.jsx,
// still reachable via the "View all" link below and directly at
// /notifications) -- this replaces that tab with an always-visible badge +
// an anchored slide-down panel, same outside-click-closes pattern
// SponsorPicker.jsx already established for a floating popup in this app.
export default function NotificationBell() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const viewAllTo = role === "admin" ? "/admin/notifications" : "/notifications";

  const { data: notifications, refetch } = useSupabaseQuery(
    () => user && supabase.from("notifications").select("*").eq("uid", user.id).order("created_at", { ascending: false }).limit(20),
    [user?.id],
  );

  const items = notifications ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const openNotification = async (n) => {
    setOpen(false);
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      refetch();
    }
    if (n.link_to) navigate(n.link_to);
  };

  const markAllRead = async (e) => {
    e.stopPropagation();
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    refetch();
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Icon name="bell" size={17} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 && <div className="notification-empty">You're all caught up.</div>}

          {items.length > 0 && (
            <ul className="notification-list">
              {items.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notification-item${n.read ? "" : " unread"}`} onClick={() => openNotification(n)}>
                    <div className="notification-item-title">{n.title}</div>
                    <div className="notification-item-body">{n.body}</div>
                    <div className="notification-item-time">{relativeTime(n.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link to={viewAllTo} className="notification-view-all" onClick={() => setOpen(false)}>
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
