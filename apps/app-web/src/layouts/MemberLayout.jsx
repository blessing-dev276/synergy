import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: "home", end: true }],
  },
  {
    items: [{ to: "/learning", label: "My Learning", icon: "book" }],
  },
  {
    items: [
      { to: "/assignments", label: "Assignments", icon: "clipboard" },
      { to: "/tasks", label: "Tasks", icon: "check-square" },
    ],
  },
  {
    items: [
      { to: "/network", label: "My Network", icon: "network", end: true },
      { to: "/network/prospects", label: "Prospects", icon: "network" },
    ],
  },
  {
    items: [{ to: "/goals", label: "Monthly Goals", icon: "target" }],
  },
  {
    items: [{ to: "/leaderboard", label: "Leaderboard", icon: "trophy" }],
  },
  {
    items: [{ to: "/wallet", label: "Wallet", icon: "dollar-sign" }],
  },
  {
    items: [{ to: "/profile", label: "Profile", icon: "user" }],
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
