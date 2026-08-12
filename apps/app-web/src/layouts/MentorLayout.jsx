import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [
      { to: "/mentor", label: "My Members", icon: "users", end: true },
      { to: "/mentor/reviews", label: "Review Queue", icon: "folder" },
    ],
  },
];

const bottomItems = [
  { to: "/mentor", label: "Members", icon: "users", end: true },
  { to: "/mentor/reviews", label: "Reviews", icon: "folder" },
];

export default function MentorLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Mentor" />;
}
