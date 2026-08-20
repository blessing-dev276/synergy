// Content seeder for Mind Training Level 3 — Goals, Vision & Ambition.
//
// Same approach as supabase/seed-mind-training-level-1.mjs (that file's own
// header names itself the template for Levels 2-10): populates real content
// directly via the admin RLS grants already on every mind_training_* table,
// rather than clicking through the admin UI ~150 times.
//
// Unlike Level 1, the "Goals, Vision & Ambition" path/level didn't already
// exist from earlier scaffolding -- this script creates the level row (not
// update), then three modules: Core Lessons (12, sequential -- lesson N+1
// stays locked until N is completed, 0073_mind_training_level3.sql),
// "My Synergy Goal Plan" (6 editable practical-task activities), and a
// Final Assessment mixing scored multiple-choice with unscored written/
// practical questions (also 0073).
//
// Also wires the path into the catalog the same way Level 1 is wired:
// publishes the learning_paths row and attaches it to the Newbie rank via
// admin_set_rank_learning_paths (the only writer of rank_learning_paths) --
// fetches Newbie's current path list first and adds to it, so this never
// clobbers any existing attachment for that rank.
//
// Usage: node supabase/seed-mind-training-level-3.mjs
//   Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (already in .env) and
//   an admin account's credentials, passed via env so they're never
//   hardcoded in a committed file:
//     SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node supabase/seed-mind-training-level-3.mjs
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

const PATH_ID = "b5b3a75d-833a-4a35-9889-031633cbd0fc"; // learning_paths: "Goals, Vision & Ambition"
const NEWBIE_RANK_ID = "8f1dfab1-4335-435d-8319-f35f0ceef5bd"; // same rank Level 1 is attached to

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

// ---------- shared input-field builder for "My Daily Actions" ----------
function dailyActionFields() {
  const fields = [];
  for (let i = 1; i <= 3; i++) {
    fields.push(
      { key: `action${i}`, label: `Action #${i}`, type: "text" },
      { key: `action${i}_priority`, label: `Action #${i} — Priority (high / medium / low)`, type: "text" },
      { key: `action${i}_time`, label: `Action #${i} — Estimated time`, type: "text" },
      { key: `action${i}_status`, label: `Action #${i} — Completion status`, type: "text" },
    );
  }
  return fields;
}

