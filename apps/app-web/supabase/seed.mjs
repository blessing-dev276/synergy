// Dev-data seeder — creates demo admin/mentor/member accounts plus sample
// learning content. Uses the Auth Admin API + service_role client rather
// than hand-inserting into auth.users directly: Supabase explicitly
// discourages writing to that table's internals (encrypted_password format,
// etc. are undocumented and can change), so this is the supported path for
// both local (`supabase start`) and hosted projects.
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

async function upsertUser({ email, password, displayName, role }) {
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing?.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw error;
    user = data.user;
  }

  // handle_new_user already created the profile row on signup; just set role.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role, display_name: displayName, onboarding: { completed: true, interests: [], goals: [] } })
    .eq("id", user.id);
  if (profileError) throw profileError;

  if (role !== "member") {
    // Custom claims don't exist in this design (role lives in `profiles`,
    // read live by RLS) — nothing further needed for mentor/admin to work.
  }

  return user.id;
}

async function main() {
  console.log("Seeding demo users…");
  const adminUid = await upsertUser({ email: "admin@synergyteamm.com", password: "password123", displayName: "Synergy Admin", role: "admin" });
  const mentorUid = await upsertUser({ email: "mentor@synergyteamm.com", password: "password123", displayName: "Sample Mentor", role: "mentor" });
  const memberUid = await upsertUser({ email: "member@synergyteamm.com", password: "password123", displayName: "Sample Member", role: "member" });

  console.log("Assigning mentor…");
  await supabase.from("mentor_assignments").upsert(
    { mentor_uid: mentorUid, member_uid: memberUid, assigned_by: adminUid, active: true },
    { onConflict: "mentor_uid,member_uid" },
  );
  await supabase.from("profiles").update({ mentor_uid: mentorUid }).eq("id", memberUid);

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

  console.log("Seeding an assignment and a task…");
  await supabase.from("assignments").insert({
    course_id: course.id,
    title: "Build a lead follow-up workflow",
    instructions: "Create a simple 3-step follow-up workflow in your GoHighLevel sandbox and share a link or screenshot.",
    max_score: 100,
    published: true,
  });

  await supabase.from("tasks").insert({
    title: "Attend Tuesday training",
    description: "Join the weekly live training session.",
    scope: "global",
    assigned_to_uid: memberUid,
    priority: "medium",
    created_by: adminUid,
  });

  console.log("\nSeed complete. Log in with:");
  console.log("  admin@synergyteamm.com  / password123");
  console.log("  mentor@synergyteamm.com / password123");
  console.log("  member@synergyteamm.com / password123");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
