import Icon from "../../../../components/Icon.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { EVALUATION_CATEGORIES } from "../../../../lib/evaluationStatus.js";

const CATEGORY_LABEL = Object.fromEntries(EVALUATION_CATEGORIES.map((c) => [c.key, c.label]));

// A timeline, not a from-scratch re-evaluation every visit -- every row
// admin_save_evaluation has ever written for this member (0128),
// newest first.
export default function EvaluationHistory({ loading, entries }) {
  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="activity" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Evaluation History
      </div>

      {loading && <Skeleton variant="card" height="120px" />}
      {!loading && entries.length === 0 && <EmptyState icon={<Icon name="activity" size={22} />} title="No evaluations recorded yet" />}
      {!loading && entries.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
          {entries.map((e) => (
            <li key={e.id} style={{ borderLeft: "2px solid var(--line)", paddingLeft: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                <StatusBadge status={e.status} />
                {e.category && <span className="badge badge-neutral">{CATEGORY_LABEL[e.category] ?? e.category}</span>}
                <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              {e.note && <p style={{ fontSize: "13.5px", margin: "4px 0" }}>{e.note}</p>}
              <div style={{ fontSize: "12px", color: "var(--slate)" }}>Reviewed by {e.reviewedBy}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
