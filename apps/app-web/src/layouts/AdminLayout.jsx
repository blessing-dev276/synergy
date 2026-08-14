import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
  },
  {
    items: [{ to: "/admin/content", label: "Learning Hub", icon: "layers", end: true }],
  },
  {
    label: "People",
    items: [
      { to: "/admin/members", label: "Members", icon: "users" },
      { to: "/admin/reviews", label: "Review Queue", icon: "folder" },
      { to: "/admin/goals", label: "Goal Reviews", icon: "target" },
      { to: "/admin/orientation", label: "Orientation Builder", icon: "clock" },
    ],
  },
  {
    label: "Network",
    items: [
      { to: "/admin/network", label: "Overview", icon: "network", end: true },
      { to: "/admin/network/prospecting", label: "Prospecting", icon: "network" },
      { to: "/admin/network/requests", label: "Sponsor Requests", icon: "folder" },
      { to: "/admin/network/legacy-mentors", label: "Legacy Mentors", icon: "users" },
    ],
  },
  {
    label: "Leaderboard",
    items: [{ to: "/admin/earnings", label: "Earnings Review", icon: "dollar-sign" }],
  },
  {
    label: "Audit",
    items: [{ to: "/admin/activity", label: "Activity Log", icon: "activity" }],
  },
];

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "bar-chart", end: true },
  { to: "/admin/content", label: "Learning Hub", icon: "layers" },
  { to: "/admin/members", label: "People", icon: "users" },
  { to: "/admin/network", label: "Network", icon: "network" },
];

export default function AdminLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
