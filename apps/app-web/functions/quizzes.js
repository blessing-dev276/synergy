const { onCall } = require("firebase-functions/v2/https");
const { db, FieldValue } = require("./lib/admin");
const { requireAuth, HttpsError } = require("./lib/errors");

// Strips correct answers before the client ever sees the questions — quiz
// question/answer subcollections are never member-readable directly.
exports.getQuizForAttempt = onCall(async (request) => {
  requireAuth(request);
  const { lessonId } = request.data ?? {};
  if (!lessonId) throw new HttpsError("invalid-argument", "lessonId is required.");

  const quizSnap = await db.collection("quizzes").where("lessonId", "==", lessonId).limit(1).get();
  if (quizSnap.empty) throw new HttpsError("not-found", "No quiz is set up for this lesson yet.");
  const quizDoc = quizSnap.docs[0];
  const quiz = quizDoc.data();

  const questionsSnap = await db.collection(`quizzes/${quizDoc.id}/questions`).orderBy("order", "asc").get();
  const questions = questionsSnap.docs.map((d) => {
    const q = d.data();
    return {
      id: d.id,
      prompt: q.prompt,
      type: q.type,
      options: (q.options ?? []).map((o) => ({ id: o.id, text: o.text })),
    };
  });

  return {
    id: quizDoc.id,
    title: quiz.title,
    passScorePercent: quiz.passScorePercent,
    timeLimitMinutes: quiz.timeLimitMinutes ?? null,
    questions,
  };
});

exports.submitQuizAttempt = onCall(async (request) => {
  const auth = requireAuth(request);
  const { quizId, answers } = request.data ?? {};
  if (!quizId || !Array.isArray(answers)) {
    throw new HttpsError("invalid-argument", "quizId and answers are required.");
  }

  const quizSnap = await db.doc(`quizzes/${quizId}`).get();
  if (!quizSnap.exists) throw new HttpsError("not-found", "That quiz doesn't exist.");
  const quiz = quizSnap.data();

  const questionsSnap = await db.collection(`quizzes/${quizId}/questions`).get();
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));

  let correctCount = 0;
  questionsSnap.docs.forEach((d) => {
    const question = d.data();
    const given = answerByQuestion.get(d.id);
    const correct = (question.correctOptionIds ?? []).length === 1 && given === question.correctOptionIds[0];
    if (correct) correctCount += 1;
  });

  const total = questionsSnap.size || 1;
  const score = Math.round((correctCount / total) * 100);
  const passed = score >= (quiz.passScorePercent ?? 70);

  const priorAttemptsSnap = await db
    .collection("quizAttempts")
    .where("uid", "==", auth.uid)
    .where("quizId", "==", quizId)
    .get();

  await db.collection("quizAttempts").add({
    quizId,
    uid: auth.uid,
    answers,
    score,
    passed,
    attemptNumber: priorAttemptsSnap.size + 1,
    startedAt: FieldValue.serverTimestamp(),
    submittedAt: FieldValue.serverTimestamp(),
  });

  return { score, passed };
});
