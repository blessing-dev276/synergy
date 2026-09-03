import { supabase } from "../supabaseClient.js";
import { useSupabaseQuery } from "./useSupabaseQuery.js";
import { rankTaskActionLink } from "./rankTaskLinks.js";

// Shared between Dashboard.jsx's Today's Work preview card and the full
// /tasks page (TaskList.jsx) -- previously duplicated (each had its own
// copy), which is exactly the kind of drift this session has run into
// before elsewhere. One hook, one definition of "done", "overdue" and
// "category" for both.
//
// Merges the two task sources a member actually has (Business Path v2 --
// see supabase/migrations/0058_business_path_v2_drop_v1.sql -- dropped
// everything else): content_assignments due today/overdue
// (get_my_content_assignments) and this rank's daily/outstanding
// rank_tasks (get_my_rank_tasks). "done" means the same thing on both:
// isDone for an assignment, a non-rejected submission for a rank task.
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Real category, not invented: an assignment is always Learning Hub
// coursework (content_assignments has no other kind). A rank task's
// category comes from whichever learning_paths.section its proxy_path_id
// actually points at (proxyPathSection, 0094) when it has one; proxy
// types with no path but an inherent business meaning (prospecting,
// referrals, earnings) go to Network Marketing; the rest fall back to a
// title keyword match, and only truly unmatched manual tasks land in the
// generic "General" bucket -- never silently mislabeled as something
// they're not.
const SECTION_CATEGORY = {
  nm_business: "Network Marketing",
  skill_set: "Freelancing",
  mind_training: "Personal Development",
};
const PROXY_TYPE_CATEGORY = {
  prospects_count: "Network Marketing",
  referral_count: "Network Marketing",
  earnings_amount: "Network Marketing",
  profile_completion_percent: "Personal Development",
  goals_submitted: "Personal Development",
};
// Ordered most-specific-subject first, generic "training/course/module"
// words last -- a title like "Complete 1 Network Marketing Business
// Training Learning Path" contains both "Network Marketing" (specific,
// correct) and "Training" (generic, would wrongly win if checked first).
// Real titles from the live rank_tasks catalog drove this list (Business
// Explanation, Network Varsity, Skill Set, Digital Skill, Mind Training),
// not guesswork -- update it if a genuinely new naming pattern shows up.
const TITLE_KEYWORD_CATEGORY = [
  [/network marketing|network varsity|business explanation|prospect|follow[\s-]?up|customer|business activity/i, "Network Marketing"],
  [/skill set|digital skill|portfolio|fiverr|upwork|freelanc|proposal|client/i, "Freelancing"],
  [/mind training|mindset|reflect|personal development|journal|self-awareness/i, "Personal Development"],
  [/team|sponsor|mentor/i, "Team"],
  [/lesson|course|module|training|learn/i, "Learning"],
];

// Exported for Rank Journey (0100), which needs the same real category
// inference for a rank's tasks -- one definition, not a second copy.
export function categorizeRankTask(t) {
  if (t.proxyPathSection && SECTION_CATEGORY[t.proxyPathSection]) return SECTION_CATEGORY[t.proxyPathSection];
  if (PROXY_TYPE_CATEGORY[t.proxyType]) return PROXY_TYPE_CATEGORY[t.proxyType];
  const match = TITLE_KEYWORD_CATEGORY.find(([re]) => re.test(t.title));
  if (match) return match[1];
  return "General";
}

export function useTodayTasks(uid) {
  const assignmentsQ = useSupabaseQuery(
    () => uid && supabase.rpc("get_my_content_assignments", { p_uid: uid }),
    [uid],
  );
  const rankTasksQ = useSupabaseQuery(() => supabase.rpc("get_my_rank_tasks", {}), []);

  const today = todayISO();

  const assignmentItems = (assignmentsQ.data ?? [])
    .filter((t) => t.dueDate && t.dueDate <= today)
    .map((t) => ({
      kind: "assignment",
      id: t.id,
      title: t.title,
      description: t.description,
      category: "Learning",
      overdue: t.dueDate < today,
      dueDate: t.dueDate,
      done: t.isDone,
      actionable: t.contentType === "bare" && !t.requiresAdminApproval,
      needsEvidence: t.contentType === "bare" && t.requiresAdminApproval,
      evidenceStatus: t.evidenceStatus,
    }));

  const rankItems = (rankTasksQ.data ?? []).map((t) => ({
    kind: "rank",
    id: t.id,
    title: t.title,
    description: t.description,
    category: categorizeRankTask(t),
    daily: t.recurrence === "daily",
    done: Boolean(t.submission) && t.submission.status !== "rejected",
    pending: t.submission?.status === "pending",
    manual: t.proxyType === "manual",
    actionLink: rankTaskActionLink(t.proxyType, t.proxyPathId),
    progress: t.progress,
    proxyThreshold: t.proxyThreshold,
  }));

  // Overdue and not-done first (most urgent), done items sink to the
  // bottom -- same "unfinished work first" ordering as any todo list.
  const items = [...assignmentItems, ...rankItems].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (Boolean(a.overdue) !== Boolean(b.overdue)) return a.overdue ? -1 : 1;
    return 0;
  });

  return {
    loading: assignmentsQ.loading || rankTasksQ.loading,
    error: assignmentsQ.error || rankTasksQ.error,
    items,
    doneCount: items.filter((i) => i.done).length,
    total: items.length,
    // Split by source, not just overall -- Daily Report's "tasks
    // completed"/"activities completed" fields (submit_daily_report,
    // 0094) snapshot these two real counts, not the merged total.
    tasksTotal: assignmentItems.length,
    tasksDone: assignmentItems.filter((i) => i.done).length,
    activitiesTotal: rankItems.length,
    activitiesDone: rankItems.filter((i) => i.done).length,
    refetch: () => {
      assignmentsQ.refetch();
      rankTasksQ.refetch();
    },
  };
}
