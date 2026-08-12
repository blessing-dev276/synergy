import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/admin", label: "Overview", icon: "📊", end: true }],
  },
  {
    label: "Learning",
    items: [{ to: "/admin/content", label: "Content Builder", icon: "🧱" }],
  },
  {
    label: "People",
    items: [{ to: "/admin/members", label: "Members & Mentors", icon: "👥" }],
  },
];

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "📊", end: true },
  { to: "/admin/content", label: "Content", icon: "🧱" },
  { to: "/admin/members", label: "People", icon: "👥" },
];

export default function AdminLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
