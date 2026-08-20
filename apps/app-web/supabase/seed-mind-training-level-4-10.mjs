// Content seeder for Mind Training Levels 4-10 — Discipline & Habits through
// Leadership & The Synergy Mind.
//
// Same approach and template as supabase/seed-mind-training-level-3.mjs:
// reuses the 7 existing "Level 4..10" learning_paths rows (already created
// as placeholders, unpublished, zero mind_training_levels rows -- same
// state Level 3's path was in before its own seed ran), inserts one level
// per path with a Core Lessons module (12 lessons each, sequential unlock
// via mind_training_modules.sequential, 0073), a Practical Challenge
// module, and a Final Assessment module mixing scored multiple_choice
// questions with unscored 'written' ones (0073/0074) at an 80% pass mark.
// No new migrations needed -- everything here runs on schema that already
// shipped for Level 3.
//
// Practical Challenge shape varies per level to match the source brief
// (Synergy_Team_Mind_Training_Levels_4_to_10) without inventing a field
// type the schema doesn't have (no checkboxes -- every field is "text" or
// "textarea", 0066/0070): challenges described as N discrete days (Focus,
// Emotional Intelligence, Courage) become N challenge_day activities, same
// pattern as Level 1's 7-Day Challenge; challenges described as N discrete
// attempts/actions (Resilience, Success & Money, Leadership) become N
// practical_task activities; the one 21-day tracker (Discipline) is
// compressed into 3 commitments + 3 weekly reviews rather than 21
// individual day-activities, since nothing in the schema supports a daily
// checkbox grid and 21 separate activity rows would be unusable UI.
//
// Usage: node supabase/seed-mind-training-level-4-10.mjs
//   Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (already in .env) and
//   an admin account's credentials, passed via env:
//     SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node supabase/seed-mind-training-level-4-10.mjs
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

const NEWBIE_RANK_ID = "8f1dfab1-4335-435d-8319-f35f0ceef5bd"; // same rank Levels 1-3 are attached to

function heading(text) {
  return { type: "heading", text };
}
function paragraph(text) {
  return { type: "paragraph", text };
}
function list(items, style = "bullet") {
  return { type: "list", style, items };
}
function quote(text, attribution = "") {
  return { type: "quote", text, attribution };
}
function example(text) {
  return { type: "example", text };
}

// ================= LEVEL 4 — DISCIPLINE & HABITS =================
const LEVEL4_LESSONS = [
  {
    title: "What Discipline Really Means",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Motivation gets you started. This level is about what keeps you moving once motivation inevitably leaves the room.",
    blocks: [
      heading("Discipline Is Not a Feeling"),
      paragraph(
        "Discipline is the ability to do what matters even when you don't feel like doing it. Motivation is a mood — it comes and goes depending on sleep, stress, and how the day is going. Discipline doesn't ask how you feel; it asks what you committed to.",
      ),
      heading("The Habit Loop"),
      list(["Cue — the trigger that starts the behaviour", "Routine — the behaviour itself", "Reward — what reinforces it and makes it repeat"]),
      paragraph("Small repeated actions compound over time — the loop, run often enough, becomes automatic."),
      quote("Discipline is not punishment. It is self-management."),
    ],
    practicalExercise: "Choose one important daily commitment and keep it for seven days straight. Write down what it is and why it matters before you start.",
    reflectionQuestions: ["What do I currently do only when I feel motivated?", "What important action should become non-negotiable?"],
    actionTask: "Choose one important daily commitment and keep it for seven days.",
    keyTakeaways: [
      "Discipline is reliable action aligned with your values and goals — it doesn't depend on mood.",
      "The habit loop (cue → routine → reward) is the mechanism behind every repeated behaviour, good or bad.",
      "Discipline is self-management, not self-punishment.",
    ],
  },
  {
    title: "Motivation vs Discipline",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Motivation is unreliable by nature. This lesson is about building something steadier underneath it.",
    blocks: [
      heading("Why Motivation Fails"),
      paragraph(
        "Motivation is a reaction to how you feel in the moment — excited, inspired, energized. It's real, but it's not a foundation, because feelings change constantly and without warning.",
      ),
      heading("What Discipline Provides Instead"),
      paragraph("Systems, habits and commitments create consistency that doesn't depend on your mood on any given day."),
      example("Motivated version: \"I'll work out because I feel great today.\"\nDisciplined version: \"I work out at 6am regardless of how I feel, because that's the commitment.\""),
    ],
    practicalExercise: "Create a 'minimum action' for one goal — the smallest version of the action you could still complete on a genuinely bad day.",
    reflectionQuestions: ["When has motivation failed me?", "What would I still do if I did not feel motivated?"],
    actionTask: "Create a 'minimum action' for one goal that can be completed even on a bad day.",
    keyTakeaways: [
      "Motivation is unreliable because it's a feeling, and feelings change.",
      "Systems, habits and commitments create consistency that survives a bad mood.",
      "A 'minimum action' keeps a commitment alive on the days motivation is nowhere to be found.",
    ],
  },
  {
    title: "Why We Procrastinate",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Procrastination isn't laziness. It's almost always an attempt to avoid an uncomfortable feeling.",
    blocks: [
      heading("What's Really Being Avoided"),
      paragraph("Procrastination usually traces back to one of a few feelings, not the task itself:"),
      list(["Avoidance — the task feels unpleasant", "Uncertainty — not knowing exactly how to start", "Overwhelm — the task feels too big", "Discomfort — the task risks failure, judgment or difficulty"]),
      paragraph("Once you name which feeling is actually driving the avoidance, the task itself becomes easier to approach."),
    ],
    practicalExercise: "Use the 5-minute start: pick the task you're avoiding and work on it for just five minutes, no more required.",
    reflectionQuestions: ["What task am I avoiding and what feeling am I avoiding?"],
    actionTask: "Use the 5-minute start: work on the avoided task for five minutes.",
    keyTakeaways: [
      "Procrastination is usually about avoiding a feeling — avoidance, uncertainty, overwhelm or discomfort — not the task itself.",
      "Naming the actual feeling behind the avoidance makes the task easier to start.",
      "A 5-minute start lowers the barrier enough that starting becomes possible even when finishing still feels far away.",
    ],
  },
  {
    title: "Understanding Habits",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A habit is a decision you made once that now runs on autopilot. This lesson is about seeing your own autopilot clearly.",
    blocks: [
      heading("Repetition Builds Automation"),
      paragraph(
        "Every habit — good or bad — was built the same way: a behaviour repeated often enough in response to a consistent cue that it stopped requiring conscious decision-making.",
      ),
      heading("Mapping a Habit"),
      paragraph("Any habit can be broken down into its three parts: what triggers it (cue), what you actually do (routine), and what you get from it (reward)."),
      example("Cue: Phone buzzes.\nRoutine: Open social media.\nReward: A small hit of novelty/distraction."),
    ],
    practicalExercise: "Map one of your own habits — good or bad — using cue → routine → reward.",
    reflectionQuestions: ["Which habits currently help me?", "Which habits quietly hurt me?"],
    actionTask: "Map one habit using cue → routine → reward.",
    keyTakeaways: [
      "Habits are built through repetition, which is exactly why they can also be rebuilt.",
      "Every habit has a cue, a routine and a reward — mapping your own makes the automatic visible.",
      "Some habits help quietly; others hurt quietly. Both deserve to be named, not assumed.",
    ],
  },
  {
    title: "Building Positive Habits",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A good habit that's hard to start rarely survives contact with a busy week. This lesson is about designing habits that are easy to keep.",
    blocks: [
      heading("Obvious, Easy, Repeatable"),
      paragraph("A habit sticks when it's obvious (you're reminded to do it), easy (the barrier to starting is low), and repeatable (it fits into a normal day, not just a perfect one)."),
      heading("Environment Does Half the Work"),
      paragraph("The right environment makes the desired behaviour the path of least resistance — the running shoes by the door, the book on the pillow, the guitar out of its case."),
    ],
    practicalExercise: "Design one new habit using a clear cue and the smallest possible first step.",
    reflectionQuestions: ["What environment would make my desired habit easier?"],
    actionTask: "Design one habit using a clear cue and a small first step.",
    keyTakeaways: [
      "A habit that's obvious, easy and repeatable is far more likely to survive a busy week than one built on willpower alone.",
      "Environment design does a surprising amount of the work — make the desired action the easiest one to take.",
      "Start with the smallest version of the habit. Consistency at a small size beats intensity that doesn't last.",
    ],
  },
  {
    title: "Breaking Bad Habits",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Willpower alone loses to a well-worn habit loop most of the time. Interruption works better.",
    blocks: [
      heading("Interrupt, Don't Just Resist"),
      paragraph(
        "Trying to white-knuckle your way past an established habit puts you in a fight you'll eventually lose on a tired day. It's more reliable to change the cue or replace the routine than to just resist the reward.",
      ),
      heading("Two Levers"),
      list(["Remove the trigger — make the cue harder to encounter", "Replace the routine — swap in a different behaviour that still gets you some form of the reward"]),
    ],
    practicalExercise: "Identify the trigger behind your worst habit, then remove it or replace the resulting behaviour with something healthier.",
    reflectionQuestions: ["What triggers my worst habit?", "What can I remove or replace?"],
    actionTask: "Remove one trigger and replace the behaviour with a healthier action.",
    keyTakeaways: [
      "Willpower alone is a weak strategy against an established habit loop — interruption works better.",
      "You have two real levers: remove the trigger, or replace the routine while still meeting the underlying need.",
      "Breaking a bad habit is a design problem, not just a discipline problem.",
    ],
  },
  {
    title: "The Power of Small Actions",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Tiny, repeated actions beat occasional intensity almost every time — this lesson is about why that math works.",
    blocks: [
      heading("Compounding Is Not Intuitive"),
      paragraph(
        "A small action, repeated daily, produces a result that looks unremarkable on any single day but becomes substantial over months. The mistake most people make is judging the action by one day's visible impact instead of its compounded total.",
      ),
      example("10 minutes/day of a skill × 180 days = 30 hours of deliberate practice — invisible day to day, undeniable by month six."),
    ],
    practicalExercise: "Choose one small action (10 minutes or less) and repeat it every day for seven days.",
    reflectionQuestions: ["What small action would produce a meaningful result if repeated for six months?"],
    actionTask: "Choose one 10-minute action and repeat it for seven days.",
    keyTakeaways: [
      "A small action's power is almost invisible on any single day and only becomes obvious once it compounds.",
      "The mistake is judging a small habit by one day's result instead of its total over months.",
      "Consistency at a small size is a legitimate strategy, not a lesser one.",
    ],
  },
  {
    title: "Consistency vs Intensity",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "An intense burst that burns out in a week loses to a modest pace kept for a year. This lesson makes the case for sustainable.",
    blocks: [
      heading("The All-In, Then-Nothing Pattern"),
      paragraph(
        "A common failure mode: starting a new goal at an unsustainable intensity, feeling the strain within days, and quietly abandoning it — followed by guilt, then a slower restart weeks later.",
      ),
      heading("Right-Sizing the Standard"),
      paragraph("A sustainable weekly standard, kept every week, produces more total output over a year than a series of intense starts that don't survive month one."),
    ],
    practicalExercise: "Take one goal you tend to start too aggressively, and reduce it to a standard you could sustain for a full year.",
    reflectionQuestions: ["Where do I start too aggressively and then stop?"],
    actionTask: "Reduce one goal to a sustainable weekly standard.",
    keyTakeaways: [
      "Sustainable repetition usually beats short, intense bursts over any meaningful time horizon.",
      "Starting too aggressively is a common, predictable pattern — right-sizing the standard prevents the burnout-then-guilt cycle.",
      "A standard you can actually keep every week is worth more than an ideal one you keep for three days.",
    ],
  },
  {
    title: "Keeping Promises to Yourself",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Every broken promise to yourself teaches your own mind that your word isn't reliable. This lesson is about reversing that.",
    blocks: [
      heading("Self-Trust Is Built the Same Way Trust With Others Is"),
      paragraph(
        "You wouldn't trust a friend who repeatedly said they'd show up and didn't. Your own mind works the same way — every kept commitment builds self-trust, and every broken one quietly erodes it.",
      ),
      heading("Realistic Beats Ambitious"),
      paragraph("A small promise you actually keep builds more self-trust than a big one you routinely break."),
    ],
    practicalExercise: "Make one small, realistic promise to yourself and complete it every day for seven days straight.",
    reflectionQuestions: ["What promises to myself have I repeatedly broken?", "Why?"],
    actionTask: "Make one small promise and complete it every day for seven days.",
    keyTakeaways: [
      "Self-trust is built and eroded the same way trust with another person is: kept commitments build it, broken ones erode it.",
      "A small, realistic promise kept consistently builds more self-trust than an ambitious one broken repeatedly.",
      "Repeatedly broken promises to yourself have a cost even when no one else notices.",
    ],
  },
  {
    title: "Developing Self-Control",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Self-control isn't about never wanting something — it's about the pause between wanting it and acting on it.",
    blocks: [
      heading("The Pause Is the Skill"),
      paragraph(
        "Self-control doesn't eliminate impulse. It creates a gap between the impulse and the action — a gap wide enough to actually choose instead of just reacting.",
      ),
      heading("Delayed Gratification in Practice"),
      paragraph("Every time you delay an easy reward for a better later one, you're practicing the exact muscle discipline depends on."),
    ],
    practicalExercise: "Create a 24-hour rule for one major distraction: when the urge hits, wait 24 hours before acting on it.",
    reflectionQuestions: ["What distractions most often control my attention?"],
    actionTask: "Create a 24-hour distraction rule for one major distraction.",
    keyTakeaways: [
      "Self-control is the pause between impulse and action, not the absence of impulse.",
      "Delaying gratification is a practicable skill, not a fixed trait.",
      "A simple rule (like a 24-hour delay) creates the gap where real choice becomes possible.",
    ],
  },
  {
    title: "Creating Your Daily Routine",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A routine copied from someone else's life rarely survives contact with your own. This lesson is about building one around your actual priorities.",
    blocks: [
      heading("Protect What Matters, Not What's Loud"),
      paragraph(
        "Without a deliberate routine, your day gets allocated to whatever is loudest — notifications, other people's requests, whatever feels urgent. A routine is how you protect time for what actually matters before the day claims it for something else.",
      ),
      heading("Three Blocks"),
      list(["Morning — how you start sets the tone", "Work/study — your highest-leverage hours", "Evening — how you close the day and recover"]),
    ],
    practicalExercise: "Design a simple routine with a morning block, a work/study block, and an evening block, built around your real priorities.",
    reflectionQuestions: ["Which activities deserve protected time?"],
    actionTask: "Create a morning, work/study and evening routine.",
    keyTakeaways: [
      "Without a deliberate routine, your day gets allocated to whatever is loudest, not what matters most.",
      "A routine is a protection mechanism for your priorities, not a rigid schedule to copy from someone else.",
      "Three blocks — morning, work/study, evening — is enough structure to start with.",
    ],
  },
  {
    title: "Becoming Consistent",
    estimatedMinutes: 9,
    xpReward: 15,
    intro: "The final lesson in this level is about the shift from 'doing disciplined things' to 'being a disciplined person.'",
    blocks: [
      heading("From Behaviour to Identity"),
      paragraph(
        "Every lesson in this level has been about individual behaviours — a habit, a promise, a routine. This lesson is about what happens when those behaviours accumulate into an identity: someone who is consistent, not just someone who occasionally acts consistent.",
      ),
      quote("What would a consistently disciplined version of me do?"),
      paragraph("An identity is harder to break than a single habit, because every action either confirms it or contradicts it — and confirming it gets easier over time."),
    ],
    practicalExercise: "Write three non-negotiable behaviours that reflect who you're becoming, and track them for 21 days.",
    reflectionQuestions: ["What would a consistently disciplined version of me do?"],
    actionTask: "Write three non-negotiable behaviours and track them for 21 days.",
    keyTakeaways: [
      "Discipline compounds fastest once it stops being a set of behaviours and becomes an identity.",
      "Every action either confirms or contradicts the identity you're building — the choice is always live.",
      "Three tracked non-negotiables for 21 days is the practical bridge from behaviour to identity.",
    ],
  },
];

