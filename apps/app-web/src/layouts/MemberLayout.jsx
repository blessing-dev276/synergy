import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: "home", end: true }],
  },
  {
    label: "My Work",
    items: [
      { to: "/tasks", label: "Today's Tasks", icon: "check-square" },
      { to: "/assignments", label: "Assignments", icon: "clipboard" },
      { to: "/goals", label: "Monthly Goals", icon: "target" },
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
      { to: "/leaderboard", label: "Leaderboard", icon: "trophy" },
      { to: "/wallet", label: "Wallet", icon: "dollar-sign" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/notifications", label: "Notifications", icon: "bell" },
      { to: "/profile", label: "Profile", icon: "user" },
    ],
  },
];

const bottomItems = [
  { to: "/dashboard", label: "Home", icon: "home", end: true },
  { to: "/learning", label: "Learning", icon: "book" },
  { to: "/assignments", label: "Tasks", icon: "check-square" },
  { to: "/network", label: "Network", icon: "network" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export default function MemberLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Synergy" />;
}
