import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { setUserRole, setMemberStatus } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const ROLES = ["member", "mentor", "admin"];

const STATUS_FILTERS = [
  { value: "not_removed", label: "All except removed" },
  { value: "pending", label: "Pending approval" },
  { value: "active", label: "Active only" },
  { value: "suspended", label: "Suspended only" },
  { value: "removed", label: "Removed / Archived" },
  { value: "all", label: "All" },
];

const STATUS_BADGE = {
  pending: "badge-info",
  active: "badge-success",
  suspended: "badge-warning",
  removed: "badge-danger",
};

function matchesFilter(status, filter) {
  if (filter === "all") return true;
  if (filter === "not_removed") return status !== "removed";
  return status === filter;
}

export default function MemberList() {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const validFilters = new Set(STATUS_FILTERS.map((f) => f.value));
  const initialFilter = searchParams.get("status");
  const [busyUid, setBusyUid] = useState(null);
  const [statusFilter, setStatusFilter] = useState(validFilters.has(initialFilter) ? initialFilter : "not_removed");
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { loading, data: users, refetch } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    [],
  );

  const visibleUsers = (users ?? []).filter((u) => matchesFilter(u.status ?? "active", statusFilter));

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

  const changeStatus = async (u, status) => {
    const wasPending = (u.status ?? "active") === "pending";
    if (status === "suspended" && !window.confirm(`Suspend ${u.display_name || u.email}? They'll stay logged in but won't be able to take part in any training, tasks, or assignments until reinstated.`)) return;
    if (status === "removed" && wasPending && !window.confirm(`Reject ${u.display_name || u.email}'s application? Their profile is archived and hidden from this list. This can be undone.`)) return;
    if (status === "removed" && !wasPending && !window.confirm(`Remove ${u.display_name || u.email}? Their profile is archived and hidden from this list, and they lose access to the program. Their data is kept, not deleted, and this can be undone.`)) return;
    setBusyUid(u.id);
    try {
      await setMemberStatus(u.id, status);
      toast.success(
        status === "active" ? (wasPending ? "Member approved." : "Member reinstated.") : status === "suspended" ? "Member suspended." : wasPending ? "Application rejected." : "Member removed (archived).",
      );
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update status.");
    } finally {
      setBusyUid(null);
    }
  };

  const toggleSelect = (uid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const selectableUids = visibleUsers.filter((u) => u.role !== "admin" && u.id !== user?.id).map((u) => u.id);
  const allSelected = selectableUids.length > 0 && selectableUids.every((id) => selected.has(id));

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableUids));
  };

  const bulkChangeStatus = async (status) => {
    const targets = [...selected];
    if (targets.length === 0) return;
    const verb = status === "active" ? "reinstate" : status;
    if (!window.confirm(`${verb === "reinstate" ? "Reinstate" : `${verb[0].toUpperCase()}${verb.slice(1)}`} ${targets.length} member(s)?`)) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(targets.map((uid) => setMemberStatus(uid, status)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} of ${targets.length} couldn't be updated.`);
      else toast.success(`${targets.length} member(s) updated.`);
      setSelected(new Set());
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Members & Mentors</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px" }}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="card-elevated" style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{selected.size} selected</span>
          <button type="button" className="btn btn-secondary" disabled={bulkBusy} onClick={() => bulkChangeStatus("suspended")}>
            <Icon name="ban" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Suspend
          </button>
          <button type="button" className="btn btn-secondary" disabled={bulkBusy} onClick={() => bulkChangeStatus("active")}>
            <Icon name="rotate-ccw" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Reinstate
          </button>
          <button type="button" className="btn btn-danger" disabled={bulkBusy} onClick={() => bulkChangeStatus("removed")}>
            <Icon name="user-x" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Remove
          </button>
          <button type="button" className="btn btn-secondary" disabled={bulkBusy} onClick={() => setSelected(new Set())} style={{ marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      {loading && <Skeleton variant="card" height="200px" />}
      {!loading && visibleUsers.length === 0 && <EmptyState icon={<Icon name="users" size={26} />} title="No members yet" />}
      {visibleUsers.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={selectableUids.length === 0} aria-label="Select all" />
                </th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Change role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => {
                const status = u.status ?? "active";
                const isSelf = u.id === user?.id;
                const isAdmin = u.role === "admin";
                return (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        disabled={isSelf || isAdmin}
                        aria-label={`Select ${u.display_name || u.email}`}
                      />
                    </td>
                    <td>
                      <Link to={`/admin/members/${u.id}`} style={{ fontWeight: 600 }}>
                        {u.display_name || u.email}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{u.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[status] ?? "badge-neutral"}`}>{status}</span>
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
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Link to={`/admin/members/${u.id}`} className="icon-btn" title="Manage">
                          <Icon name="pencil" size={14} />
                        </Link>
                        {!isSelf && !isAdmin && status === "pending" && (
                          <>
                            <button type="button" className="icon-btn" title="Approve" disabled={busyUid === u.id} onClick={() => changeStatus(u, "active")}>
                              <Icon name="check" size={14} />
                            </button>
                            <button type="button" className="icon-btn icon-btn-danger" title="Reject" disabled={busyUid === u.id} onClick={() => changeStatus(u, "removed")}>
                              <Icon name="x" size={14} />
                            </button>
                          </>
                        )}
                        {!isSelf && !isAdmin && status !== "pending" && status !== "suspended" && (
                          <button type="button" className="icon-btn" title="Suspend" disabled={busyUid === u.id} onClick={() => changeStatus(u, "suspended")}>
                            <Icon name="ban" size={14} />
                          </button>
                        )}
                        {!isSelf && !isAdmin && status !== "pending" && status !== "active" && (
                          <button type="button" className="icon-btn" title="Reinstate" disabled={busyUid === u.id} onClick={() => changeStatus(u, "active")}>
                            <Icon name="rotate-ccw" size={14} />
                          </button>
                        )}
                        {!isSelf && !isAdmin && status !== "pending" && status !== "removed" && (
                          <button type="button" className="icon-btn icon-btn-danger" title="Remove" disabled={busyUid === u.id} onClick={() => changeStatus(u, "removed")}>
                            <Icon name="user-x" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
