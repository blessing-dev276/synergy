// Where an auto-tracked rank task (proxy_type <> 'manual', 0065/0078)
// actually gets worked on -- there's no submit button for these (the
// system approves them itself once real progress qualifies), so a member
// needs a way to get from the task to the content it's tracking. Shared
// between TaskList.jsx's "/tasks" page and Dashboard.jsx's Today's Tasks
// card rather than duplicated, so a new proxy type only needs updating
// here once.
export function rankTaskActionLink(proxyType, proxyPathId) {
  switch (proxyType) {
    case "path_complete":
    case "modules_count":
      return proxyPathId ? { to: `/learning/${proxyPathId}`, label: "Continue" } : null;
    case "mind_training_path_complete":
    case "mind_training_modules_count":
      return proxyPathId ? { to: `/learning/mind-training/${proxyPathId}`, label: "Continue" } : null;
    case "prospects_count":
    case "referral_count":
      // Prospects lives as a section of My Network now, not its own page
      // (consolidated per the My Network rebuild) -- same route either way.
      // Referrals (personally-sponsored count, 0093) are also grown from
      // that same page.
      return { to: "/network", label: proxyType === "referral_count" ? "Grow your network" : "Add prospects" };
    case "profile_completion_percent":
      return { to: "/profile", label: "Finish your profile" };
    case "earnings_amount":
      return { to: "/wallet", label: "View wallet" };
    case "goals_submitted":
      return { to: "/goals", label: "Set your goals" };
    default:
      return null;
  }
}
