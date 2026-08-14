// Central definition of "is this member's profile fully set up" — reused by
// Profile.jsx (checklist) and Dashboard.jsx (nudge card). Deliberately
// decoupled from onboarding.completed/OnboardingGate.jsx: that gate only
// covers the signup-blocking bio+interests step, while this covers things
// members fill in afterward (why's, goals) that shouldn't block first use
// of the app. More items are expected to land here over time.
export function computeProfileHealth({ profile, whysCount, goals }) {
  const items = [
    { key: "basics", label: "Add your bio & interests", done: Boolean(profile?.onboarding?.completed) },
    { key: "whys", label: "Add at least one Why for joining", done: (whysCount ?? 0) > 0 },
    {
      key: "goals",
      label: "Set this month's goals",
      done: Boolean(goals?.monthly_income_goal && goals?.team_size_goal && goals?.target_rank_id),
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return {
    items,
    complete: doneCount === items.length,
    percent: Math.round((doneCount / items.length) * 100),
  };
}
