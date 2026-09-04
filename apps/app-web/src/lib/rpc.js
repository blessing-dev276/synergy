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

// Standalone resources (video/book/podcast/link/pdf -- everything but
// resource_type='course', which uses markLessonComplete instead). Fired the
// moment a member opens one (PathDetail.jsx), self-attested like every
// other proxy/manual task -- not a watch-duration tracker.
export const markCourseResourceViewed = (courseId) => call("mark_course_resource_viewed", { p_course_id: courseId });

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

// get_rank_learning_paths/get_rank_milestones (Rank Journey, 0100/0104) --
// both reads, called directly via supabase.rpc(...) inside useSupabaseQuery
// wherever they're used (RankJourney.jsx), same convention as
// get_my_rank_tasks/get_leaderboards -- no wrapper here for either, on
// purpose: this file's call() unwraps straight to .data, which is the
// wrong shape for useSupabaseQuery (it awaits a query builder's own
// {data, error}) -- exactly the bug a wrapper here caused once already.

// The two milestone writes (self-checked ones only -- auto-tracked
// milestones have nothing to toggle).
export const completeBusinessPathMilestone = (milestoneId) =>
  call("complete_business_path_milestone", { p_milestone_id: milestoneId });

export const uncompleteBusinessPathMilestone = (milestoneId) =>
  call("uncomplete_business_path_milestone", { p_milestone_id: milestoneId });

// Freelancing's sequential skill lock (0095): a path's skillLock field on
// get_learning_paths' rows is 'unlocked' | 'locked' | 'choosable' (or null
// outside skill_set, where the lock concept doesn't apply) -- this is the
// only write side of it, called on a 'choosable' path to pick it as the
// next skill in the member's track.
export const chooseNextFreelancingSkill = (pathId) => call("choose_next_freelancing_skill", { p_path_id: pathId });

export const setMemberStatus = (uid, status) => call("set_member_status", { p_uid: uid, p_status: status });

// Self-service account closure (Profile.jsx) -- sets the caller's own
// status to 'removed' + left_at (0092), same status an admin removing a
// member already produces, reversible the same way (an admin setting them
// back to 'active').
export const leaveOffice = () => call("leave_office", {});

export const getOrientationContent = () => call("get_orientation_content", {});

export const submitOrientation = (answers) => call("submit_orientation", { p_answers: answers });

export const logEarning = (amount, note) => call("log_earning", { p_amount: amount, p_note: note });

export const reviewEarning = (id, decision, note) =>
  call("review_earning", { p_id: id, p_decision: decision, p_note: note });

export const adminLogEarning = (uid, amount, note) =>
  call("admin_log_earning", { p_uid: uid, p_amount: amount, p_note: note });

export const getLeaderboards = () => call("get_leaderboards", {});

// ---------- points-based leaderboard (0099) ----------
// get_leaderboard/get_weekly_highlights and leaderboard_point_rules' plain
// select are called directly via useSupabaseQuery (Leaderboard.jsx), same
// split this file already uses elsewhere for declarative reads -- only the
// one admin write needs a wrapper.
export const adminUpdatePointRule = (key, points, dailyCap) =>
  call("admin_update_point_rule", { p_key: key, p_points: points, p_daily_cap: dailyCap });

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

// "Status" (0103) -- fixed leadership titles, separate from the rank ladder
// above. p_status is one of DISTRIBUTOR_STATUSES' keys (distributorStatus.js)
// or null to clear it.
export const adminSetDistributorStatus = (uid, status) =>
  call("admin_set_distributor_status", { p_uid: uid, p_status: status });

export const adminGetMembersByRank = () => call("admin_get_members_by_rank", {});

// ---------- rank tasks (checkbox-complete or auto-tracked, per rank) ----------
// proxy: { type: 'manual' | 'modules_count' | 'path_complete' | 'prospects_count'
//   | 'mind_training_modules_count' | 'mind_training_path_complete', pathId, threshold }
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

// taskIds: every task in the rank, in the new order (drag-and-drop result) --
// admin_reorder_rank_tasks (0079) assigns order_index = position in the array.
export const adminReorderRankTasks = (rankId, taskIds) =>
  call("admin_reorder_rank_tasks", { p_rank_id: rankId, p_task_ids: taskIds });

