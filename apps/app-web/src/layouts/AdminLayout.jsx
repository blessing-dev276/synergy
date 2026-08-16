import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
  },
  {
    items: [{ to: "/admin/content", label: "Learning Hub", icon: "layers", end: true }],
  },
  {
    items: [{ to: "/admin/business-path", label: "Business Path", icon: "compass", end: true }],
  },
  {
    items: [{ to: "/admin/submissions", label: "Submissions", icon: "check-square", end: true }],
  },
  {
    items: [{ to: "/admin/network", label: "Network", icon: "network", end: true }],
  },
  {
    items: [{ to: "/admin/settings/team", label: "Team", icon: "users", end: true }],
  },
  {
    items: [{ to: "/admin/leaderboard", label: "Leaderboard", icon: "dollar-sign", end: true }],
  },
  {
    label: "Settings",
    items: [
      { to: "/admin/settings/activity", label: "Activity Log", icon: "activity" },
      { to: "/admin/settings/general", label: "General", icon: "briefcase" },
      { to: "/admin/settings/notifications", label: "Notifications", icon: "bell" },
    ],
  },
];

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "bar-chart", end: true },
  { to: "/admin/content", label: "Learning Hub", icon: "layers" },
  { to: "/admin/network", label: "Network", icon: "network" },
];

export default function AdminLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
