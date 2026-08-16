import { supabase } from "../supabaseClient.js";

// One place for every server-authoritative action (see supabase/migrations/
// 0003_functions.sql for the matching Postgres function and why each of
// these isn't a direct table write). Each throws on error so callers can
// catch/report it, and resolves with the RPC's return value on success.
async function call(fnName, args) {
  const { data, error } = await supabase.rpc(fnName, args);
  if (error) throw error;
  return data;
}

export const setUserRole = (targetUid, newRole) =>
  call("set_user_role", { target_uid: targetUid, new_role: newRole });

export const searchSponsors = (query) => call("search_sponsors", { p_query: query });

export const getMySponsor = () => call("get_my_sponsor", {});

export const assignSponsor = (memberUid, sponsorUid) =>
  call("assign_sponsor", { p_member_uid: memberUid, p_sponsor_uid: sponsorUid });

export const resolveSponsorRequest = (requestId, sponsorUid, note) =>
  call("resolve_sponsor_request", { p_request_id: requestId, p_sponsor_uid: sponsorUid, p_note: note });

export const rejectSponsorRequest = (requestId, note) =>
  call("reject_sponsor_request", { p_request_id: requestId, p_note: note });

export const getPersonallySponsored = (uid) => call("get_personally_sponsored", { p_uid: uid });

export const getNetwork = (uid) => call("get_network", { p_uid: uid });

export const getNetworkOverview = (uid) => call("get_network_overview", { p_uid: uid });

export const markLessonComplete = (courseId, moduleId, lessonId) =>
  call("mark_lesson_complete", { p_course_id: courseId, p_module_id: moduleId, p_lesson_id: lessonId });

export const getQuizForAttempt = (lessonId) => call("get_quiz_for_attempt", { p_lesson_id: lessonId });

export const submitQuizAttempt = (quizId, answers) =>
  call("submit_quiz_attempt", { p_quiz_id: quizId, p_answers: answers });

export const gradeAssignment = (submissionId, decision, grade, feedback) =>
  call("grade_assignment", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_grade: grade,
    p_feedback: feedback,
  });

export const completeContentAssignment = (contentAssignmentId) =>
  call("complete_content_assignment", { p_content_assignment_id: contentAssignmentId });

export const getMyContentAssignments = (uid) => call("get_my_content_assignments", { p_uid: uid });

export const getLearningPaths = () => call("get_learning_paths", {});

export const setMemberStatus = (uid, status) => call("set_member_status", { p_uid: uid, p_status: status });

export const getOrientationContent = () => call("get_orientation_content", {});

export const submitOrientation = (answers) => call("submit_orientation", { p_answers: answers });

export const logEarning = (amount, note) => call("log_earning", { p_amount: amount, p_note: note });

export const reviewEarning = (id, decision, note) =>
  call("review_earning", { p_id: id, p_decision: decision, p_note: note });

export const adminLogEarning = (uid, amount, note) =>
  call("admin_log_earning", { p_uid: uid, p_amount: amount, p_note: note });

export const getLeaderboards = () => call("get_leaderboards", {});

export const submitContentEvidence = (contentAssignmentId, textResponse, fileUrls) =>
  call("submit_content_evidence", { p_content_assignment_id: contentAssignmentId, p_text_response: textResponse, p_file_urls: fileUrls });

export const reviewContentEvidence = (submissionId, decision, feedback) =>
  call("review_content_evidence", { p_submission_id: submissionId, p_decision: decision, p_feedback: feedback });

// ---------- ranks (Business Path v2 — free-form ranks + attached Learning Hub paths) ----------
export const adminListRanks = () => call("admin_list_ranks", {});

export const adminCreateRank = (title) => call("admin_create_rank", { p_title: title });

export const adminUpdateRank = (id, title, orderIndex) =>
  call("admin_update_rank", { p_id: id, p_title: title, p_order_index: orderIndex });

export const adminDeleteRank = (id) => call("admin_delete_rank", { p_id: id });

export const adminSetRankLearningPaths = (rankId, learningPathIds) =>
  call("admin_set_rank_learning_paths", { p_rank_id: rankId, p_learning_path_ids: learningPathIds });

