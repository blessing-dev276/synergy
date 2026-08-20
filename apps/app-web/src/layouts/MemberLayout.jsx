import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: "home", end: true }],
  },
  {
    label: "Learning",
    items: [{ to: "/learning", label: "My Learning", icon: "book" }],
  },
  {
    label: "Activities",
    items: [
      { to: "/assignments", label: "Assignments", icon: "clipboard" },
      { to: "/tasks", label: "Tasks", icon: "check-square" },
    ],
  },
  {
    label: "Network",
    items: [
      { to: "/network", label: "My Network", icon: "network", end: true },
      { to: "/network/prospects", label: "Prospects", icon: "network" },
    ],
  },
  {
    label: "Goals",
    items: [{ to: "/goals", label: "Monthly Goals", icon: "target" }],
  },
  {
    label: "Leaderboard",
    items: [{ to: "/leaderboard", label: "Leaderboard", icon: "trophy" }],
  },
  {
    label: "Wallet",
    items: [{ to: "/wallet", label: "Wallet", icon: "dollar-sign" }],
  },
  {
    label: "Account",
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
