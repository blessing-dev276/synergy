// Evaluation Center (0128) -- an admin's own overall assessment of a
// member, separate from any report/task/rank status the member's own
// activity already drives. 'not_evaluated' isn't a real DB value (the
// column only allows the three below) -- it's the fallback this module's
// consumers use whenever a member has no evaluation row yet, so "no
// opinion formed" is never confused with "doing fine."
export const EVALUATION_STATUSES = [
  { key: "on_track", label: "On Track", emoji: "🟢", tone: "success" },
  { key: "needs_attention", label: "Needs Attention", emoji: "🟡", tone: "warning" },
  { key: "at_risk", label: "At Risk", emoji: "🔴", tone: "danger" },
];

export const NOT_EVALUATED = { key: "not_evaluated", label: "Not Evaluated", emoji: "⚪", tone: "neutral" };

export const EVALUATION_STATUS_BY_KEY = Object.fromEntries([...EVALUATION_STATUSES, NOT_EVALUATED].map((s) => [s.key, s]));

export function evaluationStatusFor(key) {
  return EVALUATION_STATUS_BY_KEY[key] ?? NOT_EVALUATED;
}

// tasks|learning|network|freelancing|personal_development|rank|reports|team
// -- the member_evaluations.category check constraint, and the section ids
// this feeds (MemberEvaluation.jsx's sections/*).
export const EVALUATION_CATEGORIES = [
  { key: "tasks", label: "Work & Tasks" },
  { key: "learning", label: "Learning" },
  { key: "network", label: "Network Marketing" },
  { key: "freelancing", label: "Freelancing" },
  { key: "personal_development", label: "Personal Development" },
  { key: "rank", label: "Rank Journey" },
  { key: "reports", label: "Reports" },
  { key: "team", label: "Team" },
];
