// Every reason a member can land in the attention queue, derived purely
// from get_admin_members_evaluation()'s real columns -- no invented "at
// risk" scoring. Shared between AttentionQueue.jsx (top of the page) and
// MembersList.jsx's "Needs Attention" filter, so both agree on who's
// flagged and why.
const DAY_MS = 86400000;

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

export function attentionReasonsFor(m) {
  const reasons = [];

  if (m.status === "active") {
    // daily_reports rows are filed lazily -- an admin has to open the
    // Reports queue for finalize_missing_daily_reports() to backfill
    // yesterday's (0124), so "nothing filed today yet" is expected, not a
    // signal. Two-plus days with nothing on record is the real one.
    const gap = m.lastReportDate ? daysSince(`${m.lastReportDate}T00:00:00Z`) : null;
    if (gap === null || gap >= 2) {
      reasons.push({
        key: "no_report",
        icon: "clipboard",
        label: gap === null ? "No daily report on record" : `No daily report in ${gap}d`,
      });
    }

    const inactiveDays = daysSince(m.lastActiveAt);
    if (inactiveDays !== null && inactiveDays >= 7) {
      reasons.push({ key: "inactive", icon: "clock", label: `Inactive ${inactiveDays}d` });
    }
  }

  if (m.flaggedReportsCount > 0) {
    reasons.push({
      key: "flagged_reports",
      icon: "ban",
      label: `${m.flaggedReportsCount} report${m.flaggedReportsCount === 1 ? "" : "s"} flagged for attention`,
    });
  }

  if (m.hasPendingRankAdvancement) {
    reasons.push({ key: "rank_advancement", icon: "trophy", label: "Rank advancement pending review" });
  }

  if (m.lastEvaluationStatus === "needs_attention" || m.lastEvaluationStatus === "at_risk") {
    reasons.push({
      key: "last_evaluation",
      icon: "eye",
      label: `Marked ${m.lastEvaluationStatus === "at_risk" ? "At Risk" : "Needs Attention"} at last evaluation`,
    });
  }

  return reasons;
}

export function needsAttention(m) {
  return attentionReasonsFor(m).length > 0;
}

export function recentlyEvaluated(m, withinDays = 7) {
  const days = daysSince(m.lastEvaluationAt);
  return days !== null && days <= withinDays;
}

export function relativeDays(iso) {
  const days = daysSince(iso);
  if (days === null) return null;
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}
