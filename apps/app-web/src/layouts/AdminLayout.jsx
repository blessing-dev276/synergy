import AppShell from "../components/AppShell.jsx";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import { supabase } from "../supabaseClient.js";

const bottomItems = [
  { to: "/admin", label: "Overview", icon: "bar-chart", end: true },
  { to: "/admin/content", label: "Learning Hub", icon: "layers" },
  { to: "/admin/network", label: "Network", icon: "network" },
];

export default function AdminLayout() {
  // Red badge on "Evaluation" when a report is waiting on a decision --
  // same pending count Submissions.jsx's own sections already sum up
  // (admin_count_pending_submissions, 0088), just surfaced one level
  // higher so an admin doesn't have to click in to find out. Route/component
  // internally still called Submissions, now mounted at
  // /admin/evaluation/reports -- the Evaluation Center (0128) is the new
  // primary destination, reports are evidence inside it, not a separate
  // top-level concern any more.
  const { data: pendingCount } = useSupabaseQuery(() => supabase.rpc("admin_count_pending_submissions", {}), []);

  const sections = [
    {
      items: [{ to: "/admin", label: "Overview", icon: "bar-chart", end: true }],
    },
    {
      // Business Basics, Freelancing, Mind Training and Personal Development
      // all live as tabs inside this one page (ContentBuilder.jsx) -- real
      // and active again for every non-PROSPECT-rank member (App.jsx's
      // RankGate); Onboarding below is PROSPECT-only.
      items: [{ to: "/admin/content", label: "Learning Hub", icon: "layers", end: true }],
    },
    {
      items: [{ to: "/admin/business-path", label: "Business Path", icon: "compass", end: true }],
    },
    {
      // HQ360 restructure: a "Learning Center" grouping for Exams /
      // Assignments / Onboarding (LEARNING_CENTER_TRAINING_STRUCTURE.md §2,
      // "Training" renamed "Onboarding" for members -- see MemberLayout.jsx/
      // App.jsx's RankGate; route/component internally still called
      // Training, not renamed, same "label changes, internals don't"
      // convention Rank Journey/Business Path already used). Assignments
      // (the coursework review/approve manager) is still next-phase work --
      // lands here once built.
      label: "Learning Center",
      items: [
        { to: "/admin/exams", label: "Exams", icon: "check-square" },
        { to: "/admin/training", label: "Onboarding", icon: "layers", end: true },
      ],
    },
    {
      items: [{ to: "/admin/evaluation", label: "Evaluation", icon: "clipboard", end: true, badge: pendingCount || 0 }],
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
      // No group label -- unlike member's Settings (dropped entirely,
      // MemberLayout.jsx), these three have no topbar equivalent an admin
      // could reach them from instead, so the items stay; only the
      // "Settings" section header goes, matching every other section here
      // (all unlabeled already).
      items: [
        { to: "/admin/settings/activity", label: "Activity Log", icon: "activity" },
        { to: "/admin/settings/general", label: "General", icon: "briefcase" },
        { to: "/admin/settings/notifications", label: "Notifications", icon: "bell" },
      ],
    },
  ];

  return <AppShell sections={sections} bottomItems={bottomItems} title="Admin" />;
}
