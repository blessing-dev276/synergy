const { onCall } = require("firebase-functions/v2/https");
const { db, auth, FieldValue } = require("./lib/admin");
const { requireRole, HttpsError } = require("./lib/errors");

const VALID_ROLES = ["member", "mentor", "admin"];

exports.setUserRole = onCall(async (request) => {
  const caller = requireRole(request, "admin");
  const { uid, role } = request.data ?? {};

  if (typeof uid !== "string" || !uid) throw new HttpsError("invalid-argument", "uid is required.");
  if (!VALID_ROLES.includes(role)) throw new HttpsError("invalid-argument", "role must be member, mentor, or admin.");

  await auth.setCustomUserClaims(uid, { role });
  await db.doc(`users/${uid}`).set({ role }, { merge: true });
  await db.collection("activityLog").add({
    actorUid: caller.uid,
    action: "role_changed",
    targetType: "user",
    targetId: uid,
    metadata: { role },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
