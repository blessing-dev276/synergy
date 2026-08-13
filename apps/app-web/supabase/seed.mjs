// Dev-data seeder — creates demo admin/member accounts plus sample learning
// content. Uses the Auth Admin API + service_role client rather than
// hand-inserting into auth.users directly: Supabase explicitly discourages
// writing to that table's internals (encrypted_password format, etc. are
// undocumented and can change), so this is the supported path for both
// local (`supabase start`) and hosted projects.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed.mjs
/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from the Supabase dashboard > API settings) before running this.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsertUser({ email, password, displayName, role, sponsorUid, claimedSponsorName }) {
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing?.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // sponsor_uid/claimed_sponsor_name are read by the handle_new_user
      // trigger (0019) the same way the real signup form (Signup.jsx via
      // SponsorPicker) passes them — exactly one of the two is ever set.
      user_metadata: {
        display_name: displayName,
        sponsor_uid: sponsorUid ?? null,
        claimed_sponsor_name: sponsorUid ? null : (claimedSponsorName ?? null),
      },
    });
    if (error) throw error;
    user = data.user;
  }

  // handle_new_user already created the profile row (status 'pending', per
  // the orientation-screening flow) on signup; just set role/status here so
  // seeded demo accounts are immediately usable without going through
  // orientation themselves.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role, status: "active", display_name: displayName, onboarding: { completed: true, interests: [], goals: [] } })
    .eq("id", user.id);
  if (profileError) throw profileError;

  return user.id;
}

