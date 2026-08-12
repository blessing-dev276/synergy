const { onCall } = require("firebase-functions/v2/https");
const { db, FieldValue } = require("./lib/admin");
const { requireAuth, HttpsError } = require("./lib/errors");

// All lesson completions route through here — even the trivial "manual"
// case — so there's a single enforcement point for completion rules (and a
// single hook point for future XP/streak awarding, out of scope for now).
exports.markLessonComplete = onCall(async (request) => {
  const auth = requireAuth(request);
  const { courseId, moduleId, lessonId } = request.data ?? {};
  if (!courseId || !moduleId || !lessonId) {
    throw new HttpsError("invalid-argument", "courseId, moduleId, and lessonId are required.");
  }

  const lessonRef = db.doc(`courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`);
  const [lessonSnap, courseSnap] = await Promise.all([lessonRef.get(), db.doc(`courses/${courseId}`).get()]);
  if (!lessonSnap.exists) throw new HttpsError("not-found", "That lesson doesn't exist.");
  const lesson = lessonSnap.data();
  const pathId = courseSnap.data()?.pathId ?? null;

  if (lesson.completionRule === "quiz_pass") {
    const quizSnap = await db.collection("quizzes").where("lessonId", "==", lessonId).limit(1).get();
    if (quizSnap.empty) throw new HttpsError("failed-precondition", "This lesson's quiz isn't set up yet.");
    const quizId = quizSnap.docs[0].id;

    const passSnap = await db
      .collection("quizAttempts")
      .where("uid", "==", auth.uid)
      .where("quizId", "==", quizId)
      .where("passed", "==", true)
      .limit(1)
      .get();
    if (passSnap.empty) {
      throw new HttpsError("failed-precondition", "You need to pass the quiz before this lesson is complete.");
    }
  }

  await db.doc(`lessonProgress/${auth.uid}_${lessonId}`).set(
    {
      uid: auth.uid,
      lessonId,
      moduleId,
      courseId,
      pathId,
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});
