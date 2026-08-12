const { onCall } = require("firebase-functions/v2/https");
const { db } = require("./lib/admin");
const { requireRole, HttpsError } = require("./lib/errors");

// Firestore doesn't auto-delete subcollections, so cascading a course
// delete (course -> modules -> lessons) has to happen explicitly here,
// never as a raw client-side deleteDoc on the course.
exports.deleteCourse = onCall(async (request) => {
  requireRole(request, "admin");
  const { courseId } = request.data ?? {};
  if (!courseId) throw new HttpsError("invalid-argument", "courseId is required.");

  const modulesSnap = await db.collection(`courses/${courseId}/modules`).get();
  for (const moduleDoc of modulesSnap.docs) {
    const lessonsSnap = await db.collection(`courses/${courseId}/modules/${moduleDoc.id}/lessons`).get();
    const batch = db.batch();
    lessonsSnap.docs.forEach((lessonDoc) => batch.delete(lessonDoc.ref));
    batch.delete(moduleDoc.ref);
    await batch.commit();
  }

  await db.doc(`courses/${courseId}`).delete();
  return { ok: true };
});
