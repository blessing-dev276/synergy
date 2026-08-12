import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: "🏠", end: true }],
  },
  {
    label: "Learning",
    items: [{ to: "/learning", label: "My Learning", icon: "📚" }],
  },
  {
    label: "Activities",
    items: [
      { to: "/assignments", label: "Assignments", icon: "📝" },
      { to: "/tasks", label: "Tasks", icon: "✅" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/notifications", label: "Notifications", icon: "🔔" },
      { to: "/profile", label: "Profile", icon: "👤" },
    ],
  },
];

const bottomItems = [
  { to: "/dashboard", label: "Home", icon: "🏠", end: true },
  { to: "/learning", label: "Learning", icon: "📚" },
  { to: "/assignments", label: "Tasks", icon: "✅" },
  { to: "/profile", label: "Profile", icon: "👤" },
];

export default function MemberLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Synergy" />;
}