export const submitRankTask = (rankTaskId) => call("submit_rank_task", { p_rank_task_id: rankTaskId });

export const reviewRankTaskSubmission = (submissionId, decision, note) =>
  call("review_rank_task_submission", { p_submission_id: submissionId, p_decision: decision, p_note: note });

// Daily Report (Tasks page, 0094) -- tasks/activities counts are the
// member's own real Today's Tasks totals at submit time (useTodayTasks.js),
// not re-typed by hand. One per member per day; resubmitting the same day
// upserts and reopens review.
export const submitDailyReport = (tasksCompleted, tasksTotal, activitiesCompleted, activitiesTotal, summary) =>
  call("submit_daily_report", {
    p_tasks_completed: tasksCompleted,
    p_tasks_total: tasksTotal,
    p_activities_completed: activitiesCompleted,
    p_activities_total: activitiesTotal,
    p_summary: summary,
  });

export const reviewDailyReport = (id, decision, note) =>
  call("review_daily_report", { p_id: id, p_decision: decision, p_note: note });

// Auto-filed the moment every learning path attached to a member's rank is
// 100% complete (evaluate_rank_advancement, 0082) -- no member-facing submit
// call, only the admin decision.
export const reviewRankAdvancementRequest = (requestId, decision, note) =>
  call("review_rank_advancement_request", { p_request_id: requestId, p_decision: decision, p_note: note });

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

// Weekly accountability check-in (goal_checkins, 0096) -- one per member
// per ISO week, no admin review; resubmitting the same week upserts.
export const saveWeeklyCheckin = (weekStart, whatsWorking, whatsSlowing, nextFocus) =>
  call("save_weekly_checkin", {
    p_week_start: weekStart,
    p_whats_working: whatsWorking,
    p_whats_slowing: whatsSlowing,
    p_next_focus: nextFocus,
  });

// Month-end reflection, stored directly on that period's monthly_goals row
// (0096) -- requires goals to already exist for the period.
export const saveMonthReview = (period, accomplished, missed, nextFocus) =>
  call("save_month_review", { p_period: period, p_accomplished: accomplished, p_missed: missed, p_next_focus: nextFocus });

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

// Links a prospect to the real member account it became -- only allowed
// when that member is already one of the caller's own directly-sponsored
// members (0098), so this can label an existing sponsor relationship, not
// create one.
export const linkProspectToMember = (prospectId, memberUid) =>
  call("link_prospect_to_member", { p_prospect_id: prospectId, p_member_uid: memberUid });

// ---------- Mind Training (independent from the Learning Hub's courses/modules/lessons) ----------
// get_my_mind_training_paths/get_my_mind_training_path are read via
// useSupabaseQuery + supabase.rpc(...) directly wherever they're used
// (same split this file already has for get_learning_paths -- a plain
// wrapper here for the declarative-loading-state call sites would just be
// dead code) -- only the imperative write/attempt calls need a wrapper.
export const markMindTrainingLessonComplete = (lessonId, response = null) =>
  call("mark_mind_training_lesson_complete", { p_lesson_id: lessonId, p_response: response });

export const markMindTrainingActivityComplete = (activityId, response = null) =>
  call("mark_mind_training_activity_complete", { p_activity_id: activityId, p_response: response });

export const getMindTrainingAssessmentForAttempt = (moduleId) =>
  call("get_mind_training_assessment_for_attempt", { p_module_id: moduleId });

export const submitMindTrainingAssessmentAttempt = (assessmentId, answers) =>
  call("submit_mind_training_assessment_attempt", { p_assessment_id: assessmentId, p_answers: answers });

// ---------- Personal Development ----------
export const adminSetResourceLearningPaths = (resourceId, learningPathIds) =>
  call("admin_set_resource_learning_paths", { p_resource_id: resourceId, p_learning_path_ids: learningPathIds });

export const adminSetResourceTags = (resourceId, tagIds) =>
  call("admin_set_resource_tags", { p_resource_id: resourceId, p_tag_ids: tagIds });

