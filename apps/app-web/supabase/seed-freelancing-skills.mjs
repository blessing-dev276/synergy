// Seeds the six skills for the Freelancing tab (learning_paths.section =
// 'skill_set', label renamed from "Skill Set Training" — see PathList.jsx/
// ContentBuilder.jsx). Published immediately (not left as a draft the way
// ContentBuilder.jsx's "New Learning Path" modal always does) so they show
// up right away on both the Freelancing tab and the onboarding "Which
// skill do you want to learn?" picker (OnboardingFlow.jsx, which fetches
// this exact section/published set live).
//
// is_skill: true on all six -- that flag (0059) is what get_learning_paths
// uses to hide skill-training content from members on the "Network
// Marketing only" participation path (0043/0064), and nothing in the admin
// UI exposes a way to set it (ContentBuilder.jsx's PathModal never writes
// it, so every path created through the UI defaults to false) -- these are
// squarely freelance/skill content, so they should carry it, and a direct
// write here is the only way that happens.
//
// "Graphics Design" is deliberately titled to keep matching
// OnboardingFlow.jsx's existing compulsory-skill lookup, which finds
// whichever published skill_set path has "graphic" in its title
// (case-insensitive substring, not a hardcoded id) and force-selects it
// for every new member — no code change needed there, this just needs to
// keep satisfying that match.
//
// Idempotent: safe to re-run — an existing row (matched by title + this
// section) is left alone rather than duplicated.
//
// Usage: node supabase/seed-freelancing-skills.mjs
//   Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (already in .env) and
//   an admin account's credentials, passed via env so they're never
//   hardcoded in a committed file:
//     SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node supabase/seed-freelancing-skills.mjs
/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function readEnvVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const url = readEnvVar("VITE_SUPABASE_URL");
const anonKey = readEnvVar("VITE_SUPABASE_ANON_KEY");
const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!url || !anonKey) {
  console.error("Couldn't read VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the environment or .env.");
  process.exit(1);
}
if (!adminEmail || !adminPassword) {
  console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (an admin account) before running this.");
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const SKILLS = [
  {
    title: "Graphics Design",
    description: "Design skills for freelance and client work — logos, branding, social media graphics, and more.",
  },
  {
    title: "AI Video & Video Editing",
    description: "Edit and produce video content using modern AI-assisted tools, from short-form clips to full productions.",
  },
  {
    title: "No Code Mobile App Development",
    description: "Build functional mobile apps without writing code, using no-code/low-code platforms.",
  },
  {
    title: "Digital Marketing",
    description: "Grow a business online — social media, ads, content, and marketing fundamentals for freelancers.",
  },
  {
    title: "Writing & Translation",
    description: "Freelance writing, copywriting, and translation skills for content and language service work.",
  },
  {
    title: "Web Design",
    description: "Design and build websites for clients — layout, UI, and modern web design tools.",
  },
];

async function main() {
  console.log("Signing in as admin…");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) throw authError;
  const uid = authData.user.id;

  for (const skill of SKILLS) {
    const { data: existing, error: lookupError } = await supabase
      .from("learning_paths")
      .select("id, published, is_skill")
      .eq("title", skill.title)
      .eq("section", "skill_set")
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      console.log(`Already exists, skipping: ${skill.title}`);
      continue;
    }

    const { error: insertError } = await supabase.from("learning_paths").insert({
      title: skill.title,
      description: skill.description,
      section: "skill_set",
      is_skill: true,
      published: true,
      order_index: Math.floor(Date.now() / 1000),
      created_by: uid,
    });
    if (insertError) throw insertError;
    console.log(`Created: ${skill.title}`);
  }

  console.log("\nDone. All six Freelancing skills are seeded and published.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
