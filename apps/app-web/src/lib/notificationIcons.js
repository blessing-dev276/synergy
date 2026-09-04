// One emoji per notification `type`, so the bell dropdown and the full
// /notifications page read consistently at a glance instead of relying on
// whatever's baked into each row's title text (some have an emoji in the
// title already, most don't -- inconsistent by history, not by design).
// Grouped by the same categories requested for admin notifications:
//   submitted/needs-a-decision -> 📝, new member -> 👤, sponsor/referral -> 👥,
//   member needs attention -> 🚩, announcements -> 📢, reviewed/resolved -> ✅,
//   rank/wallet events -> 🏆/💰. Anything not listed falls back to 🔔 rather
//   than guessing -- that catch-all also covers the "system/admin action"
//   bucket for whichever review type isn't explicitly one of the others.
const NOTIFICATION_ICON = {
  // ---------- needs an admin decision ----------
  content_evidence_submitted: "📝",
  daily_report_submitted: "📝",
  rank_task_submitted: "📝",
  rank_advancement_requested: "📝",
  withdrawal_requested: "📝",
  earning_submitted: "📝",
  stage_promotion_requested: "📝",

  // ---------- new member / sponsor ----------
  new_member_registered: "👤",
  sponsor_request_needs_review: "👥",

  // ---------- needs attention ----------
  member_left_office: "🚩",
  daily_reports_auto_generated: "🚩",

  // ---------- announcements ----------
  announcement_published: "📢",

  // ---------- decisions/results already made ----------
  content_evidence_reviewed: "✅",
  rank_task_reviewed: "✅",
  rank_advancement_rejected: "✅",
  rank_advancement_reviewed: "✅",
  withdrawal_reviewed: "💰",
  earning_reviewed: "💰",
  official_rank_set: "🏆",
  rank_changed: "🏆",
};

export function notificationIcon(type) {
  return NOTIFICATION_ICON[type] ?? "🔔";
}
