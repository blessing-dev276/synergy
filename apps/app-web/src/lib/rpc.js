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

export const getJourneyOverview = (uid) => call("get_journey_overview", { p_uid: uid });

export const getNextBestAction = (uid) => call("get_next_best_action", { p_uid: uid });

export const setMemberStage = (uid, stageId) => call("set_member_stage", { p_uid: uid, p_stage_id: stageId });

export const setMemberStatus = (uid, status) => call("set_member_status", { p_uid: uid, p_status: status });

export const getOrientationContent = () => call("get_orientation_content", {});

export const submitOrientation = (answers) => call("submit_orientation", { p_answers: answers });

export const requestStagePromotion = () => call("request_stage_promotion", {});

export const reviewStagePromotion = (requestId, decision, note) =>
  call("review_stage_promotion", { p_request_id: requestId, p_decision: decision, p_note: note });

export const logEarning = (amount, note) => call("log_earning", { p_amount: amount, p_note: note });

export const reviewEarning = (id, decision, note) =>
  call("review_earning", { p_id: id, p_decision: decision, p_note: note });

export const getLeaderboards = () => call("get_leaderboards", {});

export const submitContentEvidence = (contentAssignmentId, textResponse, fileUrls) =>
  call("submit_content_evidence", { p_content_assignment_id: contentAssignmentId, p_text_response: textResponse, p_file_urls: fileUrls });

export const reviewContentEvidence = (submissionId, decision, feedback) =>
  call("review_content_evidence", { p_submission_id: submissionId, p_decision: decision, p_feedback: feedback });

export const awardMilestoneManual = (uid, milestoneId, note) =>
  call("award_milestone_manual", { p_uid: uid, p_milestone_id: milestoneId, p_note: note });

export const getAdminProgressionOverview = () => call("get_admin_progression_overview", {});

export const setMemberSpecialization = (trackId, specializationId) =>
  call("set_member_specialization", { p_track_id: trackId, p_specialization_id: specializationId });

export const adminSetMemberSpecialization = (uid, trackId, specializationId) =>
  call("admin_set_member_specialization", { p_uid: uid, p_track_id: trackId, p_specialization_id: specializationId });
