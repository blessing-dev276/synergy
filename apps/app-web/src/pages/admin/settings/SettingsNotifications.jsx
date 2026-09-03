import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { createAnnouncement, deleteAnnouncement } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// The one broadcast-to-everyone notification concept the platform has --
// see supabase/migrations/0090_dashboard_streak_and_announcements.sql.
// Every other row in `notifications` is targeted at one specific member by
// a trigger/RPC reacting to their own data (grading, reviews, wallet
// events); this is deliberately separate and much simpler: a short list an
// admin posts to, and every member's Dashboard.jsx Announcements card reads.
function AnnouncementsCard() {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { loading, data: announcements, refetch } = useSupabaseQuery(
    () => supabase.rpc("get_admin_announcements", {}),
    [],
  );

  const post = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give it a title.");
      return;
    }
    setPosting(true);
    try {
      await createAnnouncement(title.trim(), body.trim());
      toast.success("Posted — every member will see it on their dashboard.");
      setTitle("");
      setBody("");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't post that.");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Remove the announcement "${a.title}"? It'll disappear from every member's dashboard.`)) return;
    setDeletingId(a.id);
    try {
      await deleteAnnouncement(a.id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "24px" }}>
      <div className="card-title">Announcements</div>
      <p className="card-subtitle">Post a short update — it shows on every member's dashboard until you remove it.</p>

      <form onSubmit={post} style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="announcement-title">Title</label>
          <input
            id="announcement-title"
            type="text"
            placeholder="e.g. New training available"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="announcement-body">Details (optional)</label>
          <textarea
            id="announcement-body"
            rows={2}
            placeholder="A sentence or two of context…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={posting} style={{ alignSelf: "flex-start" }}>
          {posting ? "Posting…" : "Post announcement"}
        </button>
      </form>

      {loading && <Skeleton variant="table-row" />}

      {!loading && (!announcements || announcements.length === 0) && (
        <EmptyState icon={<Icon name="bell" size={24} />} title="No announcements posted yet" />
      )}

      {!loading && announcements && announcements.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {announcements.map((a) => (
            <li key={a.id} className="manage-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-title">{a.title}</div>
                {a.body && <div className="row-meta">{a.body}</div>}
                <div className="row-meta">{new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Remove"
                aria-label={`Remove announcement: ${a.title}`}
                disabled={deletingId === a.id}
                onClick={() => remove(a)}
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsNotifications() {
  return (
    <div>
      <div className="section-heading">
        <h1>Notifications</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Broadcast announcements to every member. Per-member notifications (grading, reviews, wallet events, and so on) are already sent
        automatically as those things happen.
      </p>

      <AnnouncementsCard />
    </div>
  );
}
