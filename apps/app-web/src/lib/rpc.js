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

export const assignMentor = (mentorUid, memberUid) =>
  call("assign_mentor", { p_mentor_uid: mentorUid, p_member_uid: memberUid });

export const unassignMentor = (mentorUid, memberUid) =>
  call("unassign_mentor", { p_mentor_uid: mentorUid, p_member_uid: memberUid });

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

export const completeTask = (taskId) => call("complete_task", { p_task_id: taskId });

export const getJourneyOverview = (uid) => call("get_journey_overview", { p_uid: uid });

export const getNextBestAction = (uid) => call("get_next_best_action", { p_uid: uid });

export const setMemberStage = (uid, stageId) => call("set_member_stage", { p_uid: uid, p_stage_id: stageId });

export const setMemberStatus = (uid, status) => call("set_member_status", { p_uid: uid, p_status: status });
