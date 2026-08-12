import AppShell from "../components/AppShell.jsx";

const sections = [
  {
    items: [
      { to: "/mentor", label: "My Members", icon: "👥", end: true },
      { to: "/mentor/reviews", label: "Review Queue", icon: "🗂️" },
    ],
  },
];

const bottomItems = [
  { to: "/mentor", label: "Members", icon: "👥", end: true },
  { to: "/mentor/reviews", label: "Reviews", icon: "🗂️" },
];

export default function MentorLayout() {
  return <AppShell sections={sections} bottomItems={bottomItems} title="Mentor" />;
}