// ---------- the 12 core lessons ----------
const LESSONS = [
  {
    title: "Why Goals Matter",
    estimatedMinutes: 8,
    xpReward: 10,
    intro:
      "A person without direction can be busy and still go nowhere. This lesson starts with the difference between motion and progress — a distinction the rest of this level depends on.",
    blocks: [
      heading("Busy Is Not the Same as Productive"),
      paragraph(
        "Being busy feels like progress. Your calendar is full, your to-do list is long, you're tired at the end of the day — surely that means something is moving forward. Not necessarily. It's entirely possible to spend hours working every single day and still make almost no real progress, because the work was never pointed at anything specific.",
      ),
      heading("Three Different Things"),
      list([
        "Activity — doing things.",
        "Productivity — doing things that move you toward a meaningful result.",
        "Progress — getting closer to a defined objective.",
      ]),
      paragraph(
        "All three can look identical from the outside. The only way to tell them apart is to ask what the activity was actually aimed at.",
      ),
      heading("Same Hours, Different Direction"),
      example(
        "Person A spends 5 hours a day learning random things online — a bit of design, a bit of marketing, whatever looks interesting that day. No specific skill-development target.\n\nPerson B spends 2 hours a day learning Flutter, working toward one goal: build and publish one app within 90 days.\n\nBoth people are busy. Only one of them has direction.",
      ),
      paragraph(
        "The same pattern shows up everywhere: a student who studies for hours without a clear target grade or skill, a network marketer who posts content daily with no defined outcome they're building toward, a freelancer who takes any project that comes in rather than the ones that build the portfolio they actually need, someone who says they want to save money but has never set an amount or a date.",
      ),
      heading("The Key Principle"),
      quote("Direction determines whether effort becomes progress."),
      paragraph(
        "This level isn't about working harder. Most people reading this are already working hard. It's about pointing that effort somewhere specific enough that it actually accumulates into something, instead of evaporating into another busy week that looks a lot like the one before it.",
      ),
    ],
    practicalExercise:
      "Write down 3 things you are currently spending real time on. For each one, identify honestly whether it is moving you forward, keeping you stagnant, or taking you backward.",
    reflectionQuestions: [
      "What am I currently working toward?",
      "Can I clearly explain what I want to achieve?",
      "Am I busy, or am I actually making progress?",
      "What area of my life currently lacks direction?",
    ],
    actionTask: "Complete the 3-things exercise above before moving to Lesson 2 — be specific, not general.",
    keyTakeaways: [
      "Activity, productivity and progress can look identical from the outside — the difference is what the effort was actually aimed at.",
      "Two equally busy people can have completely different results because only one of them has a specific direction.",
      "Direction is what determines whether effort becomes progress. Working harder without it just produces a busier version of nowhere.",
    ],
  },
  {
    title: "Vision vs Goals",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "\"Vision\" and \"goal\" get used interchangeably, but they answer two different questions — and mixing them up is why so many goal-setting attempts stall out.",
    blocks: [
      heading("Two Different Questions"),
      paragraph("A vision describes the future you want to create. It answers:"),
      quote("What kind of life, person, career or business do I want to build?"),
      paragraph("A goal is a specific result you want to achieve. It answers:"),
      quote("What exactly am I going to accomplish?"),
      heading("The Analogy"),
      list(["Vision = Destination", "Goals = Milestones", "Actions = Steps"], "number"),
      heading("Worked Example"),
      example(
        "Vision: Become financially independent through technology and entrepreneurship.\n\nGoal: Earn ₦500,000 per month from freelancing within 12 months.\n\nAction: Send 5 qualified proposals every weekday.",
      ),
      paragraph(
        "Notice how each one gets more concrete than the one before it. The vision is broad enough to guide years of decisions. The goal is specific enough to know whether you hit it. The action is small enough to do today.",
      ),
      heading("Why Both Are Necessary"),
      paragraph(
        "A vision without goals remains a dream — inspiring, but with no way to tell if you're actually approaching it. A goal without a larger vision can become a meaningless task — you might hit the number and still feel like nothing changed, because it was never connected to anything bigger. The two need each other: the vision gives the goal its reason to matter, and the goal gives the vision something to actually measure.",
      ),
    ],
    practicalExercise:
      "Write: \"My Vision: The person I want to become and the life I want to create is...\" Then list three goals that would genuinely move you toward that vision.",
    reflectionQuestions: ["Do you currently have a written vision, or has it only ever lived as a vague feeling?"],
    actionTask: "Write your Vision statement and your three supporting goals from the exercise above — you'll refine the vision fully in Lesson 3.",
    keyTakeaways: [
      "Vision answers \"what future am I building?\" — goals answer \"what exactly am I going to accomplish?\"",
      "Vision = Destination, Goals = Milestones, Actions = Steps. Each one gets more concrete than the last.",
      "A vision without goals is a dream. A goal without a vision is just a task. You need both.",
    ],
  },
  {
    title: "Creating Your Personal Vision",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Lesson 2 defined vision. This lesson builds yours — and pushes past the instinct to make it only about money.",
    blocks: [
      heading("Beyond Money"),
      paragraph("A real vision usually spans more than one area of life. Consider all of these as fair game:"),
      list(["Career", "Business", "Education", "Skills", "Finances", "Relationships", "Health", "Lifestyle", "Character", "Contribution", "Leadership", "Personal growth"]),
      heading("The Question Behind the Question"),
      quote("Don't only ask \"What do I want to have?\" Ask \"Who do I want to become?\""),
      paragraph(
        "\"What do I want to have\" produces a wish list. \"Who do I want to become\" produces a direction — because the person you become is what actually determines whether you can create and sustain the things on the wish list in the first place.",
      ),
      heading("The Vision Exercise"),
      paragraph("Imagine yourself 3-5 years from now. Answer honestly:"),
      list(
        [
          "Where am I?",
          "What am I doing?",
          "What skills do I have?",
          "What does my financial life look like?",
          "What kind of person have I become?",
          "What habits do I have?",
          "Who benefits from my growth?",
          "What am I proud of?",
        ],
        "number",
      ),
      paragraph(
        "Then compress your answers into a short Personal Vision Statement — a few sentences you could read back to yourself on a hard day and still recognize as something worth working toward.",
      ),
    ],
    practicalExercise:
      "Answer the eight vision-exercise questions above in writing, then compress them into a short Personal Vision Statement. Save this — it's your deliverable for this lesson, and it's the foundation of the Practical Project later in this level.",
    reflectionQuestions: ["Which of the eight questions was hardest to answer honestly, and why?"],
    actionTask: "Write your completed Personal Vision Statement before moving to Lesson 4.",
    keyTakeaways: [
      "A real vision spans more than money — career, health, relationships, character and contribution all belong in it.",
      "\"Who do I want to become?\" produces direction. \"What do I want to have?\" only produces a wish list.",
      "A Personal Vision Statement is a compression of honest answers about your life 3-5 years out — not a slogan written for effect.",
    ],
  },
  {
    title: "The Power of Ambition",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Ambition has a reputation problem — it gets mistaken for greed or status-chasing. This lesson defines it more precisely.",
    blocks: [
      heading("What Healthy Ambition Actually Is"),
      paragraph("Ambition is not simply wanting money or status. Healthy ambition is:"),
      quote("The desire to become better, achieve meaningful results and expand your capacity."),
      heading("What Shapes Ambition"),
      list(["Small thinking vs. big thinking", "Comfort zones", "Standards", "Personal potential", "Long-term thinking", "Becoming more valuable"]),
      paragraph(
        "Most people's ceiling isn't set by their actual ability — it's set by what they've allowed themselves to seriously consider attempting. Raising that ceiling starts with noticing where you've quietly ruled things out without ever really testing them.",
      ),
      heading("Ambition Needs Discipline, and Discipline Needs Ambition"),
      paragraph(
        "Ambition without discipline is fantasy — big plans that never survive contact with a Tuesday morning. Discipline without ambition can become routine — showing up consistently for something that was never actually going anywhere. Neither one alone is enough.",
      ),
      example("Ambition + Direction + Discipline + Action"),
    ],
    practicalExercise:
      "Answer honestly: \"If failure was not an option, what would I seriously attempt to achieve?\" Then: \"What is currently stopping me from pursuing it?\"",
    reflectionQuestions: ["Where have you quietly ruled something out without ever actually testing whether it was possible?"],
    actionTask: "Write your answer to both questions in the practical exercise above — be specific about the thing stopping you, not vague.",
    keyTakeaways: [
      "Healthy ambition is the desire to become better and expand your capacity — not simply wanting money or status.",
      "Ambition without discipline is fantasy. Discipline without ambition is just routine. You need both, aimed at a direction.",
      "Most ceilings are self-imposed by what you've allowed yourself to seriously consider, not by actual ability.",
    ],
  },
  {
    title: "SMART Goals",
    estimatedMinutes: 10,
    xpReward: 15,
    intro: "This lesson gives you the tool that turns a vague wish into something you can actually plan around and measure.",
    blocks: [
      heading("The Five Parts"),
      list(
        [
          "Specific — What exactly do I want?",
          "Measurable — How will I know I achieved it?",
          "Achievable — Is it realistic based on my current resources and capacity?",
          "Relevant — Does it actually matter to my bigger vision?",
          "Time-Bound — When must it be achieved?",
        ],
        "number",
      ),
      heading("Weak vs. SMART"),
      example(
        "Weak goal: \"I want to make more money.\"\n\nSMART goal: \"I will earn ₦300,000 from freelancing within the next 90 days by completing my portfolio, publishing 2 optimized Fiverr gigs and sending at least 5 qualified proposals each weekday.\"",
      ),
      paragraph(
        "The weak version can never actually be failed or achieved — there's no line to cross. The SMART version can. That's the whole point: a goal that can't be checked against reality isn't really a goal yet, it's a mood.",
      ),
    ],
    practicalExercise:
      "Build one SMART goal of your own using this structure: Goal, Why it matters, Measurement, Deadline, Current situation, Required resources, First action. You'll use this same goal-builder structure again in the Practical Project later in this level.",
    reflectionQuestions: ["Which of the five SMART components (Specific, Measurable, Achievable, Relevant, Time-Bound) is usually missing from your own goals?"],
    actionTask: "Write one complete SMART goal using the seven-part structure above before moving to Lesson 6.",
    keyTakeaways: [
      "S-M-A-R-T: Specific, Measurable, Achievable, Relevant, Time-Bound — a goal missing any of these is hard to actually act on.",
      "A goal that can't be measured against reality isn't really a goal yet — it's a mood or a wish.",
      "This lesson's goal-builder structure (goal, why, measurement, deadline, resources, first action) is what the Practical Project builds on.",
    ],
  },
  {
    title: "Backward Goal Setting",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Most people plan forward from today. This lesson teaches the opposite — starting at the destination and working back to what has to happen today.",
    blocks: [
      heading("A Different Question"),
      paragraph("Instead of asking:"),
      quote("What should I do today?"),
      paragraph("Ask:"),
      quote("What must be true for me to achieve my final goal?"),
      paragraph("Then work backward from there."),
      heading("Worked Example"),
      example(
        "1-Year Goal: Earn ₦3,600,000 from freelancing.\n↓\n6-Month Target: Build consistent monthly income of ₦300,000.\n↓\n90-Day Target: Get first consistent clients and reach ₦100,000/month.\n↓\nMonthly Target: Complete portfolio + improve Fiverr profile + acquire clients.\n↓\nWeekly Target: Send 25 proposals and improve one portfolio project.\n↓\nDaily Action: Send 5 proposals.",
      ),
      heading("The Chain"),
      example("Vision → Goal → Milestone → Target → Action"),
      paragraph(
        "Working backward forces every daily action to justify itself against the final destination, instead of the daily action being whatever felt most urgent that morning. It's the difference between a plan and a to-do list.",
      ),
    ],
    practicalExercise:
      "Select one major goal of your own and build your own backward plan: 1-Year Goal → 6-Month Target → 90-Day Target → Monthly Target → Weekly Target → Daily Action.",
    reflectionQuestions: ["When you work backward from your 1-year goal, does today's daily action actually change? What does that tell you?"],
    actionTask: "Complete your own backward plan from the practical exercise before moving to Lesson 7.",
    keyTakeaways: [
      "Backward goal setting starts at the final destination and works back to what has to be true today — not the other way around.",
      "The chain — Vision → Goal → Milestone → Target → Action — connects a single day's work all the way up to the multi-year vision.",
      "A daily action that can't be traced back to the final goal through this chain is probably not the highest-leverage thing to be doing.",
    ],
  },
  {
    title: "Breaking Big Goals Into Small Actions",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "A goal that stays big and abstract is overwhelming by design. This lesson is about the mechanics of shrinking it down to something you can actually start today.",
    blocks: [
      heading("The Breakdown Chain"),
      example("Goal → Projects → Tasks → Actions"),
      heading("Worked Example"),
      paragraph("Goal:"),
      quote("Launch my freelance business."),
      paragraph("Projects:"),
      list(["Build portfolio", "Create Fiverr profile", "Create gigs", "Learn client communication", "Start outreach"]),
      paragraph("Tasks:"),
      quote("Build 3 portfolio projects."),
      paragraph("Actions:"),
      quote("Complete homepage design today."),
      heading("Outcome Goals vs. Process Goals"),
      paragraph("These two get confused constantly, and the difference matters:"),
      list(["Outcome Goals — what you want to achieve.", "Process Goals — what you repeatedly do to create the outcome."]),
      example("Outcome: Get 5 clients.\nProcess: Send 5 qualified proposals every weekday."),
      paragraph(
        "The outcome goal isn't fully in your control — a client's decision has other factors involved. The process goal is entirely in your control, and if you run it consistently, the outcome becomes far more likely. This is exactly why the Practical Project later in this level asks for both a target and the actions that get you there.",
      ),
    ],
    practicalExercise:
      "Take one major goal and break it down into: 3 projects, 5 tasks, and 7 immediate actions.",
    reflectionQuestions: ["Is your current biggest goal stated as an outcome, a process, or both? What's missing?"],
    actionTask: "Complete the 3-projects/5-tasks/7-actions breakdown before moving to Lesson 8.",
    keyTakeaways: [
      "Goal → Projects → Tasks → Actions is how an overwhelming goal becomes something you can actually start on today.",
      "Outcome goals describe what you want. Process goals describe what you repeatedly do. You need the process goal to reliably get the outcome.",
      "A process goal is fully within your control even when the outcome isn't — which is exactly why it's the more useful thing to track daily.",
    ],
  },
  {
    title: "Daily, Weekly & Monthly Goals",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "This lesson connects every time horizon into one hierarchy, so a single day's work has a traceable line all the way up to the year.",
    blocks: [
      heading("The Synergy Goal Hierarchy"),
      list([
        "YEAR — Where am I going?",
        "6 MONTHS — What major progress should happen?",
        "90 DAYS — What must I accomplish this quarter?",
        "MONTH — What must happen this month?",
        "WEEK — What must happen this week?",
        "DAY — What must I do today?",
      ]),
      quote("Your daily actions should have a connection to your long-term goals."),
      paragraph(
        "When this hierarchy is missing, daily work drifts toward whatever feels urgent instead of what's actually important — which is exactly the \"busy but no direction\" trap from Lesson 1, showing up again at the level of a single day.",
      ),
    ],
    practicalExercise:
      "Build your own version of the hierarchy: My 1-Year Goal → My 6-Month Goal → My 90-Day Goal → My Monthly Goal → My Weekly Target → My Daily Actions. This is exactly the structure of the Practical Project — My Synergy Goal Plan — that follows the 12 lessons. Read this lesson fully, then complete the Goal Plan there.",
    reflectionQuestions: ["Right now, can you trace a straight line from today's actions up to your 1-year goal? Where does the line break?"],
    actionTask: "Identify the exact level (day, week, month, 90-day, 6-month, or year) where your own planning currently breaks down.",
    keyTakeaways: [
      "The hierarchy — Year → 6 Months → 90 Days → Month → Week → Day — is what keeps a single day's work connected to the bigger vision.",
      "Without this hierarchy, daily work drifts toward whatever feels urgent instead of what's actually important.",
      "This lesson sets up the Practical Project — My Synergy Goal Plan — where you'll build and save your own version of this hierarchy.",
    ],
  },
  {
    title: "Measuring Progress",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "A goal that's never checked against reality quietly turns into a wish. This lesson is about tracking, not just writing goals down once and hoping.",
    blocks: [
      heading("The Principle"),
      quote("What gets measured gets attention."),
      heading("What to Track"),
      list(["Target", "Current result", "Percentage completed", "Deadline", "Remaining work", "Consistency", "Weekly progress"]),
      heading("Worked Example"),
      example("Goal: Complete 100 hours of skill training.\nCurrent: 63 hours.\nProgress: 63%\nRemaining: 37 hours."),
      paragraph(
        "Tracking like this does two things at once: it tells you honestly whether you're on pace, and it makes the goal feel real and close instead of abstract and far away — 37 hours remaining is a much more motivating number than \"I should train more.\"",
      ),
      heading("The Weekly Review"),
      paragraph("Make reviewing your goals a weekly habit, not something you only do when things go wrong."),
    ],
    practicalExercise:
      "Run a progress review on a goal you're currently working on: What was my target? What did I accomplish? What did I fail to accomplish? Why? What will I change next week?",
    reflectionQuestions: ["Do you currently track any of your goals with real numbers, or only with a general feeling of \"I'm working on it\"?"],
    actionTask: "Complete one full weekly progress review using the five questions above.",
    keyTakeaways: [
      "What gets measured gets attention — an untracked goal quietly drifts into a wish.",
      "Tracking target, current result, percent complete and remaining work makes a goal feel close and real instead of abstract.",
      "A weekly review (target, accomplished, missed, why, what changes) turns tracking into an actual habit instead of a one-time check-in.",
    ],
  },
  {
    title: "Adjusting Without Quitting",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "This lesson draws a line between two things people constantly confuse: changing your strategy, and abandoning your goal.",
    blocks: [
      heading("The Core Idea"),
      quote("A plan can fail without the goal being wrong."),
      heading("Questions to Ask When a Plan Isn't Working"),
      list(["Is the goal still relevant?", "What isn't working?", "What assumption was wrong?", "What resources am I missing?", "What strategy should change?", "What can I do differently?"]),
      heading("The Principle"),
      quote("Keep the vision. Adjust the strategy."),
      heading("Worked Example"),
      paragraph("If a member's Fiverr strategy isn't producing clients, the answer isn't automatically:"),
      quote("Freelancing doesn't work."),
      paragraph("Instead, investigate specifically:"),
      list(["Profile", "Gig positioning", "Portfolio", "Pricing", "Proposal quality", "Niche", "Traffic", "Consistency"]),
      paragraph(
        "Almost every \"this doesn't work for me\" conclusion is actually one or two of these specific, fixable things — but it only gets found by investigating instead of quitting at the first sign of friction.",
      ),
    ],
    practicalExercise:
      "Answer honestly: \"What goal have I abandoned too quickly because my first strategy didn't work?\" Then run it through the six diagnostic questions above.",
    reflectionQuestions: ["Looking back, was that goal actually wrong — or was it just the first strategy that was wrong?"],
    actionTask: "Pick one current goal that feels stuck, and run it through the six diagnostic questions above in writing.",
    keyTakeaways: [
      "A plan can fail without the goal being wrong — don't let a failed strategy get mistaken for proof the goal itself was bad.",
      "\"Keep the vision, adjust the strategy\" separates what should stay fixed from what should flex when something isn't working.",
      "Most \"this doesn't work for me\" conclusions are actually one or two specific, fixable things — found only by investigating, not quitting.",
    ],
  },
  {
    title: "Goal Killers",
    estimatedMinutes: 10,
    xpReward: 10,
    intro: "Twelve behaviours and thinking patterns are responsible for most abandoned goals. This lesson names all of them, so you can recognize your own before they finish the job.",
    blocks: [
      heading("The Twelve Goal Killers"),
      list(
        [
          "Procrastination — waiting instead of acting.",
          "Lack of Clarity — not knowing exactly what you want.",
          "Distraction — constantly switching attention.",
          "Unrealistic Expectations — expecting huge results immediately.",
          "Fear of Failure — avoiding action because failure feels uncomfortable.",
          "Fear of Success — avoiding responsibility and growth.",
          "Comparison — measuring your journey against someone else's.",
          "Inconsistency — starting repeatedly but never continuing.",
          "Lack of Measurement — never checking whether you are progressing.",
          "Quitting Too Early — stopping before the strategy has had enough time.",
          "Too Many Goals — trying to pursue everything simultaneously.",
          "Wrong Environment — surrounding yourself with people and habits that constantly pull you backward.",
        ],
        "number",
      ),
      paragraph(
        "Most people don't fail at one goal because of one dramatic event. They fail slowly, from one or two of these operating quietly in the background for months. Naming the specific one that applies to you is what makes it possible to actually counter it — the same principle from Lesson 5 in Level 1's work on limiting beliefs applies here: vague problems survive, specific ones get solved.",
      ),
    ],
    practicalExercise:
      "Select your top 3 goal killers from the list above, and write one specific counter-strategy for each.",
    reflectionQuestions: ["Which goal killer has cost you the most over the past year?"],
    actionTask: "Complete the Goal Killer Audit — 3 goal killers, 3 counter-strategies — before moving to Lesson 12.",
    keyTakeaways: [
      "Most abandoned goals aren't killed by one dramatic event — they're worn down slowly by one or two of these twelve patterns.",
      "Naming your specific goal killer precisely is what makes it possible to actually build a counter-strategy against it.",
      "This audit — 3 goal killers, 3 counter-strategies — is part of the Final Assessment later in this level.",
    ],
  },
  {
    title: "Becoming Goal-Oriented",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "The final lesson moves from setting goals as an occasional exercise to becoming someone who thinks and decides with direction as a default.",
    blocks: [
      heading("What Being Goal-Oriented Actually Means"),
      list(["Knowing what matters", "Prioritising", "Taking action", "Measuring progress", "Learning from failure", "Adjusting strategies", "Staying consistent", "Finishing what you start"]),
      heading("The Filter"),
      quote("Goals should influence your decisions, not just your journal."),
      paragraph("A goal-oriented person runs a simple filter on new opportunities and requests on their time:"),
      quote("Does this activity move me closer to my goals?"),
      list(["If yes: Continue.", "If no: Question it."]),
      paragraph(
        "This is the difference between goals as a document you wrote once and goals as an operating system you actually run decisions through. Everything in this level — vision, SMART goals, backward planning, measurement, adjusting without quitting, recognizing goal killers — only compounds if it becomes this kind of daily filter instead of a one-time writing exercise.",
      ),
    ],
    practicalExercise:
      "Answer all seven final reflection questions: What is my biggest goal right now? Why does it matter? What must I stop doing? What must I start doing? What must I continue doing? What is my next action? When will I do it?",
    reflectionQuestions: [
      "What is my biggest goal right now?",
      "Why does it matter?",
      "What must I stop doing?",
      "What must I start doing?",
      "What must I continue doing?",
      "What is my next action?",
      "When will I do it?",
    ],
    actionTask: "Take the \"next action\" from your final reflection and do it before the day is over.",
    keyTakeaways: [
      "Being goal-oriented means goals influence your daily decisions, not just something you wrote once in a journal.",
      "The filter — \"does this move me closer to my goals?\" — turns every lesson in this level into something you actually run, not just something you know.",
      "This lesson closes the level: everything you've learned only compounds if it becomes a daily operating filter, not a one-time exercise.",
    ],
  },
];

