import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { setUserRole } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const ROLES = ["member", "mentor", "admin"];

export default function MemberList() {
  const toast = useToast();
  const [busyUid, setBusyUid] = useState(null);

  const { loading, data: users, refetch } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    [],
  );

  const changeRole = async (uid, role) => {
    setBusyUid(uid);
    try {
      await setUserRole(uid, role);
      toast.success("Role updated. They'll see it next time they log in.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update role.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Members & Mentors</h1>
      </div>
      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && (!users || users.length === 0) && <EmptyState icon={<Icon name="users" size={26} />} title="No members yet" />}
      {users && users.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Change role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/admin/members/${u.id}`} style={{ fontWeight: 600 }}>
                      {u.display_name || u.email}
                    </Link>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{u.role}</span>
                  </td>
                  <td>
                    <select
                      value={u.role}
                      disabled={busyUid === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "6px 10px" }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Link to={`/admin/members/${u.id}`} className="icon-btn" title="Manage">
                      <Icon name="pencil" size={14} />
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