export const adminSetMemberRank = (uid, rankId) =>
  call("admin_set_member_rank", { p_uid: uid, p_rank_id: rankId });

export const adminGetMembersByRank = () => call("admin_get_members_by_rank", {});

// ---------- rank tasks (checkbox-complete or auto-tracked, per rank) ----------
// proxy: { type: 'manual' | 'modules_count' | 'path_complete', pathId, threshold }
export const adminCreateRankTask = (rankId, title, description, recurrence, proxy) =>
  call("admin_create_rank_task", {
    p_rank_id: rankId,
    p_title: title,
    p_description: description,
    p_recurrence: recurrence,
    p_proxy_type: proxy?.type ?? "manual",
    p_proxy_path_id: proxy?.pathId ?? null,
    p_proxy_threshold: proxy?.threshold ?? null,
  });

export const adminUpdateRankTask = (id, title, description, recurrence, orderIndex, proxy) =>
  call("admin_update_rank_task", {
    p_id: id,
    p_title: title,
    p_description: description,
    p_recurrence: recurrence,
    p_order_index: orderIndex,
    p_proxy_type: proxy?.type ?? "manual",
    p_proxy_path_id: proxy?.pathId ?? null,
    p_proxy_threshold: proxy?.threshold ?? null,
  });

export const adminDeleteRankTask = (id) => call("admin_delete_rank_task", { p_id: id });

export const submitRankTask = (rankTaskId) => call("submit_rank_task", { p_rank_task_id: rankTaskId });

export const reviewRankTaskSubmission = (submissionId, decision, note) =>
  call("review_rank_task_submission", { p_submission_id: submissionId, p_decision: decision, p_note: note });

// ---------- participation path ----------
export const requestParticipationPath = (requestedPath, reason) =>
  call("request_participation_path", { p_requested_path: requestedPath, p_reason: reason });

export const adminSetParticipationPath = (uid, path) =>
  call("admin_set_participation_path", { p_uid: uid, p_path: path });

export const reviewParticipationPathRequest = (requestId, decision, note) =>
  call("review_participation_path_request", { p_request_id: requestId, p_decision: decision, p_note: note });

// ---------- monthly goals ----------
export const saveMyGoals = (period, goals) => call("save_my_goals", { p_period: period, p_goals: goals });

export const submitMyGoals = (period) => call("submit_my_goals", { p_period: period });

export const updateGoalProgress = (period, category, index, progress, done) =>
  call("update_goal_progress", { p_period: period, p_category: category, p_index: index, p_progress: progress, p_done: done });

export const reviewMemberGoals = (uid, period, decision, comment) =>
  call("review_member_goals", { p_uid: uid, p_period: period, p_decision: decision, p_comment: comment });

export const getAdminGoalOverview = (period) => call("get_admin_goal_overview", { p_period: period });

// ---------- prospecting / follow-up CRM ----------
export const addProspect = (name, phone, whatsapp, source, notes) =>
  call("add_prospect", { p_name: name, p_phone: phone, p_whatsapp: whatsapp, p_source: source, p_notes: notes });

export const updateProspect = (id, name, phone, whatsapp, source, notes, nextFollowUpAt) =>
  call("update_prospect", {
    p_id: id,
    p_name: name,
    p_phone: phone,
    p_whatsapp: whatsapp,
    p_source: source,
    p_notes: notes,
    p_next_follow_up_at: nextFollowUpAt,
  });

export const setProspectStatus = (id, status, nextFollowUpAt, note) =>
  call("set_prospect_status", { p_id: id, p_status: status, p_next_follow_up_at: nextFollowUpAt, p_note: note });

export const logProspectActivity = (prospectId, activityType, note, nextFollowUpAt) =>
  call("log_prospect_activity", {
    p_prospect_id: prospectId,
    p_activity_type: activityType,
    p_note: note,
    p_next_follow_up_at: nextFollowUpAt,
  });

export const getAdminProspectingOverview = () => call("get_admin_prospecting_overview", {});