// ---------- Practical Project: My Synergy Goal Plan (6 activities) ----------
const GOAL_PLAN_ACTIVITIES = [
  {
    title: "My 1-Year Vision",
    xpReward: 20,
    instructions: [paragraph("Start at the top of the hierarchy. This is the destination everything else in your Goal Plan works backward from.")],
    inputFields: [
      { key: "vision_title", label: "Vision title", type: "text" },
      { key: "vision_description", label: "Vision description", type: "textarea" },
      { key: "vision_why", label: "Why this vision matters", type: "textarea" },
    ],
  },
  {
    title: "My 6-Month Goal",
    xpReward: 15,
    instructions: [paragraph("What major progress toward your vision needs to happen in the next 6 months?")],
    inputFields: [
      { key: "goal", label: "Goal", type: "textarea" },
      { key: "deadline", label: "Deadline", type: "text" },
      { key: "measurement", label: "Success measurement", type: "textarea" },
    ],
  },
  {
    title: "My 90-Day Goal",
    xpReward: 15,
    instructions: [paragraph("Narrow the 6-month goal down to what must be true 90 days from now.")],
    inputFields: [
      { key: "goal", label: "Goal", type: "textarea" },
      { key: "expected_result", label: "Expected result", type: "textarea" },
      { key: "measurement", label: "Measurement", type: "textarea" },
      { key: "deadline", label: "Deadline", type: "text" },
    ],
  },
  {
    title: "My Monthly Goal",
    xpReward: 15,
    instructions: [paragraph("Break the 90-day target into what this month specifically needs to accomplish.")],
    inputFields: [
      { key: "main_goal", label: "Main goal", type: "textarea" },
      { key: "supporting_goals", label: "Supporting goals", type: "textarea" },
      { key: "deadline", label: "Deadline", type: "text" },
      { key: "measurement", label: "Measurement", type: "textarea" },
    ],
  },
  {
    title: "My Weekly Target",
    xpReward: 15,
    instructions: [paragraph("Break the monthly goal into this week's specific target and tasks.")],
    inputFields: [
      { key: "weekly_target", label: "Weekly target", type: "textarea" },
      { key: "key_tasks", label: "Key tasks", type: "textarea" },
      { key: "expected_result", label: "Expected result", type: "textarea" },
    ],
  },
  {
    title: "My Daily Actions",
    xpReward: 20,
    instructions: [
      paragraph(
        "Bring it all the way down to today. List up to 3 specific actions, each with a priority, an estimated time, and its current completion status. This is the only part of the whole Goal Plan you can act on directly — everything above exists to make sure these actions point somewhere real.",
      ),
    ],
    inputFields: dailyActionFields(),
  },
];

