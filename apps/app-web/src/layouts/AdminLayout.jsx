import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
  },
  {
    label: "Journey",
    items: [
      { to: "/admin/journey", label: "Stage Builder", icon: "compass" },
      { to: "/admin/journey/progression", label: "Progression", icon: "bar-chart" },
      { to: "/admin/journey/promotions", label: "Stage Promotions", icon: "trophy" },
      { to: "/admin/journey/milestones", label: "Milestones", icon: "award" },
      { to: "/admin/content", label: "Content Builder", icon: "layers" },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/admin/members", label: "Members", icon: "users" },
      { to: "/admin/reviews", label: "Review Queue", icon: "folder" },
      { to: "/admin/orientation", label: "Orientation Builder", icon: "clock" },
    ],
  },
  {
    label: "Network",
    items: [
      { to: "/admin/network", label: "Overview", icon: "network", end: true },
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
  { to: "/admin/journey", label: "Journey", icon: "compass" },
  { to: "/admin/members", label: "People", icon: "users" },
  { to: "/admin/network", label: "Network", icon: "network" },
];

export default function AdminLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
