const { onCall } = require("firebase-functions/v2/https");
const { db, FieldValue } = require("./lib/admin");
const { requireAuth, HttpsError } = require("./lib/errors");

exports.gradeAssignment = onCall(async (request) => {
  const auth = requireAuth(request);
  const role = request.auth.token.role;
  if (role !== "mentor" && role !== "admin") {
    throw new HttpsError("permission-denied", "Only mentors or admins can grade assignments.");
  }

  const { submissionId, decision, grade, feedback } = request.data ?? {};
  if (!submissionId || !["approved", "needs_revision"].includes(decision)) {
    throw new HttpsError("invalid-argument", "submissionId and a valid decision are required.");
  }

  const submissionRef = db.doc(`assignmentSubmissions/${submissionId}`);
  const submissionSnap = await submissionRef.get();
  if (!submissionSnap.exists) throw new HttpsError("not-found", "That submission doesn't exist.");
  const submission = submissionSnap.data();

  if (role === "mentor") {
    const assignmentDoc = await db.doc(`mentorAssignments/${auth.uid}_${submission.uid}`).get();
    if (!assignmentDoc.exists || assignmentDoc.data().active !== true) {
      throw new HttpsError("permission-denied", "You can only grade your assigned members' work.");
    }
  }

  await submissionRef.set(
    {
      status: decision,
      grade: typeof grade === "number" ? grade : null,
      feedback: feedback ?? "",
      gradedBy: auth.uid,
      gradedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection("notifications").add({
    uid: submission.uid,
    type: "assignment_graded",
    title: decision === "approved" ? "Assignment approved" : "Assignment needs revision",
    body: feedback || (decision === "approved" ? "Your assignment was approved." : "Your mentor left feedback for you."),
    linkTo: `/assignments/${submission.assignmentId}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection("activityLog").add({
    actorUid: auth.uid,
    action: "assignment_graded",
    targetType: "assignmentSubmission",
    targetId: submissionId,
    metadata: { decision },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