const LEVEL4_CHALLENGE = {
  title: "21-Day Discipline Challenge",
  instructions: [
    paragraph(
      "Choose three daily commitments you'll hold yourself to for 21 days. Each week, come back here and write an honest review: what you completed, what you missed, and what you'll adjust.",
    ),
  ],
  fields: [
    { key: "commitment1", label: "Commitment #1", type: "text" },
    { key: "commitment2", label: "Commitment #2", type: "text" },
    { key: "commitment3", label: "Commitment #3", type: "text" },
    { key: "week1_review", label: "Week 1 review — what did you complete, what did you miss, what will you adjust?", type: "textarea" },
    { key: "week2_review", label: "Week 2 review — what did you complete, what did you miss, what will you adjust?", type: "textarea" },
    { key: "week3_review", label: "Week 3 review — what did you complete, what did you miss, what will you adjust?", type: "textarea" },
  ],
};

const LEVEL4_MC = [
  { prompt: "What does discipline mean in this level's terms?", options: ["Punishing yourself for mistakes", "Doing what matters even when you don't feel like it", "Never feeling unmotivated", "Following someone else's schedule exactly"], correctIndex: 1 },
  { prompt: "Why is motivation considered unreliable?", options: ["It never happens", "It's a feeling that changes with mood, sleep and circumstances", "It only affects beginners", "It's the same as discipline"], correctIndex: 1 },
  { prompt: "What are the three parts of the habit loop?", options: ["Start, middle, end", "Cue, routine, reward", "Plan, act, review", "Trigger, effort, result"], correctIndex: 1 },
  { prompt: "Procrastination is most accurately described as:", options: ["Pure laziness", "An attempt to avoid an uncomfortable feeling like overwhelm or uncertainty", "A permanent character trait", "Something that only affects unimportant tasks"], correctIndex: 1 },
  { prompt: "What is a 'minimum action'?", options: ["The maximum effort you can give", "The smallest version of an action you could still complete on a bad day", "An action you skip if unmotivated", "A once-a-year task"], correctIndex: 1 },
  { prompt: "According to this level, which usually beats short bursts of intensity?", options: ["Nothing, intensity always wins", "Sustainable, consistent repetition", "Waiting for motivation", "Doing everything at once"], correctIndex: 1 },
  { prompt: "What are the two main levers for breaking a bad habit?", options: ["Willpower and punishment", "Removing the trigger or replacing the routine", "Ignoring it and hoping it fades", "Telling other people about it"], correctIndex: 1 },
  { prompt: "Why does keeping small promises to yourself matter?", options: ["It doesn't, only big goals matter", "It builds self-trust, the same way keeping promises to others builds trust", "It's required for social approval", "It has no effect on discipline"], correctIndex: 1 },
  { prompt: "Self-control is best described as:", options: ["Never feeling an impulse", "The pause between impulse and action that creates room to choose", "Suppressing all desire permanently", "A trait some people are simply born with"], correctIndex: 1 },
  { prompt: "What is the shift this level's final lesson describes?", options: ["From identity to behaviour", "From behaviour to identity — becoming a consistently disciplined person", "From discipline to motivation", "From habits to willpower"], correctIndex: 1 },
];

const LEVEL4_WRITTEN = [
  "Describe the one important daily commitment you chose in Lesson 1 and how the week went.",
  "What is your 'minimum action' for one of your current goals — the version you could complete even on a bad day?",
  "Name one bad habit you're working on breaking, its trigger, and what you're replacing it with.",
  "What does your ideal daily routine (morning, work/study, evening) actually look like?",
  "Write your three non-negotiable behaviours from Lesson 12 and how you'll track them.",
];

// ================= LEVEL 5 — FOCUS, PRODUCTIVITY & EXECUTION =================
const LEVEL5_LESSONS = [
  {
    title: "The Cost of Distraction",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Knowing what to do is useless if you can't execute — and distraction is the single biggest thing standing between the two.",
    blocks: [
      heading("Interruptions Cost More Than They Seem To"),
      paragraph(
        "Every switch away from a task and back carries a hidden cost — the time it takes your attention to fully re-engage. A handful of small interruptions can quietly erase an hour of real focus.",
      ),
      paragraph("Productivity isn't about filling every hour. It's about directing attention toward outcomes that actually matter."),
    ],
    practicalExercise: "Track every distraction that pulls your attention away for one full day. Just notice — don't try to fix anything yet.",
    reflectionQuestions: ["What steals the most attention from me?"],
    actionTask: "Track distractions for one day.",
    keyTakeaways: [
      "Productivity means directing attention toward meaningful outcomes, not filling every available hour.",
      "Every interruption has a hidden re-engagement cost beyond the interruption itself.",
      "You can't fix what you haven't measured — tracking distraction is the first real step.",
    ],
  },
  {
    title: "Focus vs Multitasking",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Multitasking feels efficient and rarely is. This lesson is about the real cost of switching between tasks.",
    blocks: [
      heading("Switching, Not Multiplying"),
      paragraph(
        "The brain doesn't run two demanding tasks in parallel — it switches rapidly between them, and each switch has friction. What feels like doing two things at once is usually doing both worse.",
      ),
      example("Writing a report while responding to messages doesn't produce two finished things faster — it produces a slower report and shallower replies."),
    ],
    practicalExercise: "Complete one 30-minute session on a single task with every other input closed or silenced.",
    reflectionQuestions: ["When do I multitask most?", "What quality suffers?"],
    actionTask: "Complete one 30-minute single-task session.",
    keyTakeaways: [
      "Multitasking is task-switching with friction, not true parallel work.",
      "The cost of multitasking shows up as reduced quality, not just reduced speed.",
      "A single-task session is a deliberate contrast worth actually feeling once.",
    ],
  },
  {
    title: "Managing Your Attention",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Attention is a limited resource, the same way time or money is — this lesson treats it that way.",
    blocks: [
      heading("A Budget, Not a Bottomless Well"),
      paragraph("Your attention has a peak, a decline, and periods where it's simply not available for demanding work. Ignoring this pattern means fighting your own biology instead of working with it."),
      heading("Find Your Peak"),
      paragraph("Most people have a window — often earlier in the day — where focus comes easiest. Protecting that window for the highest-leverage work is one of the cheapest productivity gains available."),
    ],
    practicalExercise: "Identify your most focused time of day, and protect one block of it this week for your most important work.",
    reflectionQuestions: ["What time of day am I most focused?"],
    actionTask: "Protect one daily focus block.",
    keyTakeaways: [
      "Attention is a limited resource with real peaks and declines across a day.",
      "Working with your natural focus pattern is easier than fighting it.",
      "Protecting your peak window for your most important work is a high-leverage, low-effort change.",
    ],
  },
  {
    title: "Time Management",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Most people don't actually know where their time goes until they look. This lesson starts with looking.",
    blocks: [
      heading("You Can't Manage What You Haven't Measured"),
      paragraph("A time audit — a simple log of how hours were actually spent — routinely surprises people who were confident they knew."),
      paragraph("Planning time around priorities, instead of around whatever shows up, is what turns a calendar into a tool instead of a record."),
    ],
    practicalExercise: "Log how you actually spend today's hours, then redesign tomorrow's schedule around your real priorities.",
    reflectionQuestions: ["Where does my time actually go?"],
    actionTask: "Create a simple time audit and redesign tomorrow.",
    keyTakeaways: [
      "A time audit almost always reveals a gap between where you think your time goes and where it actually goes.",
      "Planning around priorities beats reacting to whatever shows up.",
      "Redesigning tomorrow based on today's audit is the practical next step, not a one-time exercise.",
    ],
  },
  {
    title: "Prioritisation",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Not everything on your list deserves equal attention. This lesson is about deciding what goes first.",
    blocks: [
      heading("The Three-Task Filter"),
      paragraph(
        "A useful constraint: if you could only complete three things today, what would they be? Everything else becomes secondary by definition, which makes the day's real priorities much easier to see.",
      ),
    ],
    practicalExercise: "Choose the three outcomes that matter most for today, before anything else goes on your list.",
    reflectionQuestions: ["If I could complete only three tasks today, what would they be?"],
    actionTask: "Choose the day's top three outcomes.",
    keyTakeaways: [
      "A hard constraint (only three things) forces real prioritisation instead of an endless list.",
      "Prioritisation is a decision made in advance, not something figured out reactively as the day unfolds.",
      "The three-task filter works because it makes trade-offs explicit instead of hidden.",
    ],
  },
  {
    title: "The 80/20 Principle",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A small number of activities usually produce most of your results. This lesson is about finding yours.",
    blocks: [
      heading("Disproportionate Results"),
      paragraph(
        "In most areas of effort, a minority of actions account for a majority of the outcome. Identifying that minority and doing more of it is often more effective than simply working harder across everything equally.",
      ),
      example("For a freelancer: a handful of proposal templates and client types might account for most of the paid work — everything else is noise around the edges."),
    ],
    practicalExercise: "For one current goal, identify the roughly 20% of actions that are producing most of your progress.",
    reflectionQuestions: ["Which activities produce most of my progress?"],
    actionTask: "Identify the top 20% of actions for one goal.",
    keyTakeaways: [
      "A minority of activities typically produce a majority of results — the 80/20 pattern shows up almost everywhere.",
      "Finding your disproportionate actions is often more valuable than simply working harder overall.",
      "This isn't a reason to abandon the other 80% — it's a reason to make sure the top 20% gets protected first.",
    ],
  },
  {
    title: "Important vs Urgent",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Urgent things scream. Important things wait quietly — and get postponed indefinitely if you let them.",
    blocks: [
      heading("Reaction Mode"),
      paragraph(
        "A day spent entirely responding to what's urgent (messages, requests, fires) can feel productive while making zero progress on what's actually important — the work that doesn't have a deadline screaming at you today but matters more in six months.",
      ),
    ],
    practicalExercise: "Identify one important but not urgent task you've been postponing, and schedule a specific time for it.",
    reflectionQuestions: ["What important work keeps being postponed?"],
    actionTask: "Schedule one important non-urgent task.",
    keyTakeaways: [
      "Urgent and important are different axes — a day full of urgent tasks can still make zero important progress.",
      "Important work rarely announces itself with a deadline, which is exactly why it gets postponed.",
      "Scheduling important work deliberately is the only reliable way it gets done.",
    ],
  },
  {
    title: "Deep Work",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Some work simply can't be done well in fragments. This lesson is about protecting the conditions that make it possible.",
    blocks: [
      heading("Uninterrupted Concentration"),
      paragraph(
        "Deep work is the ability to focus without distraction on a demanding task. It produces a different quality of output than the same hours spent in fragments between notifications.",
      ),
      paragraph("It's a trainable capacity — most people's ability to sustain deep focus has atrophied from constant switching, and it comes back with practice."),
    ],
    practicalExercise: "Complete one 45-minute block of fully distraction-free work on a task that deserves real concentration.",
    reflectionQuestions: ["What task deserves deep concentration?"],
    actionTask: "Complete a 45-minute distraction-free block.",
    keyTakeaways: [
      "Deep work produces a different quality of output than the same hours spent in fragments.",
      "The capacity for sustained focus is trainable — it atrophies with constant switching and returns with practice.",
      "Not every task needs deep work, but the ones that do won't get done well any other way.",
    ],
  },
  {
    title: "Eliminating Time Wasters",
    estimatedMinutes: 7,
    xpReward: 10,
    intro: "Some activities cost a lot of time and return very little. This lesson is about spotting and cutting them.",
    blocks: [
      heading("Low Value, High Cost"),
      paragraph(
        "Not every low-value activity feels like wasted time while you're doing it — some are genuinely relaxing, others are just habitual. The test isn't how it feels; it's whether the actual value matches the actual time spent.",
      ),
    ],
    practicalExercise: "Identify one activity that consumes real time for little real value, and limit or remove it for seven days.",
    reflectionQuestions: ["Which activity gives me little value but consumes much time?"],
    actionTask: "Remove or limit one time waster for seven days.",
    keyTakeaways: [
      "A time waster isn't defined by how it feels in the moment — it's defined by the mismatch between time spent and value returned.",
      "Removing or limiting one time waster for a week is a low-risk way to test its real cost.",
      "This is different from rest, which is genuinely valuable — the target is low-value, not low-effort.",
    ],
  },
  {
    title: "Beating Procrastination",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A vague task is easy to avoid. A specific next action is much harder to keep avoiding.",
    blocks: [
      heading("Vague Tasks Invite Avoidance"),
      paragraph(
        "\"Work on the project\" is vague enough to postpone indefinitely. \"Open the document and write the first paragraph\" is specific enough to actually start.",
      ),
      paragraph("The smallest next action is the antidote to a task that's been sitting untouched because it never got broken down."),
    ],
    practicalExercise: "Identify the smallest possible next action on something you've been avoiding, and use a 10-minute start to begin it.",
    reflectionQuestions: ["What is the smallest next action?"],
    actionTask: "Use a 10-minute start and finish the first action.",
    keyTakeaways: [
      "Vague tasks are easy to postpone; specific next actions are much harder to avoid.",
      "Breaking a task down into its smallest next action is often the real fix for procrastination.",
      "A 10-minute start lowers the barrier to beginning without demanding the whole task get finished.",
    ],
  },
  {
    title: "Creating an Execution System",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Goals, weekly priorities and daily actions need to connect — this lesson is about building that connection deliberately.",
    blocks: [
      heading("The Missing Link"),
      paragraph(
        "It's common to have a clear goal and a busy daily schedule that somehow don't connect — the daily tasks were never actually derived from the goal, they just accumulated.",
      ),
      paragraph("An execution system closes that gap: the goal breaks into weekly priorities, and the weekly priorities break into daily actions."),
    ],
    practicalExercise: "Build a weekly plan that's explicitly linked to one major goal — every priority on it should trace back to that goal.",
    reflectionQuestions: ["Do my daily tasks clearly connect to my goals?"],
    actionTask: "Build a weekly plan linked to one major goal.",
    keyTakeaways: [
      "A busy schedule and a clear goal can coexist without actually connecting to each other.",
      "An execution system is the deliberate link from goal → weekly priorities → daily actions.",
      "A weekly plan should be traceable back to a real goal, not just a list of accumulated tasks.",
    ],
  },
  {
    title: "Finishing What You Start",
    estimatedMinutes: 9,
    xpReward: 15,
    intro: "This level's final lesson is about completion — the habit that turns effort into results other people can actually see.",
    blocks: [
      heading("Started, Not Finished"),
      paragraph(
        "Unfinished projects have a quiet cost: they occupy mental space, they don't produce results, and starting something new on top of them just adds to the pile.",
      ),
      paragraph("Finishing is a professional habit, separate from talent or even effort — some genuinely skilled people rarely finish, and some average performers finish reliably and build a track record because of it."),
    ],
    practicalExercise: "Identify one overdue, unfinished task and complete it before you allow yourself to start anything new and non-essential.",
    reflectionQuestions: ["What have I started but not finished?", "Why?"],
    actionTask: "Finish one overdue task before starting a new non-essential project.",
    keyTakeaways: [
      "Unfinished work has a quiet ongoing cost, even when it's not actively being worked on.",
      "Finishing is a separate, learnable habit — distinct from talent, and arguably more valuable.",
      "A rule against starting new non-essential work before finishing old work protects your track record.",
    ],
  },
];

