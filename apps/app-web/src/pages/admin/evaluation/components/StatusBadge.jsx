import { evaluationStatusFor } from "../../../../lib/evaluationStatus.js";

// Shared 🟢🟡🔴⚪ chip -- every evaluation status surface (member cards, the
// attention queue, the workspace header, history entries) renders it the
// same way, so a glance at any of them reads consistently.
export default function StatusBadge({ status, style }) {
  const meta = evaluationStatusFor(status);
  return (
    <span className={`badge badge-${meta.tone}`} style={style}>
      {meta.emoji} {meta.label}
    </span>
  );
}
