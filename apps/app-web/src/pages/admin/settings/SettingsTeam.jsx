import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { setUserRole } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

export default function SettingsTeam() {
  const toast = useToast();
  const { user } = useAuth();
  const [busyUid, setBusyUid] = useState(null);
  const [query, setQuery] = useState("");

  const { loading, data: profiles, refetch } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    [],
  );

  const admins = (profiles ?? []).filter((p) => p.role === "admin");
  const members = (profiles ?? []).filter((p) => p.role === "member");

  const q = query.trim().toLowerCase();
  const matches = q
    ? members.filter(
        (m) => (m.display_name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q),
      )
    : [];

  const revoke = async (p) => {
    if (!window.confirm(`Revoke admin access for ${p.display_name || p.email}? They'll lose access to this admin area.`)) return;
    setBusyUid(p.id);
    try {
      await setUserRole(p.id, "member");
      toast.success("Admin access revoked.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't revoke admin access.");
    } finally {
      setBusyUid(null);
    }
  };

  const grant = async (p) => {
    if (!window.confirm(`Make ${p.display_name || p.email} an admin? They'll get full access to this admin area.`)) return;
    setBusyUid(p.id);
    try {
      await setUserRole(p.id, "admin");
      toast.success("Admin access granted.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't grant admin access.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Team</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Manage who has admin access to this area.
      </p>

      {loading && <Skeleton variant="card" height="200px" />}

      {!loading && (
        <>
          <div className="card-title">Admins</div>
          {admins.length === 0 && <EmptyState icon={<Icon name="users" size={26} />} title="No admins yet" />}
          {admins.length > 0 && (
            <div className="card-elevated" style={{ padding: 0, marginBottom: "28px" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((p) => {
                    const isSelf = p.id === user?.id;
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.display_name || "—"}</td>
                        <td>{p.email}</td>
                        <td>
                          <span className="badge badge-neutral">{p.role}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={isSelf || busyUid === p.id}
                            title={isSelf ? "You can't revoke your own admin access" : "Revoke admin access"}
                            onClick={() => revoke(p)}
                          >
                            <Icon name="user-x" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                            Revoke admin access
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-title">Grant admin access</div>
          <p style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "12px" }}>
            Search current members by name or email, then grant admin access.
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or email…"
            style={{
              border: "1px solid var(--line)",
              borderRadius: "8px",
              padding: "8px 12px",
              width: "100%",
              maxWidth: "360px",
              marginBottom: "14px",
            }}
          />

          {q && matches.length === 0 && <EmptyState icon={<Icon name="users" size={26} />} title="No matching members" />}
          {matches.length > 0 && (
            <div className="card-elevated" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.display_name || "—"}</td>
                      <td>{p.email}</td>
                      <td>
                        <span className="badge badge-neutral">{p.role}</span>
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary" disabled={busyUid === p.id} onClick={() => grant(p)}>
                          <Icon name="check" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                          Make admin
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
