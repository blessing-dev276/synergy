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
    label: "Learn",
    items: [{ to: "/learning", label: "Learning Hub", icon: "book" }],
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
// Settings (Notifications/Profile) dropped as its own sidebar group --
// both are already one click away from every page via the topbar
// (NotificationBell's bell icon, and the avatar/name link to /profile,
// see AppShell.jsx), so a dedicated sidebar section for them was pure
// duplication. Routes are untouched, just not surfaced here too.

const bottomItems = [
  { to: "/dashboard", label: "Home", icon: "home", end: true },
  { to: "/learning", label: "Learning", icon: "book" },
  { to: "/tasks", label: "Tasks", icon: "check-square" },
  { to: "/network", label: "Network", icon: "network" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export default function MemberLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Synergy" />;
}
