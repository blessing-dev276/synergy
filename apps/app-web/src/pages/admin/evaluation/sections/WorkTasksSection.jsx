import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

// get_my_content_assignments(p_uid) already lets an admin pass any member's
// uid (0028/0033: "if p_uid <> auth.uid() and current_role() <> 'admin'
// then raise exception") -- the exact same data/shape the member's own
// Today's Tasks reads, just scoped to this member instead of the caller.
export default function WorkTasksSection({ member }) {
  const { loading, data } = useSupabaseQuery(() => supabase.rpc("get_my_content_assignments", { p_uid: member.id }), [member.id]);

  if (loading) return <Skeleton variant="card" height="120px" />;

  const items = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const required = items.filter((t) => t.isRequired !== false);
  const done = required.filter((t) => t.isDone);
  const overdue = required.filter((t) => !t.isDone && t.dueDate && t.dueDate < today);

  if (items.length === 0) {
    return <EmptyState icon={<Icon name="check-square" size={24} />} title="No activities assigned yet" />;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "20px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div>
          <div className="row-meta">Completed</div>
          <div className="stat-tile-value" style={{ fontSize: "20px" }}>
            {done.length}/{required.length}
          </div>
        </div>
        {overdue.length > 0 && (
          <div>
            <div className="row-meta">Overdue</div>
            <div className="stat-tile-value" style={{ fontSize: "20px", color: "var(--danger)" }}>
              {overdue.length}
            </div>
          </div>
        )}
      </div>

      {overdue.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {overdue.slice(0, 5).map((t) => (
            <li key={t.id} style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="clock" size={12} style={{ color: "var(--danger)" }} />
              {t.title} <span style={{ color: "var(--slate)" }}>— due {new Date(t.dueDate).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
