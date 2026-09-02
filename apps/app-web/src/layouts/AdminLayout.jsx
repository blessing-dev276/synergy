import AppShell from "../components/AppShell.jsx";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import { supabase } from "../supabaseClient.js";

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "bar-chart", end: true },
  { to: "/admin/content", label: "Learning Hub", icon: "layers" },
  { to: "/admin/network", label: "Network", icon: "network" },
];

export default function AdminLayout() {
  // Red badge on "Submissions" when anything's waiting on a decision --
  // same pending count Submissions.jsx's own sections already sum up
  // (admin_count_pending_submissions, 0088), just surfaced one level
  // higher so an admin doesn't have to click in to find out.
  const { data: pendingCount } = useSupabaseQuery(() => supabase.rpc("admin_count_pending_submissions", {}), []);

  const sections = [
    {
      items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
    },
    {
      // Business Basics, Skill Set, Mind Training and Personal Development
      // all live as tabs inside this one page now (ContentBuilder.jsx) --
      // no separate top-level entry for Mind Training/Personal Development
      // any more.
      items: [{ to: "/admin/content", label: "Learning Hub", icon: "layers", end: true }],
    },
    {
      items: [{ to: "/admin/business-path", label: "Business Path", icon: "compass", end: true }],
    },
    {
      items: [{ to: "/admin/submissions", label: "Submissions", icon: "check-square", end: true, badge: pendingCount || 0 }],
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

  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
