const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { db, FieldValue } = require("./lib/admin");

// Firestore has no joins/aggregation queries cheap enough for a dashboard
// read, so lesson completion recomputes the denormalized progress fields
// on the owning enrollment doc (and the user's summary stats) here instead
// of making every dashboard read fan out over lessonProgress.
exports.onLessonProgressWrite = onDocumentWritten("lessonProgress/{docId}", async (event) => {
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  if (!after || !after.courseId || !after.uid) return;

  const { uid, courseId } = after;

  const completedSnap = await db
    .collection("lessonProgress")
    .where("uid", "==", uid)
    .where("courseId", "==", courseId)
    .where("status", "==", "completed")
    .get();
  const completedLessonsCount = completedSnap.size;

  const courseSnap = await db.doc(`courses/${courseId}`).get();
  const course = courseSnap.data() ?? {};
  const totalLessonsCount = course.lessonCount ?? 0;
  const progressPercent = totalLessonsCount > 0 ? Math.round((completedLessonsCount / totalLessonsCount) * 100) : 0;
  const status = totalLessonsCount > 0 && completedLessonsCount >= totalLessonsCount ? "completed" : "in_progress";

  await db.doc(`enrollments/${uid}_${courseId}`).set(
    {
      uid,
      courseId,
      pathId: after.pathId ?? course.pathId ?? null,
      courseTitle: course.title ?? "",
      totalLessonsCount,
      completedLessonsCount,
      progressPercent,
      status,
      lastAccessedLessonId: after.lessonId,
      lastAccessedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const justCompleted = after.status === "completed" && before?.status !== "completed";
  if (justCompleted) {
    await db.doc(`users/${uid}`).set(
      { stats: { completedLessonsCount: FieldValue.increment(1) } },
      { merge: true },
    );
  }
});
