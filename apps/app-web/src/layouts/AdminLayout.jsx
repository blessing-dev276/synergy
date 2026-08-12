import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
  },
  {
    label: "Journey",
    items: [
      { to: "/admin/journey", label: "Stage Builder", icon: "compass" },
      { to: "/admin/content", label: "Content Builder", icon: "layers" },
    ],
  },
  {
    label: "People",
    items: [{ to: "/admin/members", label: "Members & Mentors", icon: "users" }],
  },
];

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "bar-chart", end: true },
  { to: "/admin/journey", label: "Journey", icon: "compass" },
  { to: "/admin/members", label: "People", icon: "users" },
];

export default function AdminLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
