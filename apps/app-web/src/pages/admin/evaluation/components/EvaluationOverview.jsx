import { Link } from "react-router-dom";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";

// Same StatTile shape as AdminDashboard.jsx / OverviewSection.jsx -- kept as
// its own small copy rather than a shared import, matching how this
// codebase already duplicates this exact component per page.
function StatTile({ label, value, icon, tone, loading, to }) {
  const inner = (
    <div className="stat-tile">
      <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="stat-tile-label">{label}</div>
        {loading ? <Skeleton variant="text" width="46px" height="26px" /> : <div className="stat-tile-value">{value}</div>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="card-elevated">
      {inner}
    </Link>
  ) : (
    <div className="card-elevated">{inner}</div>
  );
}

// The four tiles all come from data the page already fetched for the
// attention queue and members directory below (get_admin_members_evaluation
// + admin_count_pending_submissions) -- no separate overview query.
export default function EvaluationOverview({ loading, totalMembers, needsAttentionCount, evaluatedThisWeekCount, pendingReportsCount }) {
  return (
    <div className="grid grid-3" style={{ marginBottom: "24px" }}>
      <StatTile label="Members" value={totalMembers} icon="users" loading={loading} />
      <StatTile
        label="Needs Attention"
        value={needsAttentionCount}
        icon="eye"
        tone={needsAttentionCount > 0 ? "warning" : "success"}
        loading={loading}
        to="/admin/evaluation?filter=needs_attention"
      />
      <StatTile label="Evaluated This Week" value={evaluatedThisWeekCount} icon="check" tone="success" loading={loading} />
      <StatTile label="Pending Reports" value={pendingReportsCount} icon="clipboard" loading={loading} to="/admin/evaluation/reports" />
    </div>
  );
}
