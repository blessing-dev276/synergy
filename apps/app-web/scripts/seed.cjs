// Dev-data seeder — run against the Local Emulator Suite only.
// Usage: firebase emulators:exec --only auth,firestore "node scripts/seed.cjs"
// (or run alongside `npm run emulators` in another terminal: `npm run seed`)
/* eslint-disable no-console */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST aren't set.\n" +
      "This script is for seeding the Local Emulator Suite only, never production.\n" +
      "Start the emulators first (npm run emulators), then in another terminal: npm run seed",
  );
  process.exit(1);
}

initializeApp({ projectId: "demo-synergy-app" });
const db = getFirestore();
const auth = getAuth();

async function upsertUser({ email, password, displayName, role }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName });
  }
  await auth.setCustomUserClaims(user.uid, { role });
  await db.doc(`users/${user.uid}`).set(
    {
      displayName,
      email,
      role,
      status: "active",
      onboarding: { completed: true, interests: [], goals: [] },
      stats: { enrolledCount: 0, completedLessonsCount: 0, completedCoursesCount: 0 },
      createdAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return user.uid;
}

async function main() {
  console.log("Seeding demo users…");
  const adminUid = await upsertUser({
    email: "admin@synergyteamm.com",
    password: "password123",
    displayName: "Synergy Admin",
    role: "admin",
  });
  const mentorUid = await upsertUser({
    email: "mentor@synergyteamm.com",
    password: "password123",
    displayName: "Sample Mentor",
    role: "mentor",
  });
  const memberUid = await upsertUser({
    email: "member@synergyteamm.com",
    password: "password123",
    displayName: "Sample Member",
    role: "member",
  });

  console.log("Assigning mentor…");
  await db.doc(`mentorAssignments/${mentorUid}_${memberUid}`).set({
    mentorUid,
    memberUid,
    assignedBy: adminUid,
    assignedAt: FieldValue.serverTimestamp(),
    active: true,
  });
  await db.doc(`users/${memberUid}`).set({ mentorUid }, { merge: true });
  await db.doc(`users/${mentorUid}`).set({ memberUids: [memberUid] }, { merge: true });

  console.log("Seeding learning path/course/module/lessons/quiz…");
  const pathRef = db.collection("learningPaths").doc("ghl-crm-specialist");
  await pathRef.set({
    title: "GoHighLevel CRM Specialist",
    description: "Learn to set up and run client CRM systems in GoHighLevel.",
    order: 1,
    published: true,
    courseCount: 1,
    createdBy: adminUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const courseRef = db.collection("courses").doc("ghl-fundamentals");
  await courseRef.set({
    pathId: pathRef.id,
    title: "CRM Fundamentals",
    description: "The building blocks of GoHighLevel: contacts, pipelines, and funnels.",
    order: 1,
    published: true,
    moduleCount: 1,
    lessonCount: 2,
    estimatedMinutes: 40,
    createdBy: adminUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const moduleRef = courseRef.collection("modules").doc("module-1");
  await moduleRef.set({ title: "Getting Started", order: 1, published: true, lessonCount: 2 });

  const lesson1Ref = moduleRef.collection("lessons").doc("lesson-1");
  await lesson1Ref.set({
    title: "What is a CRM?",
    order: 1,
    contentType: "text",
    contentBody: "A CRM (Customer Relationship Management system) helps you track leads, contacts, and deals in one place...",
    estimatedMinutes: 10,
    completionRule: "manual",
    requiredQuizId: null,
    published: true,
  });

  const lesson2Ref = moduleRef.collection("lessons").doc("lesson-2");
  await lesson2Ref.set({
    title: "Contacts & Pipelines Quiz",
    order: 2,
    contentType: "text",
    contentBody: "Review contacts and pipelines, then pass the quiz below to complete this lesson.",
    estimatedMinutes: 15,
    completionRule: "quiz_pass",
    requiredQuizId: null,
    published: true,
  });

  const quizRef = db.collection("quizzes").doc("quiz-contacts-pipelines");
  await quizRef.set({
    lessonId: lesson2Ref.id,
    title: "Contacts & Pipelines Quiz",
    passScorePercent: 70,
    timeLimitMinutes: 10,
    questionCount: 1,
  });
  await quizRef.collection("questions").doc("q1").set({
    prompt: "What does CRM stand for?",
    type: "multiple_choice",
    order: 1,
    options: [
      { id: "a", text: "Customer Relationship Management" },
      { id: "b", text: "Contact Records Manager" },
      { id: "c", text: "Client Revenue Model" },
    ],
    correctOptionIds: ["a"],
  });

  console.log("Seeding an assignment and a task…");
  await db.collection("assignments").doc("assignment-1").set({
    courseId: courseRef.id,
    title: "Build a lead follow-up workflow",
    instructions: "Create a simple 3-step follow-up workflow in your GoHighLevel sandbox and share a link or screenshot.",
    dueDate: null,
    maxScore: 100,
    published: true,
  });

  await db.collection("tasks").doc("task-1").set({
    title: "Attend Tuesday training",
    description: "Join the weekly live training session.",
    scope: "global",
    courseId: null,
    assignedToUid: memberUid,
    priority: "medium",
    status: "Not Started",
    dueDate: null,
    createdBy: adminUid,
  });

  console.log("\nSeed complete.");
  console.log("Log in at http://localhost:5173 with:");
  console.log("  admin@synergyteamm.com  / password123");
  console.log("  mentor@synergyteamm.com / password123");
  console.log("  member@synergyteamm.com / password123");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
