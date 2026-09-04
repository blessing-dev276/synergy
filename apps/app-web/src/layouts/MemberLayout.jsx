import AppShell from "../components/AppShell.jsx";
import { useMemberRank } from "../lib/useMemberRank.js";

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

export default function MemberLayout() {
  // Onboarding (renamed from Training) is for PROSPECT-rank members only;
  // everyone promoted past it sees the classic Learning Hub instead (see
  // App.jsx's RankGate for the matching route split). Grouped with
  // Dashboard under Overview, not under Learn -- it's the whole point of
  // entry for a prospect, not one learning resource among others.
  const { isProspect } = useMemberRank();
  const learnItem = isProspect
    ? { to: "/training", label: "Onboarding", icon: "layers" }
    : { to: "/learning", label: "Learning Hub", icon: "book" };

  const sections = [
    {
      label: "Overview",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: "home", end: true },
        ...(isProspect ? [learnItem] : []),
      ],
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
    // Mind Training isn't its own nav item any more -- it's a tab inside
    // Learning Hub (ContentBuilder.jsx mirrors this on the admin side:
    // Business Basics/Freelancing/Mind Training/Personal Development all
    // live as tabs on one page, not separate top-level entries). Route
    // (/learning/mind-training) stays reachable from inside that page.
    // Section only exists for non-prospects, who see Learning Hub here
    // instead of in Overview.
    ...(isProspect ? [] : [{ label: "Learn", items: [learnItem] }]),
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

  const bottomItems = [
    { to: "/dashboard", label: "Home", icon: "home", end: true },
    { ...learnItem, label: isProspect ? "Onboarding" : "Learning" },
    { to: "/tasks", label: "Tasks", icon: "check-square" },
    { to: "/network", label: "Network", icon: "network" },
    { to: "/profile", label: "Profile", icon: "user" },
  ];

  return <AppShell sections={sections} bottomItems={bottomItems} title="Synergy" />;
}
