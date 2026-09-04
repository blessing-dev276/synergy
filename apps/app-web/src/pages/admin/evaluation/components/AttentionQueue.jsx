import { Link } from "react-router-dom";
import Icon from "../../../../components/Icon.jsx";
import Avatar from "../../../../components/Avatar.jsx";
import { relativeDays } from "../lib/attention.js";

// The admin's action queue -- every member with at least one real,
// rule-based attention reason (attention.js), most-reasons-first so the
// members who need the most looking-at surface at the top.
export default function AttentionQueue({ items }) {
  if (items.length === 0) {
    return (
      <div className="attention-card all-clear" style={{ marginBottom: "28px" }}>
        <div className="attention-row">
          <span className="icon-badge tone-success">
            <Icon name="check" size={17} />
          </span>
          <div style={{ fontWeight: 600, fontSize: "14px" }}>Nobody needs attention right now — every active member is on track.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "28px" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        <Icon name="eye" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Needs Your Attention
      </div>
      <p className="card-subtitle" style={{ marginBottom: "14px" }}>
        {items.length} member{items.length === 1 ? "" : "s"} flagged by real activity signals — not a guess.
      </p>

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
        {items.map(({ member, reasons }) => (
          <li key={member.id} className="card-elevated" style={{ display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" }}>
            <Avatar name={member.displayName} photoPath={member.photoUrl} size={40} />
            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ fontWeight: 700, fontSize: "14.5px" }}>{member.displayName || member.email}</div>
              <div style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "8px" }}>
                {member.rankTitle ?? "No rank assigned"}
                {member.lastActiveAt && <> · Last active {relativeDays(member.lastActiveAt)}</>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {reasons.map((r) => (
                  <span key={r.key} className="badge badge-warning">
                    <Icon name={r.icon} size={11} style={{ verticalAlign: "-1px", marginRight: "4px" }} />
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
            <Link to={`/admin/evaluation/${member.id}`} className="btn btn-primary" style={{ alignSelf: "center" }}>
              Evaluate
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
