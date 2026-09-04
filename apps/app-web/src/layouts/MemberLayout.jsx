import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: "home", end: true }],
  },
  {
    // Assignments (content_assignments' generic-course-assignment sibling,
    // /assignments) isn't listed here -- barely used (1 row in the live
    // catalog) and its real per-member due tasks already show up on
    // /tasks via get_my_content_assignments, same as before. The route
    // itself is untouched, just not surfaced as its own nav item.
    label: "My Work",
    items: [
      { to: "/tasks", label: "Tasks", icon: "check-square" },
      { to: "/goals", label: "My Goals", icon: "target" },
      { to: "/reports", label: "Reports", icon: "clipboard" },
    ],
  },
  {
    // Learning Hub retired as its own nav item -- Training now dominates:
    // its real Freelancing courses and Personal Development library
    // migrated in (0128 + the pd_resources migration script), progress
    // preserved. /learning itself redirects to /training (App.jsx). Mind
    // Training is real, substantial, untouched content that doesn't fit
    // Training's shape (see 0128's migration notes) -- kept directly
    // reachable here instead of disappearing.
    label: "Learn",
    items: [
      { to: "/training", label: "Training", icon: "layers" },
      { to: "/learning/mind-training", label: "Mind Training", icon: "brain" },
    ],
  },
  {
    label: "Build",
    items: [
      { to: "/network", label: "My Network", icon: "network", end: true },
      { to: "/rank-journey", label: "Rank Journey", icon: "compass" },
      { to: "/leaderboard", label: "Leaderboard", icon: "trophy" },
      { to: "/wallet", label: "Wallet", icon: "dollar-sign" },
    ],
  },
];
// Business Path used to be its own item here, above Learning Hub -- merged
// into Rank Journey instead (0104): the real rank ladder and Business
// Path's six stages turned out to be the same progression under two
// names, so its milestones now show inside a rank's own requirements
// there rather than on a second, near-identical page.
// Settings (Notifications/Profile) dropped as its own sidebar group --
// both are already one click away from every page via the topbar
// (NotificationBell's bell icon, and the avatar/name link to /profile,
// see AppShell.jsx), so a dedicated sidebar section for them was pure
// duplication. Routes are untouched, just not surfaced here too.

const bottomItems = [
  { to: "/dashboard", label: "Home", icon: "home", end: true },
  { to: "/training", label: "Training", icon: "layers" },
  { to: "/tasks", label: "Tasks", icon: "check-square" },
  { to: "/network", label: "Network", icon: "network" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export default function MemberLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Synergy" />;
}