// ---------- Final Assessment: Build Your Personal Goal Plan ----------
// 14 scored multiple-choice questions (knowledge) + 7 unscored written
// questions (practical) -- question_type distinguishes them, 0073.
const MC_QUESTIONS = [
  {
    prompt: "What is the key difference between a vision and a goal?",
    options: [
      "There is no real difference; the words are interchangeable.",
      "A vision describes the future you want to create; a goal is a specific result you want to achieve.",
      "A goal is always bigger and longer-term than a vision.",
      "A vision only applies to businesses, not individuals.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "\"Become financially independent through technology and entrepreneurship\" is an example of which part of the Vision → Goals → Actions chain?",
    options: ["An action", "A goal", "A vision", "A measurement"],
    correctIndex: 2,
  },
  {
    prompt: "Which of the following is the SMART goal (compared to the others, which are all weak versions of the same wish)?",
    options: [
      "\"I want to make more money.\"",
      "\"I'll try to earn more this year.\"",
      "\"I will earn ₦300,000 from freelancing within 90 days by completing my portfolio, publishing 2 Fiverr gigs and sending 5 qualified proposals each weekday.\"",
      "\"Money would be nice.\"",
    ],
    correctIndex: 2,
  },
  {
    prompt: "In SMART, what does the \"R\" stand for, and what does it check?",
    options: [
      "Repeatable — can this goal be set again next year?",
      "Relevant — does this goal actually matter to my bigger vision?",
      "Random — is this goal chosen without bias?",
      "Rewarding — will achieving this goal feel good?",
    ],
    correctIndex: 1,
  },
  {
    prompt: "\"Send 5 qualified proposals every weekday\" to reach \"Get 5 clients\" is an example of which pairing?",
    options: [
      "Two unrelated outcome goals.",
      "A process goal supporting an outcome goal.",
      "Two vision statements.",
      "A goal killer disguised as a strategy.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "What is the main advantage of a process goal over an outcome goal?",
    options: [
      "Process goals are always bigger.",
      "Process goals are fully within your control, unlike an outcome that depends on other people's decisions.",
      "Outcome goals don't require any effort.",
      "There is no real advantage; they're the same thing.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "Backward goal setting starts by asking:",
    options: [
      "\"What should I do today?\"",
      "\"What must be true for me to achieve my final goal?\"",
      "\"What did I do yesterday?\"",
      "\"What is everyone else doing?\"",
    ],
    correctIndex: 1,
  },
  {
    prompt: "In the backward-planning chain (Vision → Goal → Milestone → Target → Action), what determines whether a daily action is worth doing?",
    options: [
      "Whether it feels urgent that morning.",
      "Whether it can be traced back through the chain to the final goal.",
      "Whether someone else is also doing it.",
      "Whether it takes less than 10 minutes.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "Someone tracks a skill-training goal as \"63 of 100 hours complete.\" What principle is this an example of?",
    options: [
      "\"What gets measured gets attention.\"",
      "\"Ambition without discipline is fantasy.\"",
      "\"Keep the vision, adjust the strategy.\"",
      "\"Direction determines whether effort becomes progress.\"",
    ],
    correctIndex: 0,
  },
  {
    prompt: "A member's Fiverr strategy isn't producing clients. Based on \"adjusting without quitting,\" what's the most useful next step?",
    options: [
      "Conclude that freelancing doesn't work and quit.",
      "Investigate specific factors — profile, pricing, proposal quality, niche, consistency — before abandoning the goal.",
      "Keep doing exactly the same thing and wait longer.",
      "Switch to a completely unrelated goal.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "\"A plan can fail without the goal being wrong\" means:",
    options: [
      "If a strategy fails, the goal itself must have been unrealistic.",
      "A failed strategy doesn't automatically prove the underlying goal was bad — the strategy may just need to change.",
      "Plans never actually fail if the goal is right.",
      "Goals should be abandoned as soon as the first plan doesn't work.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "A member starts a new goal enthusiastically several times but never continues past the first week. Which goal killer is this?",
    options: ["Comparison", "Inconsistency", "Fear of success", "Wrong environment"],
    correctIndex: 1,
  },
  {
    prompt: "Which of these is an example of \"Wrong Environment\" as a goal killer?",
    options: [
      "Writing your goals down without a deadline.",
      "Constantly spending time with people and habits that pull you away from your goal.",
      "Setting a goal that is too easy.",
      "Reviewing your progress weekly.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "What does it mean to be \"goal-oriented\" according to this level?",
    options: [
      "Writing goals down once a year during planning season.",
      "Letting your goals influence your daily decisions through a simple filter: does this move me closer to my goals?",
      "Only focusing on one goal for your entire life.",
      "Comparing your goals against other people's to stay motivated.",
    ],
    correctIndex: 1,
  },
];

const WRITTEN_QUESTIONS = [
  "Write one SMART goal for something you genuinely want to achieve — include what, how you'll measure it, and your deadline.",
  "Create a 90-day target that supports the SMART goal you just wrote.",
  "Break that 90-day target into specific actions for this month.",
  "Create a weekly target that supports this month's actions.",
  "Define your specific daily actions for the week ahead.",
  "What is your single biggest goal killer right now, out of the twelve from Lesson 11?",
  "Write a specific strategy to overcome that goal killer.",
];

async function main() {
  console.log("Signing in as admin…");
  const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) throw authError;

  console.log("Creating the level…");
  const { data: level, error: levelError } = await supabase
    .from("mind_training_levels")
    .insert({
      path_id: PATH_ID,
      title: "Level 3 — Goals, Vision & Ambition",
      description: "A person without direction can be busy and still go nowhere.",
      milestone_key: "goal_setter",
      milestone_title: "Goal Setter",
      milestone_icon: "🏆",
      milestone_description:
        "You now have a clearer vision, measurable goals and an actionable path toward achieving them. Your next step isn't to think more about your goals. It's to execute.",
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

  console.log("Creating modules…");
  const moduleCore = await createModule(
    "Core Lessons",
    "Twelve lessons on turning ambition into a clear vision, measurable goals and a system that keeps you moving.",
    1,
    true, // sequential -- each lesson unlocks only after the one before it is completed
  );
  const moduleGoalPlan = await createModule(
    "My Synergy Goal Plan",
    "Build your own vision-to-daily-action goal plan, one horizon at a time. Editable any time as you progress.",
    2,
  );
  const moduleAssessment = await createModule(
    "Final Assessment",
    "Build Your Personal Goal Plan — knowledge questions on this level's concepts, plus a practical goal-planning exercise.",
    3,
  );

  console.log("Inserting 12 lessons…");
  for (const [i, lesson] of LESSONS.entries()) {
    const { error } = await supabase.from("mind_training_lessons").insert({
      module_id: moduleCore.id,
      level_id: LEVEL_ID,
      path_id: PATH_ID,
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

  console.log("Inserting 6 Goal Plan activities…");
  for (const [i, activity] of GOAL_PLAN_ACTIVITIES.entries()) {
    const { error } = await supabase.from("mind_training_activities").insert({
      module_id: moduleGoalPlan.id,
      title: activity.title,
      instructions: activity.instructions,
      order_index: i + 1,
      published: true,
      category: "practical_task",
      is_required: true,
      xp_reward: activity.xpReward,
      input_fields: activity.inputFields,
    });
    if (error) throw error;
    console.log(`  ${activity.title}`);
  }

  console.log("Creating the final assessment…");
  const { data: assessment, error: assessmentError } = await supabase
    .from("mind_training_assessments")
    .insert({
      module_id: moduleAssessment.id,
      title: "Build Your Personal Goal Plan",
      pass_score_percent: 80,
      xp_reward: 50,
    })
    .select()
    .single();
  if (assessmentError) throw assessmentError;

  console.log("Inserting 14 multiple-choice questions…");
  for (const [i, q] of MC_QUESTIONS.entries()) {
    const { data: question, error: qError } = await supabase
      .from("mind_training_assessment_questions")
      .insert({ assessment_id: assessment.id, prompt: q.prompt, question_type: "multiple_choice", order_index: i + 1 })
      .select()
      .single();
    if (qError) throw qError;

    const optionRows = q.options.map((text, idx) => ({
      question_id: question.id,
      text,
      is_correct: idx === q.correctIndex,
      order_index: idx + 1,
    }));
    const { error: oError } = await supabase.from("mind_training_assessment_options").insert(optionRows);
    if (oError) throw oError;
    console.log(`  Q${i + 1}: ${q.prompt.slice(0, 60)}${q.prompt.length > 60 ? "…" : ""}`);
  }

  console.log("Inserting 7 written/practical questions…");
  for (const [i, prompt] of WRITTEN_QUESTIONS.entries()) {
    const { error: wError } = await supabase.from("mind_training_assessment_questions").insert({
      assessment_id: assessment.id,
      prompt,
      question_type: "written",
      order_index: MC_QUESTIONS.length + i + 1,
    });
    if (wError) throw wError;
    console.log(`  W${i + 1}: ${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}`);
  }

  console.log("Publishing the path…");
  const { error: pathError } = await supabase.from("learning_paths").update({ published: true }).eq("id", PATH_ID);
  if (pathError) throw pathError;

  console.log("Attaching the path to the Newbie rank (adding to its existing list, not replacing it)…");
  const { data: currentRankPaths, error: rlpError } = await supabase
    .from("rank_learning_paths")
    .select("learning_path_id")
    .eq("rank_id", NEWBIE_RANK_ID);
  if (rlpError) throw rlpError;
  const nextPathIds = Array.from(new Set([...(currentRankPaths ?? []).map((r) => r.learning_path_id), PATH_ID]));
  const { error: setError } = await supabase.rpc("admin_set_rank_learning_paths", {
    p_rank_id: NEWBIE_RANK_ID,
    p_learning_path_ids: nextPathIds,
  });
  if (setError) throw setError;

  console.log("\nDone. Level 3 — Goals, Vision & Ambition is fully seeded, published and attached to the Newbie rank.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
