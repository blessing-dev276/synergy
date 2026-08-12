const { onCall } = require("firebase-functions/v2/https");
const { db, FieldValue } = require("./lib/admin");
const { requireRole, HttpsError } = require("./lib/errors");

exports.assignMentor = onCall(async (request) => {
  const caller = requireRole(request, "admin");
  const { mentorUid, memberUid } = request.data ?? {};
  if (!mentorUid || !memberUid) throw new HttpsError("invalid-argument", "mentorUid and memberUid are required.");

  const mentorSnap = await db.doc(`users/${mentorUid}`).get();
  const memberSnap = await db.doc(`users/${memberUid}`).get();
  if (!mentorSnap.exists || mentorSnap.data().role !== "mentor") {
    throw new HttpsError("failed-precondition", "That user isn't a mentor.");
  }
  if (!memberSnap.exists || memberSnap.data().role !== "member") {
    throw new HttpsError("failed-precondition", "That user isn't a member.");
  }

  const batch = db.batch();
  batch.set(db.doc(`mentorAssignments/${mentorUid}_${memberUid}`), {
    mentorUid,
    memberUid,
    assignedBy: caller.uid,
    assignedAt: FieldValue.serverTimestamp(),
    active: true,
  });
  batch.set(db.doc(`users/${memberUid}`), { mentorUid }, { merge: true });
  batch.set(db.doc(`users/${mentorUid}`), { memberUids: FieldValue.arrayUnion(memberUid) }, { merge: true });
  batch.create(db.collection("activityLog").doc(), {
    actorUid: caller.uid,
    action: "mentor_assigned",
    targetType: "mentorAssignment",
    targetId: `${mentorUid}_${memberUid}`,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { ok: true };
});

exports.unassignMentor = onCall(async (request) => {
  const caller = requireRole(request, "admin");
  const { mentorUid, memberUid } = request.data ?? {};
  if (!mentorUid || !memberUid) throw new HttpsError("invalid-argument", "mentorUid and memberUid are required.");

  const batch = db.batch();
  batch.set(db.doc(`mentorAssignments/${mentorUid}_${memberUid}`), { active: false }, { merge: true });
  batch.set(db.doc(`users/${memberUid}`), { mentorUid: FieldValue.delete() }, { merge: true });
  batch.set(db.doc(`users/${mentorUid}`), { memberUids: FieldValue.arrayRemove(memberUid) }, { merge: true });
  batch.create(db.collection("activityLog").doc(), {
    actorUid: caller.uid,
    action: "mentor_unassigned",
    targetType: "mentorAssignment",
    targetId: `${mentorUid}_${memberUid}`,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { ok: true };
});