// ---------- member wallet (income/withdrawals/savings, 0084/0085) ----------
// Income itself is untouched earnings_logs (logEarning/reviewEarning/
// adminLogEarning above) -- these are the new withdrawal-request,
// savings, and rank-tier pieces built on top of it.
export const requestWithdrawal = (amount, currency, note) =>
  call("request_withdrawal", { p_amount: amount, p_currency: currency, p_note: note });

export const reviewWithdrawalRequest = (id, decision, netAmount, netCurrency, chargesAmount, exchangeRate, note) =>
  call("review_withdrawal_request", {
    p_id: id,
    p_decision: decision,
    p_net_amount: netAmount,
    p_net_currency: netCurrency,
    p_charges_amount: chargesAmount,
    p_exchange_rate: exchangeRate,
    p_note: note,
  });

export const logSavingsEntry = (amount, note) => call("log_savings_entry", { p_amount: amount, p_note: note });

// tiers: [{ minWithdrawnUsd, maxWithdrawnUsd, requestCapAmount, requestCapCurrency }]
export const adminSetRankWithdrawalTiers = (rankId, tiers) =>
  call("admin_set_rank_withdrawal_tiers", { p_rank_id: rankId, p_tiers: tiers });

export const getWalletSummary = (uid) => call("get_wallet_summary", { p_uid: uid });

export const getWalletTransactions = (uid) => call("get_wallet_transactions", { p_uid: uid });

export const adminSetWalletReferenceRate = (rate) => call("admin_set_wallet_reference_rate", { p_rate: rate });

// ---------- dashboard: streak + announcements (0090) ----------
export const getMyStreak = () => call("get_my_streak", {});

export const getActiveAnnouncements = () => call("get_active_announcements", {});

export const getAdminAnnouncements = () => call("get_admin_announcements", {});

export const createAnnouncement = (title, body) => call("create_announcement", { p_title: title, p_body: body });

export const deleteAnnouncement = (id) => call("delete_announcement", { p_id: id });

// ---------- Training: shared `resources` library (0105) ----------
export const createResource = (title, fileUrl, fileType, purpose, skillTags = []) =>
  call("create_resource", { p_title: title, p_file_url: fileUrl, p_file_type: fileType, p_purpose: purpose, p_skill_tags: skillTags });

export const deleteResource = (id) => call("delete_resource", { p_id: id });

// ---------- Training: Onboarding stage (0106) ----------
// get_admin_onboarding_overview/etc. reads happen directly via
// supabase.rpc(...) inside useSupabaseQuery wherever they're used -- no
// wrapper for those here, on purpose (see the note above getRankLearningPaths
// history: a call() wrapper unwraps straight to .data, the wrong shape for
// useSupabaseQuery).
export const adminAddOnboardingItem = (step, type, title, filePath, linkUrl) =>
  call("admin_add_onboarding_item", { p_step: step, p_type: type, p_title: title, p_file_path: filePath, p_link_url: linkUrl });

export const adminRemoveOnboardingItem = (id) => call("admin_remove_onboarding_item", { p_id: id });

export const adminSetRegistrationLink = (link) => call("admin_set_registration_link", { p_link: link });

export const completeOnboardingStep = (step) => call("complete_onboarding_step", { p_step: step });

// ---------- Training: Personal Development stage (0107/0108) ----------
export const adminAddPdResource = (title, fileType, fileUrl) =>
  call("admin_add_pd_resource", { p_title: title, p_file_type: fileType, p_file_url: fileUrl });

export const adminRemovePdResource = (linkId) => call("admin_remove_pd_resource", { p_link_id: linkId });

export const togglePersonalDevelopmentItem = (resourceId, done) =>
  call("toggle_personal_development_item", { p_resource_id: resourceId, p_done: done });

// ---------- Training: Skill Development stage (0111/0116) ----------
// Class detail (modules + items + trainers) is read directly via nested
// supabase.from("classes").select(...) wherever it's used -- these are the
// write actions only. get_my_class_progress is a read RPC but goes through
// useSupabaseQuery + supabase.rpc(...) directly for the same reason as
// every other read RPC in this file (see the note above deleteAnnouncement).
export const createClass = (title, description, purpose) => call("create_class", { p_title: title, p_description: description, p_purpose: purpose });

