const functionsV1 = require("firebase-functions/v1");
const { db, auth, FieldValue } = require("./lib/admin");

// 1st-gen only: functions.auth.user().onCreate has no 2nd-gen equivalent
// without enabling Identity Platform (Blocking Functions). Mixing 1st- and
// 2nd-gen functions in one codebase is fine.
exports.onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  await auth.setCustomUserClaims(user.uid, { role: "member" });

  await db.doc(`users/${user.uid}`).set(
    {
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      photoURL: user.photoURL ?? "",
      role: "member",
      status: "active",
      onboarding: { completed: false, interests: [], goals: [] },
      stats: { enrolledCount: 0, completedLessonsCount: 0, completedCoursesCount: 0 },
      createdAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
});