async function main() {
  console.log("Seeding demo users…");
  const adminUid = await upsertUser({ email: "admin@synergyteamm.com", password: "password123", displayName: "Synergy Admin", role: "admin" });
  // Pre-sponsor-model account, kept as a "legacy mentor" demo: role is now
  // plain 'member' (mentor no longer exists as a role), but still has a
  // mentor_assignments row below so /admin/network/legacy-mentors has
  // something to show.
  const legacyMentorUid = await upsertUser({ email: "mentor@synergyteamm.com", password: "password123", displayName: "Sample Mentor", role: "member", sponsorUid: adminUid });
  const memberUid = await upsertUser({ email: "member@synergyteamm.com", password: "password123", displayName: "Sample Member", role: "member", sponsorUid: legacyMentorUid });
  // Exercises the "sponsor not found at signup" path (see
  // supabase/migrations/0019_sponsor_functions.sql + SponsorRequests.jsx) —
  // claims a sponsor name that matches nobody, so it lands as a pending row
  // in /admin/network/requests instead of being silently dropped.
  await upsertUser({ email: "pending-sponsor@synergyteamm.com", password: "password123", displayName: "Pending Sponsor Demo", role: "member", claimedSponsorName: "Michael Ade" });

  console.log("Recording legacy mentor assignment (historical only, not a sponsor relationship)…");
  await supabase.from("mentor_assignments").upsert(
    { mentor_uid: legacyMentorUid, member_uid: memberUid, assigned_by: adminUid, active: true },
    { onConflict: "mentor_uid,member_uid" },
  );
  await supabase.from("profiles").update({ mentor_uid: legacyMentorUid }).eq("id", memberUid);

  console.log("Seeding learning path/course/module/lessons/quiz…");
  const { data: path } = await supabase
    .from("learning_paths")
    .insert({ title: "GoHighLevel CRM Specialist", description: "Learn to set up and run client CRM systems in GoHighLevel.", order_index: 1, published: true, created_by: adminUid })
    .select()
    .single();

  const { data: course } = await supabase
    .from("courses")
    .insert({ path_id: path.id, title: "CRM Fundamentals", description: "The building blocks of GoHighLevel: contacts, pipelines, and funnels.", order_index: 1, published: true, estimated_minutes: 40, created_by: adminUid })
    .select()
    .single();

  const { data: courseModule } = await supabase
    .from("modules")
    .insert({ course_id: course.id, title: "Getting Started", order_index: 1, published: true })
    .select()
    .single();

  await supabase.from("lessons").insert({
    module_id: courseModule.id,
    course_id: course.id,
    title: "What is a CRM?",
    order_index: 1,
    content_type: "text",
    content_body: "A CRM (Customer Relationship Management system) helps you track leads, contacts, and deals in one place...",
    estimated_minutes: 10,
    completion_rule: "manual",
    published: true,
  });

  const { data: quizLesson } = await supabase
    .from("lessons")
    .insert({
      module_id: courseModule.id,
      course_id: course.id,
      title: "Contacts & Pipelines Quiz",
      order_index: 2,
      content_type: "text",
      content_body: "Review contacts and pipelines, then pass the quiz below to complete this lesson.",
      estimated_minutes: 15,
      completion_rule: "quiz_pass",
      published: true,
    })
    .select()
    .single();

  const { data: quiz } = await supabase
    .from("quizzes")
    .insert({ lesson_id: quizLesson.id, title: "Contacts & Pipelines Quiz", pass_score_percent: 70, time_limit_minutes: 10 })
    .select()
    .single();

  const { data: question } = await supabase
    .from("quiz_questions")
    .insert({ quiz_id: quiz.id, prompt: "What does CRM stand for?", type: "multiple_choice", order_index: 1 })
    .select()
    .single();

  await supabase.from("quiz_options").insert([
    { question_id: question.id, text: "Customer Relationship Management", is_correct: true, order_index: 1 },
    { question_id: question.id, text: "Contact Records Manager", is_correct: false, order_index: 2 },
    { question_id: question.id, text: "Client Revenue Model", is_correct: false, order_index: 3 },
  ]);

  console.log("Seeding an assignment…");
  const { data: workflowAssignment } = await supabase
    .from("assignments")
    .insert({
      course_id: course.id,
      title: "Build a lead follow-up workflow",
      instructions: "Create a simple 3-step follow-up workflow in your GoHighLevel sandbox and share a link or screenshot.",
      max_score: 100,
      published: true,
    })
    .select()
    .single();

  console.log("Seeding Business and Freelancing academy content…");
  const { data: businessPath } = await supabase
    .from("learning_paths")
    .insert({ title: "Business Development Academy", description: "Mindset, communication, and prospecting fundamentals every member builds alongside their skill.", order_index: 2, published: true, created_by: adminUid })
    .select()
    .single();

  const { data: businessCourse } = await supabase
    .from("courses")
    .insert({ path_id: businessPath.id, title: "Synergy Orientation & Prospecting", description: "How Synergy works, and how to start building a prospect list.", order_index: 1, published: true, estimated_minutes: 25, created_by: adminUid })
    .select()
    .single();

  const { data: businessModule } = await supabase
    .from("modules")
    .insert({ course_id: businessCourse.id, title: "Getting Started", order_index: 1, published: true })
    .select()
    .single();

  await supabase.from("lessons").insert({
    module_id: businessModule.id,
    course_id: businessCourse.id,
    title: "Prospecting fundamentals",
    order_index: 1,
    content_type: "text",
    content_body: "A prospect list is the raw material of every business conversation. Start with people you already know...",
    estimated_minutes: 15,
    completion_rule: "manual",
    published: true,
  });

  const { data: freelancingPath } = await supabase
    .from("learning_paths")
    .insert({ title: "Freelancing Academy", description: "How to package, market, and sell your skill on Fiverr and Upwork.", order_index: 3, published: true, created_by: adminUid })
    .select()
    .single();

  const { data: freelancingCourse } = await supabase
    .from("courses")
    .insert({ path_id: freelancingPath.id, title: "Freelance Marketplaces 101", description: "How Fiverr and Upwork work, and how to research a profitable niche.", order_index: 1, published: true, estimated_minutes: 20, created_by: adminUid })
    .select()
    .single();

  const { data: freelancingModule } = await supabase
    .from("modules")
    .insert({ course_id: freelancingCourse.id, title: "Getting Started", order_index: 1, published: true })
    .select()
    .single();

  await supabase.from("lessons").insert({
    module_id: freelancingModule.id,
    course_id: freelancingCourse.id,
    title: "What makes a gig sell",
    order_index: 1,
    content_type: "text",
    content_body: "Before you publish anything, study what's already working. Look at 5 competitors in your niche...",
    estimated_minutes: 15,
    completion_rule: "manual",
    published: true,
  });

  console.log("Creating Stage 1 — Foundation with all three tracks…");
  const { data: stage1 } = await supabase
    .from("stages")
    .insert({ key: "foundation", title: "Stage 1 — Foundation", description: "Get oriented: your first skill training, your first business conversations, your first look at freelancing.", order_index: 1, published: true, created_by: adminUid })
    .select()
    .single();

  const { data: tracks } = await supabase.from("tracks").select("id, key");
  const trackId = Object.fromEntries(tracks.map((t) => [t.key, t.id]));

  await supabase.from("stage_tracks").insert([
    { stage_id: stage1.id, track_id: trackId.skill, intro_text: "Learn the CRM fundamentals that make you valuable." },
    { stage_id: stage1.id, track_id: trackId.business, intro_text: "Learn how Synergy works and how to start real conversations." },
    { stage_id: stage1.id, track_id: trackId.freelancing, intro_text: "Get a first look at how freelancers actually get paid." },
  ]);

  console.log("Seeding Stage 1 tasks across all three tracks…");
  const { data: skillLearningTask } = await supabase
    .from("tasks")
    .insert({
      title: "Complete CRM Fundamentals",
      description: "Work through the CRM Fundamentals course, including the Contacts & Pipelines quiz.",
      scope: "individual",
      course_id: course.id,
      assigned_to_uid: memberUid,
      priority: "high",
      created_by: adminUid,
      stage_id: stage1.id,
      track_id: trackId.skill,
      task_type: "learning",
      xp_reward: 10,
      is_required: true,
      linked_course_id: course.id,
    })
    .select()
    .single();

  const { data: skillSubmissionTask } = await supabase.from("tasks").insert({
    title: "Submit your lead follow-up workflow",
    description: "Build and submit your 3-step follow-up workflow for admin review.",
    scope: "individual",
    course_id: course.id,
    assigned_to_uid: memberUid,
    priority: "high",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.skill,
    task_type: "submission",
    xp_reward: 50,
    is_required: true,
    requires_admin_approval: true,
    linked_assignment_id: workflowAssignment.id,
  }).select().single();

  await supabase.from("task_dependencies").insert({
    task_id: skillSubmissionTask.id,
    depends_on_task_id: skillLearningTask.id,
  });

  await supabase.from("tasks").insert({
    title: "Complete Synergy Orientation & Prospecting",
    description: "Work through the orientation lesson on prospecting fundamentals.",
    scope: "individual",
    assigned_to_uid: memberUid,
    priority: "medium",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.business,
    task_type: "learning",
    xp_reward: 10,
    is_required: true,
    linked_course_id: businessCourse.id,
  });

  await supabase.from("tasks").insert({
    title: "Contact 5 prospects",
    description: "Reach out to 5 people in your network and record the conversation.",
    scope: "individual",
    assigned_to_uid: memberUid,
    priority: "medium",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.business,
    task_type: "business_activity",
    xp_reward: 20,
    is_required: true,
  });

  await supabase.from("tasks").insert({
    title: "Complete Freelance Marketplaces 101",
    description: "Learn how Fiverr and Upwork work before choosing where to sell your skill.",
    scope: "individual",
    assigned_to_uid: memberUid,
    priority: "medium",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.freelancing,
    task_type: "learning",
    xp_reward: 10,
    is_required: true,
    linked_course_id: freelancingCourse.id,
  });

  await supabase.from("tasks").insert({
    title: "Research 5 Fiverr gigs in your niche",
    description: "Find 5 successful gigs close to the skill you're learning and note what makes them work.",
    scope: "individual",
    assigned_to_uid: memberUid,
    priority: "medium",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.freelancing,
    task_type: "freelancing_activity",
    xp_reward: 20,
    is_required: true,
  });

  await supabase.from("tasks").insert({
    title: "Attend Tuesday training",
    description: "Join the weekly live training session.",
    scope: "global",
    assigned_to_uid: memberUid,
    priority: "low",
    created_by: adminUid,
    stage_id: stage1.id,
    track_id: trackId.business,
    task_type: "attendance",
    xp_reward: 5,
    is_required: false,
  });

  console.log("Starting the demo member's journey at Stage 1…");
  await supabase.from("member_journey").upsert(
    { uid: memberUid, current_stage_id: stage1.id },
    { onConflict: "uid" },
  );

  console.log("\nSeed complete. Log in with:");
  console.log("  admin@synergyteamm.com           / password123");
  console.log("  mentor@synergyteamm.com          / password123  (legacy mentor demo, now a plain member)");
  console.log("  member@synergyteamm.com          / password123");
  console.log("  pending-sponsor@synergyteamm.com / password123  (pending sponsor request demo)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