export const updateClassDetails = (id, title, description) => call("update_class_details", { p_id: id, p_title: title, p_description: description });

export const publishClass = (id) => call("publish_class", { p_id: id });

export const unpublishClass = (id) => call("unpublish_class", { p_id: id });

export const archiveClass = (id) => call("archive_class", { p_id: id });

export const deleteClass = (id) => call("delete_class", { p_id: id });

export const addClassModule = (classId, title) => call("add_class_module", { p_class_id: classId, p_title: title });

export const renameClassModule = (id, title) => call("rename_class_module", { p_id: id, p_title: title });

export const deleteClassModule = (id) => call("delete_class_module", { p_id: id });

export const moveClassModule = (id, direction) => call("move_class_module", { p_id: id, p_direction: direction });

export const addClassTrainer = (classId, userId) => call("add_class_trainer", { p_class_id: classId, p_user_id: userId });

export const removeClassTrainer = (id) => call("remove_class_trainer", { p_id: id });

export const addClassItem = (moduleId, type, title, resourceId, body, examId) =>
  call("add_class_item", { p_module_id: moduleId, p_type: type, p_title: title, p_resource_id: resourceId, p_body: body, p_exam_id: examId });

export const addClassAssignmentItem = (moduleId, title, instructions, referenceLink, requireNote, requireLink, dueDate) =>
  call("add_class_assignment_item", {
    p_module_id: moduleId,
    p_title: title,
    p_instructions: instructions,
    p_reference_link: referenceLink,
    p_require_note: requireNote,
    p_require_link: requireLink,
    p_due_date: dueDate,
  });

export const removeClassItem = (id) => call("remove_class_item", { p_id: id });

export const toggleClassItemProgress = (itemId, done) => call("toggle_class_item_progress", { p_item_id: itemId, p_done: done });

export const askClassTrainerQuestion = (classId, trainerId, message) =>
  call("ask_class_trainer_question", { p_class_id: classId, p_trainer_id: trainerId, p_message: message });

export const submitCoursework = (assignmentId, note, link) => call("submit_coursework", { p_assignment_id: assignmentId, p_note: note, p_link: link });

export const reviewCourseworkSubmission = (id, decision, reviewNote) =>
  call("review_coursework_submission", { p_id: id, p_decision: decision, p_review_note: reviewNote });

// ---------- Training: Income Development stage (0112) ----------
// admin_add/remove_income_resource wrap income_development_resources -- per
// the spec's own note (§8.1), that link table is vestigial: in practice the
// Skill Catalog tab reuses the Skill Development class editor with
// purpose="income_development" instead, so no frontend calls these two.
// Kept for schema fidelity only.
export const adminAddIncomeResource = (title, fileType, fileUrl) =>
  call("admin_add_income_resource", { p_title: title, p_file_type: fileType, p_file_url: fileUrl });

export const adminRemoveIncomeResource = (linkId) => call("admin_remove_income_resource", { p_link_id: linkId });

export const setIncomeSkill = (skillName) => call("set_income_skill", { p_skill_name: skillName });

export const toggleIncomeMilestone = (milestone, done) => call("toggle_income_milestone", { p_milestone: milestone, p_done: done });

export const addIncomePortfolioItem = (title, description, linkUrl) =>
  call("add_income_portfolio_item", { p_title: title, p_description: description, p_link_url: linkUrl });

export const removeIncomePortfolioItem = (id) => call("remove_income_portfolio_item", { p_id: id });

export const addIncomeEntry = (amount, source, earnedOn, note) =>
  call("add_income_entry", { p_amount: amount, p_source: source, p_earned_on: earnedOn, p_note: note });

export const removeIncomeEntry = (id) => call("remove_income_entry", { p_id: id });

// ---------- Training: Network Marketing stage (0113) ----------
export const adminAddNmProduct = (name, description, linkUrl) => call("admin_add_nm_product", { p_name: name, p_description: description, p_link_url: linkUrl });

export const adminRemoveNmProduct = (id) => call("admin_remove_nm_product", { p_id: id });

export const adminAddNmBasic = (title, description, linkUrl) => call("admin_add_nm_basic", { p_title: title, p_description: description, p_link_url: linkUrl });