function buildLevel5Days() {
  const days = [];
  for (let i = 1; i <= 7; i++) {
    days.push({
      title: `Day ${i} — Focus Challenge`,
      instructions: [paragraph(i === 1 ? "Choose one major outcome for the week and hold onto it — each day, pick three priority tasks that serve it." : "Keep the same major outcome from Day 1 in mind as you set today's priorities.")],
      fields: [
        { key: "priority1", label: "Priority task #1", type: "text" },
        { key: "priority2", label: "Priority task #2", type: "text" },
        { key: "priority3", label: "Priority task #3", type: "text" },
        { key: "focus_block", label: "Protected focus block (when, how long)", type: "text" },
        { key: "review", label: "End-of-day review — what worked, what didn't", type: "textarea" },
      ],
    });
  }
  days[0].fields.unshift({ key: "major_outcome", label: "This week's major outcome", type: "text" });
  return days;
}

const LEVEL5_MC = [
  { prompt: "According to this level, productivity means:", options: ["Filling every hour with activity", "Directing attention toward meaningful outcomes", "Working the longest hours possible", "Avoiding all breaks"], correctIndex: 1 },
  { prompt: "What actually happens when you 'multitask' on demanding work?", options: ["The brain does both tasks in true parallel", "The brain rapidly switches between tasks, with friction each time", "Multitasking always improves speed and quality", "Nothing changes compared to single-tasking"], correctIndex: 1 },
  { prompt: "Why protect your peak attention window?", options: ["It doesn't matter when you work", "Attention has natural peaks and declines, and peak time is your highest-leverage time", "Peak time should be used for email only", "Everyone's peak window is the same time of day"], correctIndex: 1 },
  { prompt: "What is a time audit used for?", options: ["Punishing yourself for wasted time", "Seeing where your time actually goes, since most people are wrong about it", "Filling out for your manager only", "Replacing the need for goals"], correctIndex: 1 },
  { prompt: "The 80/20 principle suggests:", options: ["All actions produce equal results", "A minority of actions typically produce a majority of results", "You should only ever do 20% of your work", "80% of people are unproductive"], correctIndex: 1 },
  { prompt: "What's the key difference between urgent and important?", options: ["They always mean the same thing", "Urgent demands attention now; important matters long-term and rarely announces itself with a deadline", "Important tasks are always urgent too", "Urgent tasks are never worth doing"], correctIndex: 1 },
  { prompt: "Deep work is best defined as:", options: ["Any work done at a desk", "Uninterrupted concentration on a demanding task", "Working overtime", "Multitasking efficiently"], correctIndex: 1 },
  { prompt: "How should a 'time waster' be identified?", options: ["By how relaxing it feels", "By the mismatch between time spent and actual value returned", "By whether other people approve of it", "Any break counts as a time waster"], correctIndex: 1 },
  { prompt: "Why does breaking a task into its smallest next action help beat procrastination?", options: ["It doesn't help at all", "A vague task is easy to postpone; a specific next action is much harder to avoid starting", "It makes the task take longer", "It only works for simple tasks"], correctIndex: 1 },
  { prompt: "What connects a goal to a person's daily actions in an execution system?", options: ["Nothing needs to connect them", "The goal breaks into weekly priorities, which break into daily actions", "Only the calendar app matters", "Daily actions should be chosen at random"], correctIndex: 1 },
];

const LEVEL5_WRITTEN = [
  "What did tracking your distractions in Lesson 1 reveal about where your attention actually goes?",
  "Describe your protected daily focus block — when it is and what you use it for.",
  "What is the 20% of actions producing most of your progress on one current goal?",
  "Describe one important-but-not-urgent task you scheduled, and when you'll do it.",
  "What is one task you finished this week that you'd previously been avoiding?",
];

// Module-scope (not nested inside main()) so both main() (Levels 4-5) and
// seedLevels6to10() (Levels 6-10) can call the same helper.
async function seedLevel({ pathId, levelTitle, levelDescription, milestoneKey, milestoneTitle, milestoneIcon, milestoneDescription, lessons, challengeModuleTitle, challengeModuleDescription, challengeActivities, assessmentTitle, mcQuestions, writtenQuestions }) {
    console.log(`\n=== ${levelTitle} ===`);
    const { data: level, error: levelError } = await supabase
      .from("mind_training_levels")
      .insert({
        path_id: pathId,
        title: levelTitle,
        description: levelDescription,
        milestone_key: milestoneKey,
        milestone_title: milestoneTitle,
        milestone_icon: milestoneIcon,
        milestone_description: milestoneDescription,
        order_index: 1,
        published: true,
      })
      .select()
      .single();
    if (levelError) throw levelError;
    const LEVEL_ID = level.id;

    async function createModule(title, description, orderIndex, sequential = false) {
      const { data, error } = await supabase
        .from("mind_training_modules")
        .insert({ level_id: LEVEL_ID, title, description, order_index: orderIndex, published: true, sequential })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const moduleCore = await createModule("Core Lessons", `Twelve lessons on this level's core theme.`, 1, true);
    const moduleChallenge = await createModule(challengeModuleTitle, challengeModuleDescription, 2);
    const moduleAssessment = await createModule("Final Assessment", `${assessmentTitle} — knowledge questions plus practical responses.`, 3);

    console.log("Inserting 12 lessons…");
    for (const [i, lesson] of lessons.entries()) {
      const { error } = await supabase.from("mind_training_lessons").insert({
        module_id: moduleCore.id,
        level_id: LEVEL_ID,
        path_id: pathId,
        title: `Lesson ${i + 1} — ${lesson.title}`,
        order_index: i + 1,
        published: true,
        intro: lesson.intro,
        content_blocks: lesson.blocks,
        practical_exercise: lesson.practicalExercise,
        reflection_questions: lesson.reflectionQuestions,
        action_task: lesson.actionTask,
        key_takeaways: lesson.keyTakeaways,
        estimated_minutes: lesson.estimatedMinutes,
        xp_reward: lesson.xpReward,
      });
      if (error) throw error;
      console.log(`  Lesson ${i + 1} — ${lesson.title}`);
    }

    console.log(`Inserting ${challengeActivities.length} challenge activities…`);
    for (const [i, act] of challengeActivities.entries()) {
      const { error } = await supabase.from("mind_training_activities").insert({
        module_id: moduleChallenge.id,
        title: act.title,
        instructions: act.instructions ?? [paragraph(act.description ?? "")],
        order_index: i + 1,
        published: true,
        category: act.category ?? "practical_task",
        is_required: act.isRequired ?? true,
        xp_reward: act.xpReward ?? 10,
        input_fields: act.fields,
      });
      if (error) throw error;
      console.log(`  ${act.title}`);
    }

    console.log("Creating the final assessment…");
    const { data: assessment, error: assessmentError } = await supabase
      .from("mind_training_assessments")
      .insert({ module_id: moduleAssessment.id, title: assessmentTitle, pass_score_percent: 80, xp_reward: 50 })
      .select()
      .single();
    if (assessmentError) throw assessmentError;

    console.log(`Inserting ${mcQuestions.length} multiple-choice questions…`);
    for (const [i, q] of mcQuestions.entries()) {
      const { data: question, error: qError } = await supabase
        .from("mind_training_assessment_questions")
        .insert({ assessment_id: assessment.id, prompt: q.prompt, question_type: "multiple_choice", order_index: i + 1 })
        .select()
        .single();
      if (qError) throw qError;
      const optionRows = q.options.map((text, idx) => ({ question_id: question.id, text, is_correct: idx === q.correctIndex, order_index: idx + 1 }));
      const { error: oError } = await supabase.from("mind_training_assessment_options").insert(optionRows);
      if (oError) throw oError;
    }

    console.log(`Inserting ${writtenQuestions.length} written questions…`);
    for (const [i, prompt] of writtenQuestions.entries()) {
      const { error: wError } = await supabase.from("mind_training_assessment_questions").insert({
        assessment_id: assessment.id,
        prompt,
        question_type: "written",
        order_index: mcQuestions.length + i + 1,
      });
      if (wError) throw wError;
    }

    console.log("Publishing the path…");
    const { error: pathError } = await supabase.from("learning_paths").update({ published: true }).eq("id", pathId);
    if (pathError) throw pathError;

    return LEVEL_ID;
}

async function main() {
  console.log("Signing in as admin…");
  const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) throw authError;

  // ---------- Level 4 ----------
  await seedLevel({
    pathId: "f949a411-2e7e-40c0-ad26-3ac1d06b48bf",
    levelTitle: "Level 4 — Discipline & Habits",
    levelDescription: "Motivation gets you started. Discipline keeps you moving.",
    milestoneKey: "disciplined_mind",
    milestoneTitle: "Disciplined Mind",
    milestoneIcon: "🏆",
    milestoneDescription: "You've built the systems and self-trust that keep you moving long after motivation runs out.",
    lessons: LEVEL4_LESSONS,
    challengeModuleTitle: "21-Day Discipline Challenge",
    challengeModuleDescription: "Choose three daily commitments, track completion, record misses and write a weekly review.",
    challengeActivities: [{ ...LEVEL4_CHALLENGE, xpReward: 30 }],
    assessmentTitle: "Discipline & Habits Assessment",
    mcQuestions: LEVEL4_MC,
    writtenQuestions: LEVEL4_WRITTEN,
  });

  // ---------- Level 5 ----------
  await seedLevel({
    pathId: "1e9fa306-ffd9-4e6b-80d8-416f792f9fb8",
    levelTitle: "Level 5 — Focus, Productivity & Execution",
    levelDescription: "Knowing what to do is useless if you cannot execute.",
    milestoneKey: "execution_mode",
    milestoneTitle: "Execution Mode",
    milestoneIcon: "🏆",
    milestoneDescription: "You've learned to direct your attention deliberately and turn priorities into finished work.",
    lessons: LEVEL5_LESSONS,
    challengeModuleTitle: "7-Day Focus Challenge",
    challengeModuleDescription: "Choose one major outcome, three priority tasks per day, one protected focus block and an end-of-day review.",
    challengeActivities: buildLevel5Days().map((d) => ({ title: d.title, instructions: d.instructions, category: "challenge_day", xpReward: 10, fields: d.fields })),
    assessmentTitle: "Focus & Execution Assessment",
    mcQuestions: LEVEL5_MC,
    writtenQuestions: LEVEL5_WRITTEN,
  });

  console.log("\nLevels 4-5 seeded. Continuing with Levels 6-10 in the same run…");
  await seedLevels6to10();

  console.log("\nAttaching all seven paths to the Newbie rank (adding to its existing list, not replacing it)…");
  const { data: currentRankPaths, error: rlpError } = await supabase.from("rank_learning_paths").select("learning_path_id").eq("rank_id", NEWBIE_RANK_ID);
  if (rlpError) throw rlpError;
  const newPathIds = [
    "f949a411-2e7e-40c0-ad26-3ac1d06b48bf",
    "1e9fa306-ffd9-4e6b-80d8-416f792f9fb8",
    "3551e587-9ead-40f2-9971-5f987d82cbe1",
    "dd33183e-b13a-4eac-ab33-24aa31ff5045",
    "f26c4a21-f3b7-4476-87ab-e4b6b083b443",
    "f103930e-312f-4a88-a05b-e57156f77d7c",
    "f3dc54f8-b2d5-4b25-9bc6-f168ae6a4054",
  ];
  const nextPathIds = Array.from(new Set([...(currentRankPaths ?? []).map((r) => r.learning_path_id), ...newPathIds]));
  const { error: setError } = await supabase.rpc("admin_set_rank_learning_paths", { p_rank_id: NEWBIE_RANK_ID, p_learning_path_ids: nextPathIds });
  if (setError) throw setError;

  console.log("\nDone. Levels 4-10 are fully seeded, published and attached to the Newbie rank.");
}

