import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Read-only by design (see supabase/migrations/0018_role_simplification_and_
// sponsor_schema.sql's header comment): mentor_assignments rows are kept as
// historical data, not auto-converted into sponsor relationships, because a
// mentor wasn't necessarily who actually invited their assigned members.
// Review each row and, where it genuinely reflects a real sponsor
// relationship, assign it by hand from the member's detail page.
export default function LegacyMentors() {
  const { loading, data: rows } = useSupabaseQuery(
    () =>
      supabase
        .from("mentor_assignments")
        .select(
          "*, mentor:profiles!mentor_assignments_mentor_uid_fkey(display_name, email), member:profiles!mentor_assignments_member_uid_fkey(display_name, email)",
        )
        .order("assigned_at", { ascending: false }),
    [],
  );

  return (
    <div>
      <h1>Legacy Mentors</h1>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Oversight assignments from before Synergy moved to the sponsor/network model. Kept for reference only —
        nothing here is wired into the network. If a row reflects a real sponsor relationship, assign it manually
        from that member's detail page.
      </p>

      {loading && <Skeleton variant="card" height="160px" />}
      {!loading && (rows ?? []).length === 0 && (
        <EmptyState icon={<Icon name="users" size={26} />} title="No legacy mentor assignments" />
      )}
      {(rows ?? []).length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Former mentor</th>
                <th>Member</th>
                <th>Assigned</th>
                <th>Still marked active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.mentor?.display_name || r.mentor?.email || "—"}</td>
                  <td>{r.member?.display_name || r.member?.email || "—"}</td>
                  <td style={{ fontSize: "13px", color: "var(--slate)" }}>{new Date(r.assigned_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${r.active ? "badge-neutral" : "badge-danger"}`}>{r.active ? "yes" : "no"}</span>
                  </td>
                  <td>
                    <Link to={`/admin/members/${r.member_uid}`} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "12.5px" }}>
                      Review member
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