export const adminRemoveNmBasic = (id) => call("admin_remove_nm_basic", { p_id: id });

export const addNmContact = (fullName, phone, email, interestedProductId, notes) =>
  call("add_nm_contact", { p_full_name: fullName, p_phone: phone, p_email: email, p_interested_product_id: interestedProductId, p_notes: notes });

export const updateNmContact = (id, fullName, phone, email, interestedProductId, notes) =>
  call("update_nm_contact", { p_id: id, p_full_name: fullName, p_phone: phone, p_email: email, p_interested_product_id: interestedProductId, p_notes: notes });

export const setNmContactStage = (contactId, stage, note) => call("set_nm_contact_stage", { p_contact_id: contactId, p_stage: stage, p_note: note });

export const addNmActivityNote = (contactId, note) => call("add_nm_activity_note", { p_contact_id: contactId, p_note: note });

export const removeNmContact = (id) => call("remove_nm_contact", { p_id: id });

// ---------- Learning Center: Exam Manager (0118) ----------
// get_exam_attempts_admin is a read RPC -- called directly via
// supabase.rpc(...) inside useSupabaseQuery, same reasoning as every other
// read RPC noted in this file.
export const createExam = (title, description) => call("create_exam", { p_title: title, p_description: description });

export const updateExamDetails = (id, title, description) => call("update_exam_details", { p_id: id, p_title: title, p_description: description });

export const upsertExamSettings = (examId, numQuestions, timeLimitMinutes, passMarkPercent, maxAttempts, shuffleQuestions, shuffleOptions) =>
  call("upsert_exam_settings", {
    p_exam_id: examId,
    p_num_questions: numQuestions,
    p_time_limit_minutes: timeLimitMinutes,
    p_pass_mark_percent: passMarkPercent,
    p_max_attempts: maxAttempts,
    p_shuffle_questions: shuffleQuestions,
    p_shuffle_options: shuffleOptions,
  });

export const setExamPublicLink = (examId, enabled) => call("set_exam_public_link", { p_exam_id: examId, p_enabled: enabled });

export const publishExam = (id) => call("publish_exam", { p_id: id });

export const unpublishExam = (id) => call("unpublish_exam", { p_id: id });

export const archiveExam = (id) => call("archive_exam", { p_id: id });

export const deleteExam = (id) => call("delete_exam", { p_id: id });

export const addQuestion = (examId, type, prompt, points) => call("add_question", { p_exam_id: examId, p_type: type, p_prompt: prompt, p_points: points });

export const updateQuestion = (id, prompt, points) => call("update_question", { p_id: id, p_prompt: prompt, p_points: points });

export const deleteQuestion = (id) => call("delete_question", { p_id: id });

export const addQuestionOption = (questionId, label, isCorrect) => call("add_question_option", { p_question_id: questionId, p_label: label, p_is_correct: isCorrect });

export const updateQuestionOption = (id, label, isCorrect) => call("update_question_option", { p_id: id, p_label: label, p_is_correct: isCorrect });

export const deleteQuestionOption = (id) => call("delete_question_option", { p_id: id });

// ---------- member: take-exam flow (0118) ----------
export const startExamAttempt = (publicToken) => call("start_exam_attempt", { p_public_token: publicToken });

export const submitExamAttempt = (attemptId, answers) => call("submit_exam_attempt", { p_attempt_id: attemptId, p_answers: answers });

// ---------- Tasks: daily-unlock flow (0114/0121) ----------
// get_my_task_flow is a read RPC, called directly via supabase.rpc(...)
// inside useSupabaseQuery wherever it's used -- these are the write actions.
export const adminAddTaskStep = (title, description, type, classId, examId, courseworkAssignmentId) =>
  call("admin_add_task_step", {
    p_title: title,
    p_description: description,
    p_type: type,
    p_class_id: classId,
    p_exam_id: examId,
    p_coursework_assignment_id: courseworkAssignmentId,
  });

export const adminRemoveTaskStep = (id) => call("admin_remove_task_step", { p_id: id });

export const adminMoveTaskStep = (id, direction) => call("admin_move_task_step", { p_id: id, p_direction: direction });
