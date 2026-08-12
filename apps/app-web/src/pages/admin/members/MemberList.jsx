import { Link } from "react-router-dom";
import { collection, query, orderBy } from "firebase/firestore";
import { useState } from "react";
import { db } from "../../../firebase.js";
import { useLiveQuery } from "../../../lib/firestoreHooks.js";
import { setUserRole } from "../../../lib/callables.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const ROLES = ["member", "mentor", "admin"];

export default function MemberList() {
  const toast = useToast();
  const [busyUid, setBusyUid] = useState(null);

  const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const { loading, data: users } = useLiveQuery(usersQuery, []);

  const changeRole = async (uid, role) => {
    setBusyUid(uid);
    try {
      await setUserRole({ uid, role });
      toast.success("Role updated. They'll see it next time they log in.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't update role.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div>
      <h1>Members & Mentors</h1>
      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && (!users || users.length === 0) && <EmptyState icon="👥" title="No members yet" />}
      {users && users.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/admin/members/${u.id}`}>{u.displayName || u.email}</Link>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