// ================= LEVELS 6-10 =================
// Defined as a separate function (rather than inline in main) purely to
// keep this already-very-long file scannable -- same seedLevel() helper,
// same shape, called from main() above.
async function seedLevels6to10() {
  // ---------- Level 6 — Failure, Rejection & Resilience ----------
  const LEVEL6_LESSONS = [
    { title: "Understanding Failure", estimatedMinutes: 8, xpReward: 10, intro: "Failure is information, not identity. This level starts by separating the two.", blocks: [heading("An Outcome, Not a Verdict"), paragraph("Failure, rejection and setbacks are unavoidable parts of learning and growth. The goal isn't to enjoy failure — it's to extract the information in it, recover emotionally, improve the strategy, and continue."), example("Cycle: attempt → result → review → lesson → adjustment → next attempt.")], practicalExercise: "Write a neutral, fact-only description of one recent setback — no judgment, just what happened.", reflectionQuestions: ["What did a recent failure reveal?"], actionTask: "Write a neutral description of one setback.", keyTakeaways: ["Failure is an outcome that can be mined for information, not a verdict on who you are.", "The attempt → result → review → lesson → adjustment → next attempt cycle is the practical engine behind resilience.", "A neutral, fact-only description of a setback is easier to actually learn from than an emotional one."] },
    { title: "Failure Is Feedback", estimatedMinutes: 7, xpReward: 10, intro: "Every failure carries a lesson buried under the emotion. This lesson is about digging past the emotion to reach it.", blocks: [heading("Separate the Signal From the Sting"), paragraph("The emotional reaction to a setback is real and worth acknowledging — but underneath it is usually a specific, changeable variable that explains what happened.")], practicalExercise: "Complete a failure review: what happened, what variable was actually within your control, and what you'll change.", reflectionQuestions: ["What variable can I actually change?"], actionTask: "Complete a failure review.", keyTakeaways: ["Emotion and information are both present in a failure, but they need to be separated to be useful.", "There's almost always a specific, controllable variable inside a setback, even when it doesn't feel that way at first.", "A failure review turns a raw reaction into an actual lesson."] },
    { title: "Rejection Is Not Identity", estimatedMinutes: 8, xpReward: 10, intro: "\"No\" is an answer to a specific ask. It is not a verdict on your worth.", blocks: [heading("Two Very Different Sentences"), paragraph("There's a real difference between \"they said no\" and \"I am not good enough.\" The first is an event. The second is an identity built out of one data point."), quote("A 'no' is information about this offer, this timing, this person — not a referendum on you.")], practicalExercise: "Take one rejection you took personally and rewrite it as neutral, useful information.", reflectionQuestions: ["What rejection have I taken personally?"], actionTask: "Rewrite the rejection as useful information.", keyTakeaways: ["A rejection is an event, not an identity — the two get confused constantly.", "One 'no' is one data point, not a pattern and not a verdict.", "Rewriting a rejection as information instead of judgment changes what you do with it next."] },
    { title: "How Successful People Handle Failure", estimatedMinutes: 8, xpReward: 10, intro: "The difference between people who keep going and people who stop usually isn't the number of failures — it's what they do right after one.", blocks: [heading("Persistence, Review, Adaptation"), paragraph("People who sustain long-term success tend to share a pattern: they feel the setback, review it honestly, adapt the approach, and move to the next attempt quickly — not never feeling failure, just not staying stuck in it.")], practicalExercise: "Before this lesson ends, choose your next attempt at something you recently didn't succeed at.", reflectionQuestions: ["What would a resilient person do next?"], actionTask: "Choose the next attempt before the lesson ends.", keyTakeaways: ["Resilient people aren't failure-proof — they're fast at moving from setback to next attempt.", "The pattern is persistence, honest review, and adaptation, in that order.", "Choosing the next attempt immediately (not eventually) is a practiced habit, not a personality trait."] },
    { title: "Learning From Mistakes", estimatedMinutes: 7, xpReward: 10, intro: "A mistake that keeps recurring is teaching you something you haven't listened to yet.", blocks: [heading("Patterns, Not Incidents"), paragraph("A single mistake is a data point. A recurring mistake is a pattern — and patterns are diagnosable in a way single incidents aren't.")], practicalExercise: "Identify one mistake that keeps recurring, and create one specific rule to prevent it next time.", reflectionQuestions: ["What mistake keeps recurring?"], actionTask: "Create one prevention rule.", keyTakeaways: ["A recurring mistake is a pattern worth diagnosing, not just repeating apologies for.", "A specific prevention rule is more useful than a general intention to 'do better.'", "Patterns are visible in hindsight — the discipline is going looking for them."] },
    { title: "Developing Resilience", estimatedMinutes: 8, xpReward: 10, intro: "Resilience isn't never getting knocked down. It's having a reliable way back up.", blocks: [heading("A Recovery Routine"), paragraph("Difficult periods are inevitable. What varies between people is whether they have a deliberate way to recover — specific actions that reliably help, identified in advance rather than improvised in the moment.")], practicalExercise: "Build a personal recovery checklist — three to five things that reliably help you recover from a hard setback.", reflectionQuestions: ["What helps me recover constructively?"], actionTask: "Create a personal recovery checklist.", keyTakeaways: ["Resilience is built through a deliberate recovery routine, not raw toughness.", "Identifying what helps you recover in advance is more reliable than improvising in a hard moment.", "A short, specific checklist beats a vague intention to 'bounce back.'"] },
    { title: "Handling Disappointment", estimatedMinutes: 7, xpReward: 10, intro: "Disappointment is allowed. Letting it make your decisions for you is the part worth watching.", blocks: [heading("Feel It, Then Decide"), paragraph("Suppressing disappointment doesn't make it disappear — it usually resurfaces later, worse. The skill isn't avoiding the feeling; it's not letting the feeling make the next decision on your behalf.")], practicalExercise: "Write an expectation/reality review: what you expected, what actually happened, and the gap between them.", reflectionQuestions: ["What did I expect versus what happened?"], actionTask: "Write an expectation/reality review.", keyTakeaways: ["Disappointment is a legitimate feeling to have, not a problem to suppress.", "The goal is separating the feeling from the decision that follows it.", "An expectation/reality review makes the actual gap visible instead of just the emotional reaction to it."] },
    { title: "Staying Consistent When Results Are Slow", estimatedMinutes: 8, xpReward: 10, intro: "Outcomes lag effort more often than people expect. This lesson is about staying steady through the lag.", blocks: [heading("Inputs You Control, Outputs You Don't"), paragraph("You can control your effort, consistency and quality of work. You can't directly control the timing of the result. Tracking the inputs keeps you grounded while waiting for outputs that are genuinely out of your hands in the short term.")], practicalExercise: "Track your process metrics — the inputs you actually control — for seven days, regardless of results.", reflectionQuestions: ["Which inputs can I control?"], actionTask: "Track process metrics for seven days.", keyTakeaways: ["Outcomes often lag effort — that lag isn't evidence the effort isn't working.", "Controllable inputs (effort, consistency, quality) are worth tracking even when outputs are still invisible.", "Staying consistent through a slow period is exactly where most people quit too early."] },
    { title: "Turning Problems Into Lessons", estimatedMinutes: 7, xpReward: 10, intro: "A recurring problem is diagnostic information about your system, not just bad luck repeating itself.", blocks: [heading("What Is This Problem Teaching Me?"), paragraph("Treating a problem purely as an obstacle to push through skips the more useful question: what does this problem reveal about a gap in the system producing it?")], practicalExercise: "Take one current problem and write one lesson it's teaching you, plus one system change it suggests.", reflectionQuestions: ["What is this problem teaching me about my system?"], actionTask: "Write one lesson and one system change.", keyTakeaways: ["A recurring problem is diagnostic — it's telling you something about the system that produced it.", "Pushing through a problem without asking what it reveals wastes the information inside it.", "One lesson plus one system change turns a problem into an improvement, not just a memory."] },
    { title: "Getting Back Up", estimatedMinutes: 7, xpReward: 10, intro: "The time between a setback and your next constructive action is one of the most trainable parts of resilience.", blocks: [heading("Shrinking the Gap"), paragraph("Everyone gets knocked down. What varies widely is how long people stay down — and that gap between setback and next action is something you can deliberately shorten with practice.")], practicalExercise: "The next time a setback happens, take one useful action within 24 hours of it — however small.", reflectionQuestions: ["How long do I usually stay stuck?"], actionTask: "Take one useful action within 24 hours of a setback.", keyTakeaways: ["The gap between setback and constructive action is a trainable, shrinkable thing — not a fixed trait.", "A 24-hour rule creates urgency without demanding you feel fully recovered first.", "Getting back up faster is a skill, practiced one setback at a time."] },
    { title: "Developing Grit", estimatedMinutes: 8, xpReward: 10, intro: "Grit is sustained commitment to something worthwhile — not the same thing as stubbornly refusing to adjust.", blocks: [heading("Persistence With Judgment"), paragraph("Grit isn't blind persistence regardless of evidence. It's long-term commitment to a worthwhile goal, combined with the willingness to adjust the approach — the two aren't in conflict, they work together.")], practicalExercise: "Define, in writing, the conditions under which you'll keep persisting on a goal — and the conditions under which you'll adjust the approach.", reflectionQuestions: ["What worthwhile goal deserves sustained effort?"], actionTask: "Define the conditions under which you will persist and when you will adjust.", keyTakeaways: ["Grit is sustained commitment combined with willingness to adjust — not stubbornness.", "Defining persist-vs-adjust conditions in advance prevents both premature quitting and pointless stubbornness.", "A worthwhile goal is one that still matters to you when you write down honestly why."] },
    { title: "The Power of Persistence", estimatedMinutes: 9, xpReward: 15, intro: "This level closes with persistence redefined: not brute repetition, but repeated, intelligent effort.", blocks: [heading("Intelligent, Not Just Repeated"), paragraph("Persistence that never learns from its own attempts is just repetition. Real persistence carries the lessons from every previous attempt forward into the next one — which is exactly what this level's cycle (attempt → result → review → lesson → adjustment → next attempt) has been building toward all along.")], practicalExercise: "Choose one goal that deserves another serious attempt, and write your next-attempt plan using everything this level covered.", reflectionQuestions: ["What goal deserves another serious attempt?"], actionTask: "Make a next-attempt plan.", keyTakeaways: ["Persistence without learning is just repetition — real persistence carries lessons forward.", "The attempt → result → review → lesson → adjustment → next attempt cycle is the whole engine of this level.", "A next-attempt plan is where everything in this level becomes actionable again."] },
  ];
  const LEVEL6_CHALLENGE = [];
  for (let i = 1; i <= 5; i++) {
    LEVEL6_CHALLENGE.push({
      title: `Attempt ${i} — Resilience Challenge`,
      instructions: [paragraph("Deliberately attempt something where rejection or failure is genuinely possible — a real ask, a real pitch, a real try.")],
      fields: [
        { key: "attempt", label: "What did you attempt?", type: "text" },
        { key: "result", label: "Result", type: "textarea" },
        { key: "lesson", label: "Lesson", type: "textarea" },
        { key: "adjustment", label: "Adjustment", type: "textarea" },
        { key: "next_attempt", label: "Next attempt", type: "textarea" },
      ],
    });
  }
  const LEVEL6_MC = [
    { prompt: "What is failure best understood as, according to this level?", options: ["Proof of personal inadequacy", "An outcome that can provide information", "Something to avoid discussing", "A permanent state"], correctIndex: 1 },
    { prompt: "What is the resilience cycle taught in this level?", options: ["Attempt → give up", "Attempt → result → review → lesson → adjustment → next attempt", "Result → blame → repeat", "Plan → wait → hope"], correctIndex: 1 },
    { prompt: "What is the key difference between 'I failed' and 'I am a failure'?", options: ["No real difference", "One describes an event, the other builds an identity out of it", "Both are equally accurate", "Neither is useful"], correctIndex: 1 },
    { prompt: "What pattern do resilient people tend to share?", options: ["They never fail", "They review honestly, adapt, and move to the next attempt quickly", "They avoid taking any risks", "They ignore all feedback"], correctIndex: 1 },
    { prompt: "A recurring mistake is best treated as:", options: ["Bad luck", "A pattern worth diagnosing with a specific prevention rule", "Proof you should quit", "Something to ignore"], correctIndex: 1 },
    { prompt: "What is a 'recovery routine'?", options: ["Avoiding all difficult situations", "A deliberate, identified-in-advance set of actions that help you recover from setbacks", "A one-time fix", "The same as denial"], correctIndex: 1 },
    { prompt: "What should you do with disappointment, according to this level?", options: ["Suppress it entirely", "Feel it, then avoid letting it dictate your next decision", "Let it decide everything", "Pretend it doesn't exist"], correctIndex: 1 },
    { prompt: "Why track controllable inputs even when results are slow?", options: ["Inputs don't matter, only outcomes do", "You can control effort/consistency/quality even when outcome timing is out of your hands", "Tracking is pointless during slow periods", "It guarantees fast results"], correctIndex: 1 },
    { prompt: "What does 'grit' mean in this level's terms?", options: ["Stubbornly refusing to ever change approach", "Sustained commitment combined with willingness to adjust the approach", "Avoiding all risk", "A fixed personality trait"], correctIndex: 1 },
    { prompt: "What is the difference between persistence and mere repetition?", options: ["There is no difference", "Persistence carries lessons from each attempt forward; repetition doesn't learn", "Repetition is always superior", "Persistence means never adjusting"], correctIndex: 1 },
  ];
  const LEVEL6_WRITTEN = [
    "Describe one recent setback using the neutral, fact-only description from Lesson 1.",
    "What variable inside a recent failure was actually within your control?",
    "Describe your personal recovery checklist from Lesson 6.",
    "What is one recurring mistake you've identified, and your prevention rule for it?",
    "Write your next-attempt plan for one goal that deserves another serious try.",
  ];
  await seedLevel({
    pathId: "3551e587-9ead-40f2-9971-5f987d82cbe1",
    levelTitle: "Level 6 — Failure, Rejection & Resilience",
    levelDescription: "Failure is information.",
    milestoneKey: "resilient_mind",
    milestoneTitle: "Resilient Mind",
    milestoneIcon: "🏆",
    milestoneDescription: "You've learned to separate outcomes from identity and turn setbacks into your next useful attempt.",
    lessons: LEVEL6_LESSONS,
    challengeModuleTitle: "Resilience Challenge",
    challengeModuleDescription: "Complete five deliberate attempts where rejection or failure is possible; after each, record result, lesson, adjustment and next attempt.",
    challengeActivities: LEVEL6_CHALLENGE,
    assessmentTitle: "Failure & Resilience Assessment",
    mcQuestions: LEVEL6_MC,
    writtenQuestions: LEVEL6_WRITTEN,
  });

  // ---------- Level 7 — Emotional Intelligence ----------
  const LEVEL7_LESSONS = [
    { title: "Understanding Emotions", estimatedMinutes: 8, xpReward: 10, intro: "Emotions aren't the enemy of good decisions — ignored emotions are.", blocks: [heading("Signals, Not Noise"), paragraph("Emotional intelligence doesn't mean suppressing feelings. It means noticing them, understanding what they're signalling, and then choosing your behaviour deliberately instead of being run by the feeling automatically.")], practicalExercise: "The next time a strong emotion shows up today, pause and name it before you act on it.", reflectionQuestions: ["What emotions appear most often in my difficult situations?"], actionTask: "Name the emotion before acting.", keyTakeaways: ["Emotional intelligence means noticing and understanding feelings, not suppressing them.", "Emotions are signals worth reading, not noise to override.", "Naming an emotion before acting creates the same useful pause self-control depends on."] },
    { title: "Emotional Awareness", estimatedMinutes: 7, xpReward: 10, intro: "Emotions announce themselves physically before they're fully conscious — this lesson is about catching the early signal.", blocks: [heading("Body Before Mind"), paragraph("Tight shoulders, a racing heart, shallow breathing — the body often registers stress before the mind has named it. Noticing the early physical signal gives you more room to respond deliberately.")], practicalExercise: "Keep a one-day log of emotions as they arise, noting the physical signal that came with each one.", reflectionQuestions: ["How does stress show up in me?"], actionTask: "Keep a one-day emotion log.", keyTakeaways: ["Physical and mental signals often arrive together, and the physical one can come first.", "A one-day emotion log builds the habit of noticing before reacting.", "Catching the early signal gives you more choice in how you respond."] },
    { title: "Emotional Triggers", estimatedMinutes: 8, xpReward: 10, intro: "The same few situations tend to produce your strongest reactions, over and over. Mapping them removes their surprise factor.", blocks: [heading("Trigger → Response"), paragraph("A trigger map connects the situations that reliably provoke a strong reaction to the response that usually follows — once mapped, the pattern is far easier to interrupt.")], practicalExercise: "Build a trigger → response map for the two or three situations that reliably provoke your strongest reactions.", reflectionQuestions: ["What situations trigger me most?"], actionTask: "Create a trigger → response map.", keyTakeaways: ["A small number of situations usually account for most of your strongest reactions.", "Mapping trigger → response removes the surprise element and creates room to choose differently.", "This is diagnostic work, not judgment — the goal is clarity, not guilt."] },
    { title: "Self-Control", estimatedMinutes: 7, xpReward: 10, intro: "Between a feeling and an action, there's a gap — self-control is what happens in that gap.", blocks: [heading("Pause, Breathe, Choose"), paragraph("A simple routine — pause, breathe, then choose the response — creates just enough space between an emotional trigger and your reaction for a more deliberate choice to happen.")], practicalExercise: "Use the pause-breathe-choose routine the next time you feel a strong reaction building.", reflectionQuestions: ["What reaction do I regret most often?"], actionTask: "Use a pause-breathe-choose routine.", keyTakeaways: ["Self-control lives in the gap between feeling and action, not in never feeling.", "A simple pause-breathe-choose routine is enough to widen that gap in the moment.", "Regretted reactions are usually the ones taken without any gap at all."] },
    { title: "Managing Anger", estimatedMinutes: 8, xpReward: 10, intro: "Anger almost always builds before it peaks — this lesson is about noticing the build.", blocks: [heading("De-Escalation Starts Before the Peak"), paragraph("There's usually a recognizable build-up before anger peaks — a tightening, a specific phrase, a rising volume. Catching it early makes de-escalation far easier than trying to manage it at the peak.")], practicalExercise: "Build a personal anger de-escalation plan based on what typically happens right before your anger peaks.", reflectionQuestions: ["What usually happens before my anger peaks?"], actionTask: "Create an anger de-escalation plan.", keyTakeaways: ["Anger has a recognizable build-up before it peaks — that build-up is the best window for de-escalation.", "A concrete de-escalation plan is more useful than a vague intention to 'stay calm.'", "Communicating the underlying need is usually more effective than expressing the anger itself."] },
    { title: "Managing Fear", estimatedMinutes: 7, xpReward: 10, intro: "Fear is useful information about risk — it's a poor decision-maker when it's the only voice in the room.", blocks: [heading("Notice It, Don't Just Obey It"), paragraph("Fear deserves to be heard — it often points at something real. But automatically obeying it, every time, means every uncomfortable decision defaults to avoidance.")], practicalExercise: "Identify one safe, reasonable action you'd take if fear weren't making the decision, and take it.", reflectionQuestions: ["What action would I take if fear were not making the decision?"], actionTask: "Take one safe, constructive action despite fear.", keyTakeaways: ["Fear is a signal worth listening to, not a decision-maker to blindly obey.", "Automatic avoidance driven by fear compounds over time into a much smaller comfort zone.", "One safe action taken despite fear is real, practicable evidence that fear isn't always right."] },
    { title: "Managing Pressure", estimatedMinutes: 8, xpReward: 10, intro: "Pressure feels like one big weight. It's usually a mix of controllable and uncontrollable factors tangled together.", blocks: [heading("Separate to Manage"), paragraph("Pulling apart what's actually controllable from what isn't, inside a pressured situation, turns an overwhelming feeling into a specific, workable list.")], practicalExercise: "Under one current source of pressure, list what's controllable and what isn't, separately.", reflectionQuestions: ["What pressure is controllable and what is not?"], actionTask: "Separate controllable from uncontrollable factors.", keyTakeaways: ["Pressure often feels monolithic but is usually a mix of controllable and uncontrollable parts.", "Separating the two turns overwhelm into a workable list.", "Planning and recovery beat panic as a response to pressure."] },
    { title: "Responding vs Reacting", estimatedMinutes: 7, xpReward: 10, intro: "A reaction is automatic. A response is chosen. The gap between them is where emotional intelligence actually lives.", blocks: [heading("Values-Aligned, Not Just Fast"), paragraph("A reaction happens without a decision. A response reflects a decision, even a quick one — chosen in line with your values rather than driven purely by the immediate feeling.")], practicalExercise: "The next time a difficult moment calls for a response, delay it until you're calm enough to choose deliberately.", reflectionQuestions: ["What is my default reaction under stress?"], actionTask: "Delay one difficult response until calm.", keyTakeaways: ["A reaction is automatic; a response is chosen — the distinction matters more than it sounds.", "Delaying a response until calm is a simple, repeatable way to convert a reaction into a response.", "Knowing your default reaction under stress is the first step to choosing something different."] },
    { title: "Empathy", estimatedMinutes: 8, xpReward: 10, intro: "Empathy means understanding someone's experience — not necessarily agreeing with their conclusion.", blocks: [heading("Understanding Without Automatic Agreement"), paragraph("It's possible to fully understand why someone feels the way they do and still disagree with what they want to do about it. Conflating the two — thinking understanding requires agreement — makes empathy feel riskier than it is.")], practicalExercise: "In one real conversation, deliberately practice seeing the situation from the other person's side before responding.", reflectionQuestions: ["What might the other person be experiencing?"], actionTask: "Practice perspective-taking in one conversation.", keyTakeaways: ["Empathy is understanding, not automatic agreement — the two are often conflated.", "Perspective-taking is a practicable skill, not just a personality trait.", "Genuine understanding usually improves a conversation even when the underlying disagreement remains."] },
    { title: "Understanding Other People", estimatedMinutes: 7, xpReward: 10, intro: "Assumptions about other people are often wrong, and they're rarely tested — this lesson is about testing one.", blocks: [heading("Ask Instead of Assume"), paragraph("A clarifying question, asked instead of an assumption made, routinely reveals context that changes how a situation reads entirely.")], practicalExercise: "In place of an assumption you'd normally make about someone, ask one clarifying question instead.", reflectionQuestions: ["What assumptions do I make about people?"], actionTask: "Ask one clarifying question instead of assuming.", keyTakeaways: ["Assumptions about other people are common and rarely tested against reality.", "A clarifying question often reveals context an assumption would have missed entirely.", "Noticing context, style and needs is a skill that improves every relationship it's applied to."] },
    { title: "Active Listening", estimatedMinutes: 7, xpReward: 10, intro: "Listening to understand and listening to reply are different activities that feel similar in the moment.", blocks: [heading("Listen → Paraphrase → Respond"), paragraph("Mentally preparing your reply while someone else is still talking means you're not actually listening to them — you're waiting for your turn. Paraphrasing what you heard before responding forces real listening.")], practicalExercise: "In one conversation today, use listen → paraphrase → respond before offering your own view.", reflectionQuestions: ["Do I interrupt or mentally rehearse replies?"], actionTask: "Use paraphrasing in one conversation.", keyTakeaways: ["Listening to reply and listening to understand are different activities, easy to confuse.", "Paraphrasing what you heard is a concrete way to force real listening.", "This one habit builds trust faster than most communication advice."] },
    { title: "Emotional Maturity", estimatedMinutes: 9, xpReward: 15, intro: "This level closes with the integration point: taking responsibility for your behaviour and communicating honestly about it.", blocks: [heading("Owning the Behaviour, Not Just the Feeling"), paragraph("Emotional maturity is what all the earlier lessons in this level converge into: noticing feelings, understanding triggers, choosing responses deliberately, and being willing to own the impact of your behaviour on other people honestly.")], practicalExercise: "Identify one boundary, apology or honest conversation you currently need to have, and write out what you'll actually say.", reflectionQuestions: ["Where do I need more emotional responsibility?"], actionTask: "Write one boundary, apology or honest conversation you need to have.", keyTakeaways: ["Emotional maturity integrates everything else in this level: awareness, triggers, self-control, empathy.", "Taking responsibility for behaviour's impact on others is part of emotional intelligence, not separate from it.", "A boundary, apology or honest conversation, written out in advance, is far more likely to actually happen."] },
  ];
  const LEVEL7_DAYS = [];
  for (let i = 1; i <= 7; i++) {
    LEVEL7_DAYS.push({
      title: `Day ${i} — Trigger/Response Journal`,
      instructions: [paragraph("Note one real trigger and your response today. On at least three days this week, practice pausing before you react.")],
      fields: [
        { key: "trigger", label: "Trigger", type: "textarea" },
        { key: "response", label: "Your response", type: "textarea" },
        { key: "paused_first", label: "Did you pause before reacting? What happened?", type: "textarea" },
      ],
    });
  }
  const LEVEL7_MC = [
    { prompt: "What does emotional intelligence mean, according to this level?", options: ["Suppressing all feelings", "Noticing feelings, understanding them, and choosing behaviour deliberately", "Never feeling anger or fear", "Only caring about your own feelings"], correctIndex: 1 },
    { prompt: "Where do physical/mental signals of an emotion typically show up relative to the feeling itself?", options: ["Never, emotions have no physical component", "Often early, before the emotion is fully conscious", "Always after you've already reacted", "Only in extreme emotions"], correctIndex: 1 },
    { prompt: "What is a trigger → response map used for?", options: ["Avoiding all triggering situations forever", "Identifying situations that reliably produce strong reactions, to interrupt the pattern", "Blaming other people for your reactions", "Nothing useful"], correctIndex: 1 },
    { prompt: "Self-control is best created through:", options: ["Never feeling an impulse", "A pause between feeling and action, such as pause-breathe-choose", "Suppressing anger permanently", "Avoiding all difficult situations"], correctIndex: 1 },
    { prompt: "What's the recommended approach to anger?", options: ["Ignore it until it goes away", "Notice the build-up before the peak and de-escalate early", "Express it at full intensity always", "Never acknowledge feeling angry"], correctIndex: 1 },
    { prompt: "How should fear be treated?", options: ["Always obeyed automatically", "Noticed and considered, without automatically dictating the decision", "Completely ignored", "Treated as always wrong"], correctIndex: 1 },
    { prompt: "What's the difference between responding and reacting?", options: ["No difference", "A response is chosen and values-aligned; a reaction is automatic", "Reacting is always better", "Responding means staying silent"], correctIndex: 1 },
    { prompt: "Empathy means:", options: ["Always agreeing with the other person", "Understanding someone's experience, without requiring agreement", "Ignoring your own feelings entirely", "Only applying to close friends"], correctIndex: 1 },
    { prompt: "What does active listening (listen → paraphrase → respond) prevent?", options: ["Nothing in particular", "Mentally rehearsing your reply instead of actually listening", "Ever disagreeing with someone", "Long conversations"], correctIndex: 1 },
    { prompt: "Emotional maturity, per this level, includes:", options: ["Avoiding all difficult conversations", "Taking responsibility for your behaviour's impact and communicating honestly", "Never apologizing", "Suppressing feelings around others"], correctIndex: 1 },
  ];
  const LEVEL7_WRITTEN = [
    "Describe your trigger → response map from Lesson 3.",
    "Describe your personal anger de-escalation plan from Lesson 5.",
    "What is your default reaction under stress, and what response would you rather choose?",
    "Describe one conversation where you practiced perspective-taking or active listening this week.",
    "Write the boundary, apology or honest conversation you identified in Lesson 12.",
  ];
  await seedLevel({
    pathId: "dd33183e-b13a-4eac-ab33-24aa31ff5045",
    levelTitle: "Level 7 — Emotional Intelligence",
    levelDescription: "Control your emotions before they control your decisions.",
    milestoneKey: "emotionally_intelligent",
    milestoneTitle: "Emotionally Intelligent",
    milestoneIcon: "🏆",
    milestoneDescription: "You've learned to notice, understand and choose your responses deliberately, instead of being run by reaction.",
    lessons: LEVEL7_LESSONS,
    challengeModuleTitle: "Emotional Intelligence Challenge",
    challengeModuleDescription: "Keep a seven-day trigger/response journal and practice pausing before reacting in at least three difficult situations.",
    challengeActivities: LEVEL7_DAYS.map((d) => ({ title: d.title, instructions: d.instructions, category: "challenge_day", xpReward: 10, fields: d.fields })),
    assessmentTitle: "Emotional Intelligence Assessment",
    mcQuestions: LEVEL7_MC,
    writtenQuestions: LEVEL7_WRITTEN,
  });

  // ---------- Level 8 — Confidence, Courage & Communication ----------
  const LEVEL8_LESSONS = [
    { title: "What Confidence Really Is", estimatedMinutes: 8, xpReward: 10, intro: "Confidence built through action holds up under pressure. Confidence built on nothing doesn't.", blocks: [heading("Trust, Not Fearlessness"), paragraph("Confidence is a skill developed through evidence and repeated action, not permanent fearlessness. It's trust in your ability to respond and learn — not certainty that nothing will go wrong.")], practicalExercise: "List five pieces of real evidence that you're capable of learning and adapting when something is new or hard.", reflectionQuestions: ["Where do I already have evidence of competence?"], actionTask: "List five pieces of evidence that you can learn and adapt.", keyTakeaways: ["Confidence is trust in your ability to respond and learn, not the absence of fear.", "It's built through evidence and repeated action, not declared into existence.", "You almost certainly already have more evidence of competence than you're crediting yourself with."] },
    { title: "Confidence vs Arrogance", estimatedMinutes: 7, xpReward: 10, intro: "Confidence and arrogance can look similar from the outside and are almost opposite underneath.", blocks: [heading("How You Handle Being Wrong"), paragraph("Arrogance struggles to admit error because it's tied to being right. Genuine confidence can say \"I don't know yet\" without it feeling like a threat, because it isn't tied to always being right.")], practicalExercise: "Practice saying 'I don't know yet' in a real situation where it's actually true.", reflectionQuestions: ["How do I respond when I am wrong?"], actionTask: "Practice saying 'I don't know yet' when appropriate.", keyTakeaways: ["Confidence and arrogance both look self-assured but respond very differently to being wrong.", "'I don't know yet' is a confident sentence, not a weak one.", "Self-belief that requires constant validation from being right is fragile, not strong."] },
    { title: "Building Self-Belief", estimatedMinutes: 7, xpReward: 10, intro: "Self-belief is built the same way any other capability is: through small, completed commitments.", blocks: [heading("Evidence Beats Affirmation"), paragraph("Repeating positive statements to yourself has limited effect compared to actually doing something small, completing it, and having real evidence you can point to.")], practicalExercise: "Complete one deliberately small task that builds evidence in a specific skill area.", reflectionQuestions: ["What skill can I build evidence in?"], actionTask: "Complete one deliberately small competence-building task.", keyTakeaways: ["Self-belief is built through completed commitments, not repeated affirmations.", "Small, deliberately chosen tasks are the fastest way to generate real evidence.", "The task should be small enough to actually finish — completion is the point."] },
    { title: "Overcoming Fear", estimatedMinutes: 8, xpReward: 10, intro: "Approaching discomfort gradually works better than either avoiding it entirely or forcing a huge leap.", blocks: [heading("Gradual, Not Reckless"), paragraph("Overcoming fear rarely means one dramatic confrontation — it usually means a series of reasonable, incrementally larger steps toward the thing that's uncomfortable.")], practicalExercise: "Take one reasonable step — not the biggest possible one — toward something you've been avoiding out of fear.", reflectionQuestions: ["What am I avoiding because of fear?"], actionTask: "Take one reasonable step toward the avoided action.", keyTakeaways: ["Fear is usually best approached gradually, not through one dramatic confrontation.", "A reasonable next step is more sustainable than an all-or-nothing leap.", "Avoidance compounds — each avoided step makes the next one feel bigger."] },
    { title: "Fear of Rejection", estimatedMinutes: 7, xpReward: 10, intro: "Rejection is a normal, frequent part of communication and business — not a rare catastrophe.", blocks: [heading("Normalizing 'No'"), paragraph("Most people who succeed at asking for things also get told no, regularly. What makes them different isn't a higher success rate — it's that they kept asking anyway.")], practicalExercise: "Make one respectful ask today where a genuine 'no' is a real possible outcome.", reflectionQuestions: ["What does rejection actually mean?"], actionTask: "Make one respectful ask where a no is possible.", keyTakeaways: ["Rejection is a normal, frequent part of asking for anything worthwhile.", "Success at asking things usually correlates with volume of asks, not avoidance of rejection.", "One respectful ask, made despite the risk of no, builds real evidence rejection is survivable."] },
    { title: "Fear of Failure", estimatedMinutes: 8, xpReward: 10, intro: "The imagined downside of failure is almost always worse than the realistic one.", blocks: [heading("The Realistic Downside"), paragraph("Catastrophic thinking inflates the actual cost of failing at something. Naming the realistic downside — specifically, honestly — usually reveals it's survivable and often reversible.")], practicalExercise: "Define a safe, low-cost experiment for something you've been avoiding due to fear of failure.", reflectionQuestions: ["What is the realistic downside?"], actionTask: "Define a safe experiment.", keyTakeaways: ["Catastrophic thinking about failure is usually inflated compared to the realistic downside.", "Naming the realistic (not imagined) downside often makes an action feel much safer to attempt.", "A safe experiment lets you test the waters without needing full certainty first."] },
    { title: "Speaking With Confidence", estimatedMinutes: 8, xpReward: 10, intro: "Structure, pace and clarity are learnable skills — confidence when speaking is mostly a byproduct of practicing them.", blocks: [heading("Practice, Not Personality"), paragraph("Nervousness before speaking is common and doesn't disqualify anyone from becoming a clear, confident communicator — it's a skill built through repetition, like any other.")], practicalExercise: "Record yourself giving a two-minute explanation of a topic you know well, then listen back once.", reflectionQuestions: ["What makes me nervous when speaking?"], actionTask: "Record a two-minute explanation of a topic.", keyTakeaways: ["Speaking confidence is a trainable skill, not a fixed personality trait.", "Structure, pace and clarity improve with deliberate practice.", "Recording and reviewing yourself is uncomfortable and genuinely effective."] },
    { title: "Communicating Clearly", estimatedMinutes: 7, xpReward: 10, intro: "Clarity is a form of respect for the other person's time and attention.", blocks: [heading("Simple and Direct"), paragraph("Over-explaining and vagueness both tend to come from the same place: uncertainty about the message. Getting clear on what you actually mean, first, makes the message itself simpler.")], practicalExercise: "Take one message you've written that came out complicated, and rewrite it clearly.", reflectionQuestions: ["Where do I over-explain or become vague?"], actionTask: "Rewrite one complicated message clearly.", keyTakeaways: ["Over-explaining and vagueness often both trace back to unclear thinking, not just poor wording.", "Clear, direct language respects the other person's time.", "Confirming understanding is part of clear communication, not an extra step."] },
    { title: "Asking Better Questions", estimatedMinutes: 7, xpReward: 10, intro: "Good questions uncover what assumptions would have missed entirely.", blocks: [heading("Discover, Don't Assume"), paragraph("Open-ended questions, prepared in advance, consistently surface information that a default assumption would have skipped past.")], practicalExercise: "Prepare five genuinely open-ended questions before a real upcoming conversation.", reflectionQuestions: ["What information am I missing?"], actionTask: "Prepare five open-ended questions for a real conversation.", keyTakeaways: ["Good questions are prepared in advance, not improvised on the spot.", "Open-ended questions uncover information assumptions would have skipped.", "Curiosity, expressed as a real question, builds trust faster than a confident guess."] },
    { title: "Listening to Understand", estimatedMinutes: 7, xpReward: 10, intro: "Attention, given fully, is one of the most underrated ways to build trust with anyone.", blocks: [heading("Attention Builds Trust"), paragraph("People notice, consciously or not, when they're actually being listened to versus being half-heard while someone waits for their turn to speak.")], practicalExercise: "In one conversation, use listen → paraphrase → respond before offering your own view.", reflectionQuestions: ["How often do I listen without preparing my reply?"], actionTask: "Use the listen → paraphrase → respond method.", keyTakeaways: ["Full attention, given consistently, is one of the fastest ways to build trust.", "People can tell the difference between being heard and being half-heard.", "Listen → paraphrase → respond forces genuine listening instead of just waiting for a turn."] },
    { title: "Handling Criticism", estimatedMinutes: 8, xpReward: 10, intro: "Useful feedback and a personal attack can sound similar in the moment — separating them is a skill worth building.", blocks: [heading("Extract the Actionable Part"), paragraph("Even poorly delivered feedback usually contains one genuinely useful, actionable point buried inside it. Finding that point — separate from the delivery or the sting — is what turns criticism into improvement.")], practicalExercise: "Take one piece of feedback you've resisted, and extract one specific, actionable point from it.", reflectionQuestions: ["What feedback have I resisted?"], actionTask: "Extract one actionable point from feedback.", keyTakeaways: ["Useful feedback and personal attack can feel similar but aren't the same thing.", "Most feedback, even poorly delivered, contains at least one genuinely actionable point.", "Extracting that point is a skill separate from managing the emotional sting of receiving criticism."] },
    { title: "Developing Courage", estimatedMinutes: 9, xpReward: 15, intro: "This level closes with courage defined not as fearlessness, but as a practice you repeat until it's reliable.", blocks: [heading("A Repeatable Practice"), paragraph("Courage means acting despite discomfort — and like every other skill in this level, it becomes more reliable the more often it's practiced, not less scary in advance but more manageable in the moment.")], practicalExercise: "Complete a personal seven-day courage challenge, choosing one uncomfortable-but-worthwhile action each day.", reflectionQuestions: ["What would I do if I trusted myself to handle the outcome?"], actionTask: "Complete a seven-day courage challenge.", keyTakeaways: ["Courage is acting despite discomfort, not the absence of discomfort.", "Like confidence, it becomes more reliable with repeated practice, not less.", "Trusting yourself to handle whatever outcome follows is often the real barrier, more than the action itself."] },
  ];
  const LEVEL8_CHALLENGE = [];
  for (let i = 1; i <= 7; i++) {
    LEVEL8_CHALLENGE.push({
      title: `Action ${i} — Courage Challenge`,
      instructions: [paragraph("Choose one reasonable action today that creates productive discomfort — speaking up, asking, presenting, outreach, giving feedback, or trying something new.")],
      fields: [
        { key: "action", label: "What did you do?", type: "textarea" },
        { key: "felt_like", label: "How did it feel beforehand and during?", type: "textarea" },
        { key: "learned", label: "What did you learn?", type: "textarea" },
      ],
    });
  }
  const LEVEL8_MC = [
    { prompt: "Confidence, as defined in this level, is:", options: ["Permanent fearlessness", "A skill developed through evidence and repeated action", "The same thing as arrogance", "Something you either have or don't"], correctIndex: 1 },
    { prompt: "What's the key difference between confidence and arrogance?", options: ["No difference", "Confidence can admit 'I don't know yet' without it feeling threatening; arrogance struggles to", "Arrogance is more effective", "Confidence never admits mistakes either"], correctIndex: 1 },
    { prompt: "How is self-belief best built?", options: ["Through repeated affirmations alone", "Through small, completed commitments that generate real evidence", "By avoiding all challenges", "It can't be built, only inherited"], correctIndex: 1 },
    { prompt: "The recommended approach to overcoming fear is:", options: ["One dramatic confrontation", "Gradual, incrementally larger steps", "Avoiding the fear entirely, forever", "Waiting until the fear disappears on its own"], correctIndex: 1 },
    { prompt: "What does this level say about rejection?", options: ["It should always be avoided", "It's a normal, frequent part of communication and business", "It means the person is a failure", "It never happens to successful people"], correctIndex: 1 },
    { prompt: "Catastrophic thinking about failure usually:", options: ["Accurately predicts the real downside", "Inflates the downside beyond the realistic risk", "Has no effect on decisions", "Only affects unsuccessful people"], correctIndex: 1 },
    { prompt: "What does clear communication require, per this level?", options: ["Long, detailed explanations always", "Simple, direct language and confirming understanding", "Avoiding all questions", "Speaking as fast as possible"], correctIndex: 1 },
    { prompt: "Why prepare open-ended questions in advance?", options: ["They rarely help", "They uncover information a default assumption would miss", "Only for job interviews", "To avoid listening to the answer"], correctIndex: 1 },
    { prompt: "What does 'listen → paraphrase → respond' prevent?", options: ["Nothing useful", "Preparing your reply instead of actually listening", "Long conversations", "Ever disagreeing"], correctIndex: 1 },
    { prompt: "How should feedback be handled?", options: ["Always dismissed if it stings", "By extracting the actionable point, separate from delivery or emotional sting", "Only accepted from people you already agree with", "Ignored entirely"], correctIndex: 1 },
  ];
  const LEVEL8_WRITTEN = [
    "List the five pieces of evidence of your own competence from Lesson 1.",
    "Describe the respectful ask you made in Lesson 5, and what happened.",
    "Describe your two-minute recorded explanation from Lesson 7 — what did you notice listening back?",
    "What actionable point did you extract from a piece of feedback you'd previously resisted?",
    "Summarize your seven-day courage challenge — what did you do, and what did you learn?",
  ];
  await seedLevel({
    pathId: "f26c4a21-f3b7-4476-87ab-e4b6b083b443",
    levelTitle: "Level 8 — Confidence, Courage & Communication",
    levelDescription: "Confidence is built through action.",
    milestoneKey: "courageous_communicator",
    milestoneTitle: "Courageous Communicator",
    milestoneIcon: "🏆",
    milestoneDescription: "You've built confidence through evidence, practiced courage deliberately, and sharpened how you speak and listen.",
    lessons: LEVEL8_LESSONS,
    challengeModuleTitle: "Courage Challenge",
    challengeModuleDescription: "Complete seven reasonable actions that create productive discomfort — speaking, asking, presenting, outreach, feedback or trying something new.",
    challengeActivities: LEVEL8_CHALLENGE,
    assessmentTitle: "Confidence & Communication Assessment",
    mcQuestions: LEVEL8_MC,
    writtenQuestions: LEVEL8_WRITTEN,
  });

  // ---------- Level 9 — Success, Money & Abundance Mindset ----------
  const LEVEL9_LESSONS = [
    { title: "What Does Success Mean?", estimatedMinutes: 8, xpReward: 10, intro: "Most people are running someone else's definition of success without ever having chosen it deliberately.", blocks: [heading("Beyond Social Comparison"), paragraph("Success, left undefined, quietly defaults to whatever the people around you seem to value — a house, a title, a number. Defining it intentionally is the first real step toward building a life that actually fits.")], practicalExercise: "Write your own personal definition of success, separate from what you've absorbed from other people.", reflectionQuestions: ["Whose definition of success am I following?"], actionTask: "Write your personal definition of success.", keyTakeaways: ["Left undefined, success defaults to social comparison, not personal intention.", "A deliberately written definition is the foundation for every other lesson in this level.", "This isn't about lowering ambition — it's about aiming it at something actually yours."] },
    { title: "Defining Your Own Success", estimatedMinutes: 7, xpReward: 10, intro: "\"Enough\" is a number and a feeling most people have never actually specified.", blocks: [heading("Success Criteria"), paragraph("Aligning success with your actual values and desired lifestyle requires specifying what \"enough\" looks like — otherwise the target keeps moving indefinitely.")], practicalExercise: "Create five specific success criteria that reflect what would genuinely feel like enough.", reflectionQuestions: ["What would enough look like?"], actionTask: "Create five success criteria.", keyTakeaways: ["An unspecified target keeps moving, which guarantees the feeling of never arriving.", "Success criteria should align with your actual values, not an inherited script.", "Five specific criteria are more useful than one vague aspiration."] },
    { title: "Scarcity vs Abundance", estimatedMinutes: 8, xpReward: 10, intro: "Scarcity and abundance are decision-making patterns, not descriptions of how much actually exists.", blocks: [heading("A Pattern, Not a Fact"), paragraph("Scarcity thinking assumes there's never enough — opportunity, money, time — and makes decisions defensively as a result. Abundance thinking looks for what can still be created, without ignoring real constraints.")], practicalExercise: "Rewrite one limiting 'there is never enough' assumption into a testable opportunity question.", reflectionQuestions: ["Where do I think in 'there is never enough' terms?"], actionTask: "Rewrite one limiting assumption into a testable opportunity question.", keyTakeaways: ["Scarcity and abundance are decision-making patterns, not objective facts about the world.", "Scarcity thinking makes decisions defensively; abundance thinking looks for what can be created.", "Neither pattern should ignore real constraints — abundance thinking isn't wishful thinking."] },
    { title: "Money Mindset", estimatedMinutes: 8, xpReward: 10, intro: "Most beliefs about money were absorbed early, rarely chosen, and rarely examined since.", blocks: [heading("Inherited Beliefs"), paragraph("Beliefs about earning, spending and saving usually came from family, culture and early experience — not deliberate choice. Some of them still serve you. Some quietly don't.")], practicalExercise: "List three beliefs about money you picked up growing up, and evaluate honestly whether each one actually helps you now.", reflectionQuestions: ["What did I learn about money growing up?"], actionTask: "List three money beliefs and evaluate whether they help.", keyTakeaways: ["Most money beliefs are inherited, not chosen — which is exactly why they're worth examining.", "Some inherited beliefs are useful and some quietly work against you.", "Evaluating a belief's actual usefulness matters more than whether it feels familiar."] },
    { title: "Value Creation", estimatedMinutes: 7, xpReward: 10, intro: "Money comes from creating or exchanging value, not from wanting money harder.", blocks: [heading("Solve a Real Problem"), paragraph("Income tracks with the value delivered to someone else — a problem genuinely solved, a need genuinely met. Connecting a skill to a specific problem it addresses is the practical starting point.")], practicalExercise: "Identify one valuable skill you have and one specific customer problem it addresses.", reflectionQuestions: ["What problem can I solve well?"], actionTask: "Identify one valuable skill and one customer problem it addresses.", keyTakeaways: ["Money is downstream of value creation, not a direct function of wanting it.", "Connecting a specific skill to a specific problem is the practical unit of value creation.", "This reframes 'how do I make more money' into 'what problem can I solve better.'"] },
    { title: "Income vs Wealth", estimatedMinutes: 8, xpReward: 10, intro: "Earning money and building financial capacity are related but genuinely different goals.", blocks: [heading("Two Different Games"), paragraph("Income is what comes in. Wealth is the capacity that remains and compounds — skills, savings, assets, relationships. Focusing on income alone leaves the compounding part untouched.")], practicalExercise: "Create a simple plan that increases skill, income and financial discipline together, not just income alone.", reflectionQuestions: ["Do I focus only on income?"], actionTask: "Create a simple plan to increase skill, income and financial discipline.", keyTakeaways: ["Income and wealth are related but different — one is what comes in, the other is what compounds.", "Focusing on income alone leaves financial capacity-building untouched.", "A plan that addresses skill, income and discipline together is more durable than one addressing income alone."] },
    { title: "Delayed Gratification", estimatedMinutes: 7, xpReward: 10, intro: "The tradeoff between immediate pleasure and long-term goals shows up constantly, in small decisions.", blocks: [heading("Small Trades, Compounded"), paragraph("Delayed gratification isn't one big dramatic sacrifice — it's a repeated series of small trades between what feels good now and what serves the goal later.")], practicalExercise: "Identify one non-essential purchase or distraction that repeatedly harms your long-term goals, and delay it once.", reflectionQuestions: ["What short-term choice repeatedly harms my long-term goals?"], actionTask: "Delay one non-essential purchase or distraction.", keyTakeaways: ["Delayed gratification is usually many small trades, not one dramatic sacrifice.", "Naming the specific recurring short-term choice makes it easier to actually change.", "This connects directly to Level 4's discipline work — the same muscle applies."] },
    { title: "Spending vs Investing", estimatedMinutes: 8, xpReward: 10, intro: "Consumption and investment in future capability can look identical on a bank statement and mean very different things.", blocks: [heading("Where Does It Go?"), paragraph("Spending consumes value now. Investing builds capacity for later — a course, a tool, a relationship, a skill. Neither is wrong, but confusing one for the other quietly erodes long-term progress.")], practicalExercise: "Review one week of discretionary spending and separate it into consumption versus investment.", reflectionQuestions: ["Where can I reduce waste and increase useful investment?"], actionTask: "Review one week's discretionary spending.", keyTakeaways: ["Spending and investing can look identical on paper and mean very different things.", "A weekly review makes the actual split visible instead of assumed.", "Increasing the investment share, even slightly, compounds over time."] },
    { title: "Building Multiple Skills", estimatedMinutes: 7, xpReward: 10, intro: "A complementary skill can multiply the value of your primary one — this lesson is about finding yours.", blocks: [heading("Skill Stacking"), paragraph("The right combination of skills is often more valuable than either one alone — a technical skill paired with communication, or a craft paired with basic business sense.")], practicalExercise: "Choose one complementary skill that would meaningfully increase the value of your main skill, and commit to developing it.", reflectionQuestions: ["Which complementary skill increases the value of my main skill?"], actionTask: "Choose one supporting skill to develop.", keyTakeaways: ["Skill combinations are often more valuable than any single skill alone.", "Adaptability comes from a stacked skill set, not just depth in one area.", "One deliberately chosen supporting skill is more useful than several vague ones."] },
    { title: "Learning to Create Opportunities", estimatedMinutes: 8, xpReward: 10, intro: "Waiting for perfect conditions is itself a decision — usually the wrong one.", blocks: [heading("Initiative Over Waiting"), paragraph("Opportunities are frequently created through initiative — an outreach message, a proposal, an offer made before it was asked for — rather than found waiting in perfect conditions that rarely arrive.")], practicalExercise: "Take one proactive outreach or creation action today instead of waiting for the right moment.", reflectionQuestions: ["Where can I create an opportunity instead of waiting?"], actionTask: "Take one proactive outreach or creation action.", keyTakeaways: ["Perfect conditions are rare — initiative creates opportunities that waiting doesn't.", "One proactive action is more valuable than an indefinite plan to 'get ready first.'", "Opportunity creation is a trainable habit, not luck."] },
    { title: "Long-Term Thinking", estimatedMinutes: 8, xpReward: 10, intro: "Compounding applies far beyond money — skills, relationships and reputation all compound the same way.", blocks: [heading("What Compounds"), paragraph("An activity repeated consistently for years — in skill-building, relationship-building, or reputation-building — often produces results that look nothing like a linear projection of the early effort.")], practicalExercise: "Choose one activity you'd be willing to repeat consistently for years, because of what it would compound into.", reflectionQuestions: ["What could become valuable if I did it consistently for years?"], actionTask: "Choose one long-term compounding activity.", keyTakeaways: ["Compounding applies to skills, relationships and reputation, not just money.", "Long-term results rarely look linear from the early stages — that's exactly why most people quit too soon.", "Choosing one compounding activity deliberately beats several inconsistent ones."] },
    { title: "Becoming Valuable", estimatedMinutes: 9, xpReward: 15, intro: "This level closes on the trait underneath all the others: becoming genuinely useful, reliable, and good at solving problems.", blocks: [heading("Usefulness, Reliability, Problem-Solving"), paragraph("What makes people trust and pay for someone's work usually comes down to three things: they're useful, they're reliable, and they solve real problems. Everything else in this level supports building those three traits.")], practicalExercise: "Choose three specific qualities related to usefulness, reliability or problem-solving that you'll deliberately improve.", reflectionQuestions: ["What makes people trust and pay for someone's work?"], actionTask: "Choose three qualities you will deliberately improve.", keyTakeaways: ["Usefulness, reliability and problem-solving are what trust and payment both track back to.", "This closes the loop on the whole level — success, value creation, income vs wealth, and opportunity all connect here.", "Three specific, chosen qualities are more actionable than a vague goal to 'become more successful.'"] },
  ];
  const LEVEL9_CHALLENGE = [
    { title: "Personal Success Definition", fields: [{ key: "definition", label: "My personal definition of success", type: "textarea" }, { key: "criteria", label: "My five success criteria", type: "textarea" }] },
    { title: "One-Week Spending Review", fields: [{ key: "consumption", label: "What did you spend on consumption?", type: "textarea" }, { key: "investment", label: "What did you spend on investment (skills, tools, growth)?", type: "textarea" }, { key: "change", label: "What will you change next week?", type: "textarea" }] },
    { title: "Skill & Value Audit", fields: [{ key: "main_skill", label: "My main skill", type: "text" }, { key: "problem_solved", label: "The customer problem it solves", type: "textarea" }, { key: "supporting_skill", label: "One supporting skill I'll develop", type: "text" }] },
    { title: "Opportunity-Creation Action", fields: [{ key: "action", label: "What proactive action did you take?", type: "textarea" }, { key: "outcome", label: "What happened?", type: "textarea" }] },
  ];
  const LEVEL9_MC = [
    { prompt: "What does this level say about defining success?", options: ["It should be left to social comparison", "It should be defined intentionally, not defaulted to comparison", "Only money counts as success", "Success can't really be defined"], correctIndex: 1 },
    { prompt: "Scarcity and abundance are best understood as:", options: ["Objective facts about how much exists", "Decision-making patterns", "The same thing", "Irrelevant to financial decisions"], correctIndex: 1 },
    { prompt: "Where do most money beliefs originate?", options: ["Deliberate adult choice only", "Family, environment and early experience, largely unchosen", "They're genetic", "They don't really exist"], correctIndex: 1 },
    { prompt: "According to this level, money comes from:", options: ["Wanting it enough", "Creating or exchanging value", "Luck alone", "Avoiding all risk"], correctIndex: 1 },
    { prompt: "What is the key difference between income and wealth?", options: ["No difference", "Income is what comes in; wealth is capacity that remains and compounds", "Wealth is just a bigger number of income", "Income matters more than wealth always"], correctIndex: 1 },
    { prompt: "Delayed gratification is best described as:", options: ["One big dramatic sacrifice", "A series of small trades between immediate pleasure and long-term goals", "Never spending money", "Irrelevant to financial progress"], correctIndex: 1 },
    { prompt: "What's the difference between spending and investing?", options: ["They're identical", "Spending consumes value now; investing builds future capacity", "Investing is always wrong", "Spending is always wrong"], correctIndex: 1 },
    { prompt: "Why build multiple/complementary skills?", options: ["It never helps", "A skill combination is often more valuable than any single skill alone", "Only one skill should ever be developed", "Skills don't compound"], correctIndex: 1 },
    { prompt: "What does this level say about waiting for perfect conditions?", options: ["It's the best strategy", "Initiative usually creates opportunities that waiting doesn't", "Perfect conditions arrive reliably", "Nothing, timing doesn't matter"], correctIndex: 1 },
    { prompt: "What three traits does 'becoming valuable' rest on?", options: ["Luck, timing, and connections only", "Usefulness, reliability, and problem-solving", "Talent alone", "Avoiding all financial risk"], correctIndex: 1 },
  ];
  const LEVEL9_WRITTEN = [
    "Write your personal definition of success from Lesson 1.",
    "Rewrite one 'there is never enough' assumption into a testable opportunity question.",
    "Describe the valuable skill and the customer problem it solves from Lesson 5.",
    "What did your one-week spending review reveal about consumption vs investment?",
    "What three qualities did you choose to deliberately improve in Lesson 12?",
  ];
  await seedLevel({
    pathId: "f103930e-312f-4a88-a05b-e57156f77d7c",
    levelTitle: "Level 9 — Success, Money & Abundance Mindset",
    levelDescription: "Build a healthy relationship with success, value and money.",
    milestoneKey: "success_mind",
    milestoneTitle: "Success Mind",
    milestoneIcon: "🏆",
    milestoneDescription: "You've defined success on your own terms and built a practical relationship with value creation and money.",
    lessons: LEVEL9_LESSONS,
    challengeModuleTitle: "Success & Money Mindset Challenge",
    challengeModuleDescription: "Complete a personal success definition, one-week spending review, one skill/value audit and one opportunity-creation action.",
    challengeActivities: LEVEL9_CHALLENGE,
    assessmentTitle: "Success & Money Mindset Assessment",
    mcQuestions: LEVEL9_MC,
    writtenQuestions: LEVEL9_WRITTEN,
  });

  // ---------- Level 10 — Leadership & The Synergy Mind ----------
  const LEVEL10_LESSONS = [
    { title: "What Makes a Leader?", estimatedMinutes: 8, xpReward: 10, intro: "Leadership is influence and responsibility — not a title on a chart.", blocks: [heading("Influence, Responsibility, Service"), paragraph("Leadership is responsibility and influence, not merely a position. Anyone who influences how others think or act — with or without a formal title — is already leading, whether they've noticed or not.")], practicalExercise: "Identify three specific ways you can lead through your own behaviour, regardless of your current title.", reflectionQuestions: ["Who do I influence even without a title?"], actionTask: "Identify three ways you can lead by behaviour.", keyTakeaways: ["Leadership is influence and responsibility, not a title.", "Most people already influence others without recognizing it as leadership.", "Leading by behaviour is available starting today, regardless of position."] },
    { title: "Leadership vs Position", estimatedMinutes: 7, xpReward: 10, intro: "A title can grant authority. It can't automatically grant trust.", blocks: [heading("Would They Follow Without the Title?"), paragraph("A useful test: would people still choose to follow your example if the position itself were removed? That gap between granted authority and earned trust is where real leadership lives.")], practicalExercise: "Choose one specific behaviour you'll practice this week that earns trust independent of any title.", reflectionQuestions: ["Would people follow my example without my position?"], actionTask: "Choose one behaviour that earns trust.", keyTakeaways: ["Titles grant authority automatically; trust has to be earned separately.", "The test — would they follow without the title — is a useful, honest check.", "Trust-earning behaviour is available to practice regardless of position."] },
    { title: "Leading Yourself First", estimatedMinutes: 8, xpReward: 10, intro: "Credibility to lead others starts with consistency in leading yourself.", blocks: [heading("Self-Leadership Is the Foundation"), paragraph("Asking others for discipline, consistency or honesty while not practicing it yourself undermines credibility quickly. Self-leadership — personal discipline, kept commitments — is the foundation everything else in this level builds on.")], practicalExercise: "Identify one place where your own behaviour contradicts what you expect from others, and correct it.", reflectionQuestions: ["Where does my behaviour contradict what I expect from others?"], actionTask: "Correct one inconsistency.", keyTakeaways: ["Credibility to lead others starts with consistency in leading yourself.", "A gap between what you expect from others and what you practice yourself undermines trust fast.", "Correcting one inconsistency is more useful than a vague intention to 'lead better.'"] },
    { title: "Taking Responsibility", estimatedMinutes: 7, xpReward: 10, intro: "Ownership, not blame, is what moves a problem toward being solved.", blocks: [heading("From Blame to Ownership"), paragraph("Blame looks outward and stays stuck. Ownership asks what part of the problem is actually yours to work with — and moves toward a next action instead of a search for who's at fault.")], practicalExercise: "Write an ownership statement for a current problem — what part is yours, and what's your next action.", reflectionQuestions: ["What part of a problem is mine to own?"], actionTask: "Write an ownership statement and next action.", keyTakeaways: ["Blame looks outward and stays stuck; ownership moves toward a next action.", "Most situations have at least some part that is genuinely yours to own.", "An ownership statement is only useful paired with a concrete next action."] },
    { title: "Leading by Example", estimatedMinutes: 8, xpReward: 10, intro: "Standards demonstrated are far more persuasive than standards announced.", blocks: [heading("Behaviour Over Words"), paragraph("People notice what a leader does far more than what they say. A standard modeled consistently, over time, communicates more than the same standard stated once in a meeting.")], practicalExercise: "Choose one standard you want others to see from you, and model it deliberately for seven days.", reflectionQuestions: ["What standard do I want others to see from me?"], actionTask: "Model that standard for seven days.", keyTakeaways: ["Behaviour communicates standards far more effectively than words alone.", "Consistency over time is what makes a standard credible, not a single announcement.", "This connects directly to Level 3's self-leadership lesson — the same discipline, applied outward."] },
    { title: "Developing People", estimatedMinutes: 7, xpReward: 10, intro: "Developing people means helping them improve, not just handing them instructions.", blocks: [heading("Teach, Don't Just Instruct"), paragraph("Instructions get a task done once. Teaching builds a capability the other person keeps. The difference is investment — spending time helping someone understand, not just comply.")], practicalExercise: "Teach or coach someone on one genuinely useful skill this week.", reflectionQuestions: ["Who could benefit from what I know?"], actionTask: "Teach or coach someone on one useful skill.", keyTakeaways: ["Instructions complete a task once; teaching builds a capability that outlasts the moment.", "Developing people is an investment of time, not just a delegation of tasks.", "Everyone has something worth teaching someone else, right now."] },
    { title: "Giving Feedback", estimatedMinutes: 8, xpReward: 10, intro: "Specific, respectful, actionable feedback is a skill — most people never learn it deliberately.", blocks: [heading("Situation, Behaviour, Impact"), paragraph("The SBI method structures feedback clearly: describe the specific situation, the specific behaviour observed, and its actual impact — without vague generalizations or personal attacks.")], practicalExercise: "Practice one SBI-style feedback message: Situation, Behaviour, Impact.", reflectionQuestions: ["Do I avoid difficult feedback or deliver it poorly?"], actionTask: "Practice one SBI-style feedback message: Situation, Behaviour, Impact.", keyTakeaways: ["Specific, respectful feedback is a learnable structure, not just a personality trait.", "SBI (Situation, Behaviour, Impact) keeps feedback concrete instead of vague or personal.", "Avoiding difficult feedback entirely is its own kind of failure to lead."] },
    { title: "Handling Difficult People", estimatedMinutes: 8, xpReward: 10, intro: "Boundaries, clarity and calm are more effective than either avoidance or escalation.", blocks: [heading("Calm, Clear, Bounded"), paragraph("Difficult behaviour is best met with a planned, calm response and a clear boundary — not avoidance, which lets the behaviour continue, and not escalation, which usually makes it worse.")], practicalExercise: "Plan a calm response and a specific boundary for one behaviour you currently find difficult to handle.", reflectionQuestions: ["What behaviour is difficult for me to handle?"], actionTask: "Plan a calm response and a boundary.", keyTakeaways: ["Avoidance and escalation are both weaker responses than a calm, bounded one.", "A planned response is more reliable than an improvised one in a difficult moment.", "Boundaries are a leadership tool, not a personal failing to feel guilty about."] },
    { title: "Building Trust", estimatedMinutes: 7, xpReward: 10, intro: "Trust compounds through consistency, honesty and competence — the same three things, repeated.", blocks: [heading("What Actually Builds Trust"), paragraph("Trust rarely comes from one big gesture. It accumulates through consistently kept commitments, honest communication, and demonstrated competence over time.")], practicalExercise: "Keep one important commitment visibly and consistently this week.", reflectionQuestions: ["What makes me trust someone?", "Do I demonstrate those traits?"], actionTask: "Keep one important commitment visibly and consistently.", keyTakeaways: ["Trust accumulates through consistency, honesty and competence, not one gesture.", "The traits that make you trust someone else are worth checking against your own behaviour.", "Visible, consistent follow-through is one of the most direct ways to build trust."] },
    { title: "Servant Leadership", estimatedMinutes: 8, xpReward: 10, intro: "The most durable form of leadership increases the capability of the people around it.", blocks: [heading("Making Others Stronger"), paragraph("Servant leadership measures itself by whether the people being led are becoming more capable — not by how much authority the leader accumulates.")], practicalExercise: "Help another member complete a meaningful task this week.", reflectionQuestions: ["How can my leadership make someone else stronger?"], actionTask: "Help another member complete a meaningful task.", keyTakeaways: ["Servant leadership measures success by others' growing capability, not accumulated authority.", "Helping someone else complete something meaningful is leadership in action, not a side activity.", "This is where 'success becomes more powerful' — this level's theme — actually shows up."] },
    { title: "Creating a Culture of Growth", estimatedMinutes: 8, xpReward: 10, intro: "A culture where learning and feedback are normal doesn't happen by accident — someone has to build it deliberately.", blocks: [heading("Normalizing Learning and Feedback"), paragraph("A growth culture treats mistakes as information, feedback as normal, and learning as ongoing. It's built through repeated small choices about what gets rewarded and what gets modeled, not a single policy.")], practicalExercise: "Propose one specific culture practice your team could adopt to support learning and growth.", reflectionQuestions: ["What behaviours should Synergy reward and encourage?"], actionTask: "Propose one culture practice for your team.", keyTakeaways: ["Culture is built through repeated small choices about what gets rewarded and modeled.", "A growth culture treats mistakes as information and feedback as normal.", "One specific, proposed practice is more actionable than a vague wish for 'a better culture.'"] },
    { title: "Becoming Someone Others Can Follow", estimatedMinutes: 9, xpReward: 15, intro: "This level, and this path, close on the integration point: character, competence, consistency and contribution, together.", blocks: [heading("If They Copied Your Habits"), paragraph("A genuinely useful test of leadership: if someone copied your current habits exactly, where would they end up? The answer reveals whether your example is actually one worth following — and everything in this level has been building toward making that answer a good one.")], practicalExercise: "Write your personal leadership standard, and commit to it in writing.", reflectionQuestions: ["If someone copied my current habits, where would they end up?"], actionTask: "Write your personal leadership standard and commit to it.", keyTakeaways: ["Character, competence, consistency and contribution together are what make someone worth following.", "The 'if they copied my habits' test is a genuinely useful, honest self-check.", "This closes both the level and the broader Mind Training arc: from self-leadership to leading others well."] },
  ];
  const LEVEL10_CHALLENGE = [
    { title: "Help Another Member", fields: [{ key: "who", label: "Who did you help?", type: "text" }, { key: "how", label: "How did you help them?", type: "textarea" }, { key: "outcome", label: "What was the outcome?", type: "textarea" }] },
    { title: "Teach Something", fields: [{ key: "what_taught", label: "What did you teach or coach someone on?", type: "text" }, { key: "reflection", label: "How did it go?", type: "textarea" }] },
    { title: "Give Useful Feedback", fields: [{ key: "sbi_situation", label: "Situation", type: "textarea" }, { key: "sbi_behaviour", label: "Behaviour", type: "textarea" }, { key: "sbi_impact", label: "Impact", type: "textarea" }] },
    { title: "Lead One Small Activity", fields: [{ key: "activity", label: "What activity did you lead?", type: "textarea" }, { key: "learned", label: "What did you learn from leading it?", type: "textarea" }] },
    { title: "Document What You Learned", fields: [{ key: "summary", label: "Summarize what this challenge taught you about your own leadership", type: "textarea" }] },
  ];
  const LEVEL10_MC = [
    { prompt: "Leadership, according to this level, is primarily:", options: ["A title or position", "Responsibility and influence", "Reserved for people with formal authority", "About being liked by everyone"], correctIndex: 1 },
    { prompt: "What's the test for leadership independent of position?", options: ["Whether you have a title", "Whether people would follow your example even without the title", "Whether you're the loudest person in the room", "Whether you avoid all mistakes"], correctIndex: 1 },
    { prompt: "Why does self-leadership come before leading others?", options: ["It doesn't matter", "Credibility to lead others starts with consistency in leading yourself", "Self-leadership is unrelated to leading others", "Only senior people need self-leadership"], correctIndex: 1 },
    { prompt: "What's the difference between blame and ownership?", options: ["No real difference", "Blame looks outward and stays stuck; ownership moves toward a next action", "Blame is more productive", "Ownership means accepting fault for everything"], correctIndex: 1 },
    { prompt: "What does 'leading by example' rely on?", options: ["Words and announcements", "Consistent behaviour observed over time", "Formal titles", "One dramatic gesture"], correctIndex: 1 },
    { prompt: "What does the SBI feedback method stand for?", options: ["Speed, Balance, Intent", "Situation, Behaviour, Impact", "Support, Blame, Improve", "Style, Behavior, Ideas"], correctIndex: 1 },
    { prompt: "What is the recommended approach to difficult people?", options: ["Avoidance", "Escalation", "A calm response with a clear boundary", "Ignoring the behaviour entirely"], correctIndex: 2 },
    { prompt: "How does trust get built, according to this level?", options: ["One big gesture", "Consistency, honesty and competence over time", "Formal authority alone", "Trust can't really be built"], correctIndex: 1 },
    { prompt: "Servant leadership measures success by:", options: ["How much authority the leader accumulates", "Whether the people being led are becoming more capable", "How many people report to the leader", "How rarely the leader is questioned"], correctIndex: 1 },
    { prompt: "The 'if someone copied my habits, where would they end up' question tests:", options: ["Nothing useful", "Whether your example is actually worth following", "Only your productivity", "Your title level"], correctIndex: 1 },
  ];
  const LEVEL10_WRITTEN = [
    "Describe the three ways you identified you can lead by behaviour, from Lesson 1.",
    "Write your ownership statement and next action from Lesson 4.",
    "Describe the SBI feedback message you practiced in Lesson 7.",
    "Describe how you helped another member complete a meaningful task.",
    "Write your personal leadership standard from Lesson 12.",
  ];
  await seedLevel({
    pathId: "f3dc54f8-b2d5-4b25-9bc6-f168ae6a4054",
    levelTitle: "Level 10 — Leadership & The Synergy Mind",
    levelDescription: "Success becomes more powerful when you can help other people grow.",
    milestoneKey: "synergy_leader_mind",
    milestoneTitle: "Synergy Leader Mind",
    milestoneIcon: "🏆",
    milestoneDescription: "You've moved from leading yourself to developing, trusting and growing the people around you.",
    lessons: LEVEL10_LESSONS,
    challengeModuleTitle: "Leadership Challenge",
    challengeModuleDescription: "Help another member, teach something, give useful feedback, lead one small activity and document what you learned.",
    challengeActivities: LEVEL10_CHALLENGE,
    assessmentTitle: "Leadership Assessment",
    mcQuestions: LEVEL10_MC,
    writtenQuestions: LEVEL10_WRITTEN,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
