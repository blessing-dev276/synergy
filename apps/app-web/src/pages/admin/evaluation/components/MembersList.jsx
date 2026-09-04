import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../../../components/Icon.jsx";
import Avatar from "../../../../components/Avatar.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { attentionReasonsFor, recentlyEvaluated, relativeDays } from "../lib/attention.js";

const STATUS_BADGE = { pending: "badge-info", active: "badge-success", suspended: "badge-warning", removed: "badge-danger" };

function MemberCard({ member }) {
  const reasons = attentionReasonsFor(member);
  return (
    <div className="card-elevated" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Avatar name={member.displayName} photoPath={member.photoUrl} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.displayName || member.email}
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{member.rankTitle ?? "No rank assigned"}</div>
        </div>
        <span className={`badge ${STATUS_BADGE[member.status] ?? "badge-neutral"}`}>{member.status}</span>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "6px", columnGap: "12px", fontSize: "12.5px", margin: 0 }}>
        <dt style={{ color: "var(--slate)" }}>Rank requirements</dt>
        <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>
          {member.rankReqTotal > 0 ? `${member.rankReqDone}/${member.rankReqTotal} complete` : "—"}
        </dd>
        <dt style={{ color: "var(--slate)" }}>Reports pending</dt>
        <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>{member.reportsPendingCount}</dd>
        <dt style={{ color: "var(--slate)" }}>Last active</dt>
        <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>{relativeDays(member.lastActiveAt) ?? "—"}</dd>
      </dl>

      {reasons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {reasons.slice(0, 2).map((r) => (
            <span key={r.key} className="badge badge-warning" style={{ fontSize: "11px" }}>
              {r.label}
            </span>
          ))}
          {reasons.length > 2 && <span className="badge badge-neutral" style={{ fontSize: "11px" }}>+{reasons.length - 2} more</span>}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px", borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: "12px", color: "var(--slate)" }}>
          {member.lastEvaluationAt ? (
            <>
              Last evaluated {new Date(member.lastEvaluationAt).toLocaleDateString()} · <StatusBadge status={member.lastEvaluationStatus} />
            </>
          ) : (
            <StatusBadge status="not_evaluated" />
          )}
        </div>
        <Link to={`/admin/evaluation/${member.id}`} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "12.5px" }}>
          Open Evaluation
        </Link>
      </div>
    </div>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "pending_evaluation", label: "Pending Evaluation" },
  { key: "recently_evaluated", label: "Recently Evaluated" },
];

export default function MembersList({ members, initialFilter = "all" }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialFilter) ? initialFilter : "all");
  const [rankFilter, setRankFilter] = useState("all");

  const ranks = useMemo(() => [...new Set(members.map((m) => m.rankTitle).filter(Boolean))].sort(), [members]);

  const q = query.trim().toLowerCase();
  const visible = members.filter((m) => {
    if (rankFilter !== "all" && m.rankTitle !== rankFilter) return false;
    if (q && !(m.displayName ?? "").toLowerCase().includes(q) && !(m.email ?? "").toLowerCase().includes(q)) return false;
    if (filter === "needs_attention") return attentionReasonsFor(m).length > 0;
    if (filter === "active") return m.status === "active";
    if (filter === "inactive") return m.status !== "active";
    if (filter === "pending_evaluation") return !m.lastEvaluationAt;
    if (filter === "recently_evaluated") return recentlyEvaluated(m);
    return true;
  });

  return (
    <div>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        Members
      </div>
      <p className="card-subtitle" style={{ marginBottom: "14px" }}>
        The full evaluation directory — search, filter, and open any member's workspace.
      </p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px", flex: 1, minWidth: "200px" }}
        />
        {ranks.length > 0 && (
          <select
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px" }}
          >
            <option value="all">All ranks</option>
            {ranks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "btn btn-primary" : "btn btn-secondary"}
            style={{ padding: "6px 14px", fontSize: "12.5px" }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && <EmptyState icon={<Icon name="users" size={26} />} title="No matching members" />}
      {visible.length > 0 && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          {visible.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}
