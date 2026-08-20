// Content seeder for Mind Training Level 2 — Self-Awareness & Self-Mastery.
//
// Same pattern as seed-mind-training-level-1.mjs (that file's own comment
// calls itself "the template for Levels 2-10": copy it, change the
// content, done) — admin-session RLS writes, no service_role key, run once
// by hand. Level 2 has no learning_paths/mind_training_levels row hardcoded
// to reuse the way Level 1 did (its path row pre-existed from earlier
// development; Level 2's doesn't), so this looks the path up by title
// (inserted unpublished by 0069_mind_training_seed.sql) and creates a fresh
// level row under it instead.
//
// Final Assessment ("Self-Mastery Reflection") is a real mind_training_
// assessments row, not multiple choice — every question is question_type
// 'written' (0073_mind_training_level3.sql, extended for the all-written
// case by 0074_mind_training_all_written_assessment.sql so pass/fail is
// scored on substance instead of correctness, since there's no "right"
// answer to 18 personal-reflection prompts).
//
// Usage: node supabase/seed-mind-training-level-2.mjs
//   Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (already in .env) and
//   an admin account's credentials, passed via env so they're never
//   hardcoded in a committed file:
//     SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node supabase/seed-mind-training-level-2.mjs
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

const PATH_TITLE = "Self-Awareness & Self-Mastery"; // learning_paths row inserted by 0069, section='mind_training'

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

// ---------- shared input-field builders (Practical Application tasks + bonus activities) ----------
function swotFields() {
  return [
    { key: "swot_strengths", label: "Strengths — What am I naturally good at?", type: "textarea" },
    { key: "swot_weaknesses", label: "Weaknesses — What holds me back?", type: "textarea" },
    { key: "swot_opportunities", label: "Opportunities — What opportunities can I take advantage of?", type: "textarea" },
    { key: "swot_threats", label: "Threats — What could prevent me from reaching my goals?", type: "textarea" },
  ];
}
function valuesFields() {
  const fields = [];
  for (let i = 1; i <= 5; i++) {
    fields.push(
      { key: `value_rank${i}`, label: `Value #${i} (your #${i} ranked value)`, type: "text" },
      {
        key: `value_rank${i}_reflection`,
        label: `Value #${i} — why it matters, how you currently live it, and how you could live it better`,
        type: "textarea",
      },
    );
  }
  return fields;
}
function whyStatementFields() {
  return [
    { key: "why1", label: "Why do I want to achieve this?", type: "text" },
    { key: "why2", label: "Why does that matter to me? (Why #2)", type: "text" },
    { key: "why3", label: "Why does that matter to me? (Why #3)", type: "text" },
    { key: "why4", label: "Why does that matter to me? (Why #4)", type: "text" },
    { key: "why5", label: "Why does that matter to me? (Why #5 — the deepest one)", type: "text" },
    {
      key: "personal_why_statement",
      label: '"I am committed to becoming the person I want to become because…"',
      type: "textarea",
    },
  ];
}
function triggerMappingFields(count = 3) {
  const fields = [];
  for (let i = 1; i <= count; i++) {
    fields.push(
      { key: `trigger${i}_situation`, label: `Trigger #${i} — Situation: what happened?`, type: "textarea" },
      { key: `trigger${i}_emotion`, label: `Trigger #${i} — Emotion: what did I feel?`, type: "text" },
      { key: `trigger${i}_intensity`, label: `Trigger #${i} — Intensity (1–10)`, type: "text" },
      { key: `trigger${i}_automatic_reaction`, label: `Trigger #${i} — Automatic reaction: what did I want to do?`, type: "textarea" },
      { key: `trigger${i}_actual_response`, label: `Trigger #${i} — Actual response: what did I do?`, type: "textarea" },
      { key: `trigger${i}_possible_cause`, label: `Trigger #${i} — Possible cause: why might this affect me so strongly?`, type: "textarea" },
      { key: `trigger${i}_better_response`, label: `Trigger #${i} — Better response: what could I do differently next time?`, type: "textarea" },
    );
  }
  return fields;
}
function distractionFields(count = 5) {
  const fields = [];
  for (let i = 1; i <= count; i++) {
    fields.push(
      { key: `distraction${i}_what`, label: `Distraction #${i} — What is it?`, type: "text" },
      { key: `distraction${i}_time`, label: `Distraction #${i} — How much time does it consume?`, type: "text" },
      { key: `distraction${i}_why`, label: `Distraction #${i} — Why do I engage with it?`, type: "textarea" },
      { key: `distraction${i}_cost`, label: `Distraction #${i} — What does it cost me?`, type: "textarea" },
      { key: `distraction${i}_action`, label: `Distraction #${i} — What will I do about it?`, type: "textarea" },
    );
  }
  return fields;
}
function strengthWeaknessBonusFields() {
  const fields = [];
  for (let i = 1; i <= 5; i++) {
    fields.push({ key: `strength${i}`, label: `Strength #${i} — what it is, and how it helps you`, type: "textarea" });
  }
  for (let i = 1; i <= 5; i++) {
    fields.push({ key: `weakness${i}`, label: `Weakness #${i} — what it is, and how it currently affects you`, type: "textarea" });
  }
  return fields;
}
function patternLoopFields() {
  return [
    { key: "pattern_problem", label: "What problem keeps repeating in your life?", type: "textarea" },
    { key: "pattern_trigger", label: "What usually triggers it?", type: "textarea" },
    { key: "pattern_thought", label: "What do you normally think?", type: "textarea" },
    { key: "pattern_behavior", label: "What do you normally do?", type: "textarea" },
    { key: "pattern_result", label: "What result does it produce?", type: "textarea" },
    { key: "pattern_interrupt", label: "What could interrupt the pattern?", type: "textarea" },
  ];
}
function environmentAuditFields() {
  return [
    { key: "env_keep", label: "Keep — things in your environment that help you grow", type: "textarea" },
    { key: "env_reduce", label: "Reduce — things that sometimes help but consume too much time", type: "textarea" },
    { key: "env_remove", label: "Remove — things that consistently distract or negatively affect you", type: "textarea" },
  ];
}
function thoughtReframeFields() {
  return [
    { key: "reframe_situation", label: "Situation", type: "textarea" },
    { key: "reframe_automatic_thought", label: "Automatic thought", type: "textarea" },
    { key: "reframe_emotion", label: "Emotion", type: "text" },
    { key: "reframe_true", label: "Is this thought completely true?", type: "text" },
    { key: "reframe_evidence_for", label: "What evidence supports it?", type: "textarea" },
    { key: "reframe_evidence_against", label: "What evidence challenges it?", type: "textarea" },
    { key: "reframe_more_useful", label: "A more useful thought", type: "textarea" },
  ];
}
function intentionalityPlanFields() {
  return [
    { key: "plan_start", label: "One thing I will start", type: "textarea" },
    { key: "plan_stop", label: "One thing I will stop", type: "textarea" },
    { key: "plan_continue", label: "One thing I will continue", type: "textarea" },
    { key: "plan_person", label: "One person I need to spend more time with", type: "text" },
    { key: "plan_distraction", label: "One distraction I need to reduce", type: "text" },
    { key: "plan_habit", label: "One habit I need to build", type: "text" },
    { key: "plan_goal", label: "One goal I need to take seriously", type: "text" },
  ];
}

// ---------- the 10 core lessons ----------
const LESSONS = [
  {
    title: "Understanding Yourself",
    estimatedMinutes: 8,
    xpReward: 10,
    intro:
      "Everything in this level — values, triggers, patterns, intentionality — sits on top of one skill: being willing to look at yourself accurately. This lesson is about building that foundation.",
    blocks: [
      heading("What Self-Awareness Actually Means"),
      paragraph(
        "Self-awareness is an honest, working picture of who you are — your thoughts, emotions, habits, strengths, weaknesses, values, desires, fears and behaviours. Not a vibe, not a label you picked once and kept. An accurate, current picture, built by actually looking.",
      ),
      heading("Knowing Yourself Is Not the Same as Judging Yourself"),
      paragraph(
        "These two get confused constantly. Knowing yourself means observing something and naming it accurately: \"I avoid conflict.\" Judging yourself means attaching a verdict to that same observation: \"I avoid conflict because I'm weak.\" The second one is why so many people stop looking — every honest observation gets punished with a harsh verdict, so the safest move starts to feel like not looking at all. This level asks you to observe, not to sentence yourself.",
      ),
      heading("The Full Picture"),
      paragraph("Self-awareness covers more ground than most people give it credit for. It includes:"),
      list(["Thoughts", "Emotions", "Habits", "Strengths", "Weaknesses", "Values", "Desires", "Fears", "Behaviours"]),
      heading("Living by Someone Else's Expectations"),
      paragraph(
        "A lot of people build an entire life — career, relationships, daily habits — around expectations they absorbed from family, culture or peers without ever checking whether those expectations actually match who they are. It happens quietly, because nobody sits you down and asks you to choose it; you just keep saying yes to the path that was already laid out. Self-awareness is what makes that quiet drift visible.",
      ),
      heading("Why This Changes Decision-Making and Leadership"),
      paragraph(
        "A person with an accurate picture of themselves makes decisions from clarity — they know what they actually want, what they're actually good at, and what actually triggers them. A person without that picture makes decisions reactively, discovering their own limits and desires after the fact, usually the hard way. Leadership asks even more of this: you can't reliably read and guide other people's patterns while you're still blind to your own.",
      ),
      quote("You cannot improve what you refuse to examine."),
    ],
    practicalExercise:
      "Set aside ten quiet minutes with no distractions. Answer the reflection questions below without editing your answers to sound better than they are — the entire value of this exercise is in how honest you're willing to be with yourself.",
    reflectionQuestions: [
      "Who am I when nobody is watching?",
      "What are three things I genuinely like about myself?",
      "What are three things I know I need to improve?",
      "What situations bring out the best version of me?",
      "What situations bring out the worst version of me?",
      "What do I currently want from life?",
      "What am I avoiding that I know I need to face?",
    ],
    actionTask:
      "Come back to your answers above in a few days and read them again. Notice anything you'd now answer differently — that gap is useful information, not a mistake.",
    keyTakeaways: [
      "Self-awareness is an accurate picture of your thoughts, emotions, habits, strengths, weaknesses, values, desires, fears and behaviours — not a feeling or a label.",
      "Knowing yourself and judging yourself are different acts. This level asks for honest observation, not a verdict.",
      "Decisions made from self-awareness are clearer and more consistent than decisions made on autopilot or in reaction to other people's expectations.",
    ],
  },
  {
    title: "Your Strengths & Weaknesses",
    estimatedMinutes: 9,
    xpReward: 10,
    intro:
      "Strengths and weaknesses both get mishandled — strengths inflate into arrogance, weaknesses collapse into insecurity. This lesson is about naming both accurately instead.",
    blocks: [
      heading("What a Strength Actually Is"),
      paragraph(
        "A strength is something you do reliably well, with less effort than it costs most people — a genuine advantage, not just something you enjoy. Strengths are worth naming precisely because they're the highest-leverage place to invest further development: improving a strength usually returns more than fixing a weakness to \"average.\"",
      ),
      list(["Communication", "Creativity", "Persistence", "Leadership", "Organisation", "Learning quickly", "Problem-solving", "Empathy"]),
      heading("What a Weakness Actually Is — and What It Isn't"),
      paragraph(
        "A weakness is something that consistently costs you, regardless of effort. That's different from a lack of experience — something you simply haven't practiced yet, which effort and time would fix. Confusing the two produces bad conclusions in both directions: giving up on a skill that's really just unpracticed, or endlessly grinding at something that's a genuine, structural weak point better managed than muscled through.",
      ),
      list(["Procrastination", "Poor time management", "Fear of rejection", "Inconsistency", "Overthinking", "Poor communication", "Lack of focus", "Avoiding difficult conversations"]),
      heading("When a Strength Becomes a Weakness"),
      paragraph(
        "Overused strengths distort. Persistence, pushed too far, becomes stubbornness. Organisation, pushed too far, becomes rigidity that can't tolerate a plan changing. Confidence, pushed too far, stops listening to feedback. A strength doesn't need to be abandoned once you notice this — it needs a ceiling.",
      ),
      heading("Why Pretending to Be Good at Everything Limits Growth"),
      paragraph(
        "Presenting a flawless version of yourself might protect your image in the short term, but it blocks the one thing growth actually requires: an accurate starting point. You can't build a real development plan around a weakness you've refused to admit exists.",
      ),
      heading("Using Feedback to Find Blind Spots"),
      paragraph(
        "Some weaknesses are invisible to you by definition — that's what makes them blind spots. Feedback that repeats, from more than one person, in more than one context, is usually pointing at something real, even when the specific wording feels off. Treat repetition as the signal, not any single comment.",
      ),
    ],
    practicalExercise:
      "This lesson's structured work happens in the Practical Application section that follows the 10 lessons — the Strength & Weakness Inventory and the Personal SWOT Analysis both build directly on what you name here.",
    reflectionQuestions: [
      "What do people usually come to you for help with?",
      "What do you find easier than most people?",
      "What repeatedly causes problems for you?",
      "What feedback have you received more than once?",
    ],
    actionTask:
      "Name one blind spot you suspect you have, based on feedback you've received more than once — even if you don't fully agree with it yet.",
    keyTakeaways: [
      "A strength is a reliable advantage; a weakness is a reliable cost. Neither is the same as something you simply haven't practiced yet.",
      "Any strength, overused, becomes a weakness — strengths need a ceiling, not abandonment.",
      "Feedback that repeats across people and contexts is usually pointing at a real blind spot, even when you don't like how it's phrased.",
    ],
  },
  {
    title: "Discovering Your Values",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Goals tell you where you're going. Values are what decide how you get there — and whether getting there actually feels like anything.",
    blocks: [
      heading("What Personal Values Are"),
      paragraph(
        "A value is a principle you use to guide decisions — not a preference, a standard. Integrity, growth, family, freedom: these operate quietly in the background of almost every choice you make, whether or not you've ever named them out loud.",
      ),
      heading("Values vs Goals"),
      paragraph(
        "A goal is a destination. A value is the compass that decides how you travel toward any destination at all. This is why two people can hit the exact same goal — the same income, the same title — and one feels proud of how they got there while the other feels hollow: the goal was identical, but one path ran through their values and the other ran straight over them.",
      ),
      heading("Why People Feel Lost Even While Achieving"),
      paragraph(
        "Achievement without value-alignment produces a strange, common experience: hitting the target and still feeling like something's missing. That gap is usually values, not ambition — the goal got met, but not in a way that honored what actually matters to the person who met it.",
      ),
      heading("Values and Difficult Decisions"),
      paragraph(
        "Hard decisions are hard precisely because the options all look reasonable on the surface. Values are what break the tie — not by promising an easy answer, but by giving you a standard to weigh the options against instead of deciding on mood or pressure alone.",
      ),
      heading("When Your Lifestyle Conflicts With Your Values"),
      paragraph(
        "A lifestyle that quietly contradicts your stated values doesn't usually announce itself as a crisis — it shows up as low-grade friction, a nagging sense that something's off even when nothing is technically wrong. Naming your values is what makes that friction legible instead of just uncomfortable.",
      ),
      heading("Example Values"),
      list(["Integrity", "Freedom", "Family", "Growth", "Excellence", "Discipline", "Creativity", "Contribution", "Knowledge", "Faith", "Responsibility", "Security", "Adventure", "Leadership", "Financial independence"]),
    ],
    practicalExercise:
      "In the Practical Application section ahead, you'll rank your top 5 values from a list like the one above and explain how you're currently living each one. Read the list twice before you rank anything — the ones that make you slightly uncomfortable are often more honest than the ones that sound impressive.",
    reflectionQuestions: ["Which value, if you lived it fully this month, would change the most about your daily choices?"],
    actionTask: "Complete \"My Personal Values\" in the Practical Application section before moving to the next lesson.",
    keyTakeaways: [
      "Values are the standard you use to decide how to pursue any goal — different from the goal itself.",
      "Achieving a goal while violating your values is exactly what produces \"I got what I wanted and still feel empty.\"",
      "A lifestyle that contradicts your values doesn't usually announce itself loudly — it shows up as ongoing, low-grade friction.",
    ],
  },
  {
    title: "Knowing Your Why",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Goals without a real reason behind them are easy to abandon the first time things get hard. This lesson is about finding the reason that isn't easy to abandon.",
    blocks: [
      heading("What a \"Why\" Actually Means"),
      paragraph(
        "Your Why is the deeper, personal reason a goal matters to you — not the goal itself, and usually not the first answer you give when someone asks.",
      ),
      heading("Weak Why vs Strong Why"),
      quote("\"I want to make money.\""),
      paragraph("is a weak Why — it's true, but it's shallow enough to lose its pull the moment things get difficult. Compare it to:"),
      quote("\"I want to develop valuable skills so I can create financial independence and give my family more options.\""),
      paragraph("The second version survives a bad week. The first one usually doesn't."),
      heading("External Motivation vs Internal Motivation"),
      paragraph(
        "External motivation runs on outside approval, comparison, or pressure — it's real, but it's borrowed, and it fades the moment the external source does. Internal motivation runs on something you'd still want even if nobody was watching or grading you. A strong Why is almost always internal.",
      ),
      heading("Money Can Be a Goal, but Rarely the Deeper Reason"),
      paragraph(
        "Money is a real, legitimate goal — but it's rarely the deepest layer. Ask what the money is actually for, and you usually find the real Why underneath: freedom, security, options, the ability to take care of people you love.",
      ),
      heading("Why Your Why Matters Most in Hard Periods"),
      paragraph(
        "Motivation is easy when things are going well — it barely gets tested. A strong Why earns its keep specifically during the slow month, the rejection, the plan that didn't work. That's the entire point of doing this work now, before you need it.",
      ),
      heading("The 5 Whys Exercise"),
      paragraph("Ask \"why\" about your own goal, five times in a row, each answer building on the last:"),
      example(
        "Why do I want to become successful?\n→ Because I want financial freedom.\nWhy?\n→ Because I don't want to depend on other people.\nWhy?\n→ Because I want control over my decisions.",
      ),
      paragraph("Keep going until you land on something that's genuinely, personally meaningful — not a slogan, a real reason."),
      paragraph("Your Why can evolve over time. Revisiting and rewriting it later isn't a failure of the first version — it's normal."),
    ],
    practicalExercise:
      "The Practical Application section ahead walks you through the full 5 Whys exercise and asks you to write your Personal Why Statement — do that before moving on.",
    reflectionQuestions: ["What's the shallowest, most surface-level answer you could give for why you want what you want — and what's underneath it?"],
    actionTask: "Complete \"My Personal Why\" in the Practical Application section.",
    keyTakeaways: [
      "A weak Why (\"I want money\") is true but shallow — it rarely survives real difficulty. A strong Why goes at least one layer deeper.",
      "Internal motivation (something you'd still want with nobody watching) holds up better than external motivation (approval, comparison, pressure).",
      "The 5 Whys exercise exists to force you past the first, easy answer and into the one that's actually personally meaningful.",
    ],
  },
  {
    title: "Understanding Your Personality",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "People genuinely think, communicate, and work differently — this lesson gives you language for that difference without turning it into a label you hide behind.",
    blocks: [
      heading("What \"Personality\" Means Here"),
      paragraph(
        "Personality, for the purposes of this level, is your natural tendency — how you tend to recharge, decide, and engage with structure and people. Not a fixed category, a starting pattern.",
      ),
      heading("Why It Affects Communication, Work and Relationships"),
      paragraph(
        "The same message lands differently depending on who's receiving it, and the same work style that energizes one person drains another. Understanding your own tendencies — and that other people's are genuinely different, not wrong — makes you easier to work with and less confused by people who don't operate like you do.",
      ),
      heading("The Danger of Using Personality as an Excuse"),
      paragraph(
        "\"I'm just an introvert, so I can't do that\" is personality being used to shrink your options instead of understanding them. The entire point of self-awareness is to widen what's available to you, not to hand you a permanent excuse. Know your tendency — but don't let it become a wall.",
      ),
      heading("Four Simple Dimensions"),
      list([
        "Introversion vs Extroversion — do you recharge better alone, or around people?",
        "Thinking vs Feeling — do you decide mainly through logic, emotion, or a mix of both?",
        "Structure vs Flexibility — do you prefer detailed instructions, or freedom to figure things out?",
        "Analytical vs People-oriented — are you drawn more to systems and data, or to people and relationships?",
      ]),
      paragraph("These are tendencies on a spectrum, not permanent boxes — most people sit somewhere in the middle, and where you sit can shift by context."),
    ],
    practicalExercise:
      "Answer the reflection questions below honestly, then read the note at the end — this is meant to build self-awareness, not to diagnose or label you.",
    reflectionQuestions: [
      "Do you recharge better alone or around people?",
      "Do you prefer planning or improvising?",
      "Do you make decisions mainly through logic, emotion, or a mixture?",
      "Do you prefer detailed instructions or freedom to figure things out?",
      "How do you usually respond to unfamiliar people?",
    ],
    actionTask:
      "Notice, over the next two days, whether your actual behaviour matches what you just described about yourself — write down anything that surprises you.",
    keyTakeaways: [
      "Personality tendencies genuinely shape communication, work style, and relationships — they're worth understanding, not ignoring.",
      "Used as an excuse, personality shrinks your options. Used as awareness, it widens them.",
      "This reflection is designed for self-awareness, not diagnosis or labeling — hold it loosely, not as a permanent verdict on who you are.",
    ],
  },
  {
    title: "Your Emotional Triggers",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Some situations produce a strong, automatic reaction before you've had a chance to think. This lesson is about learning to recognise those situations in advance.",
    blocks: [
      heading("What an Emotional Trigger Is"),
      paragraph(
        "A trigger is a situation that reliably produces a strong emotional reaction in you specifically — not necessarily in everyone. The same comment can roll off one person and genuinely wound another; the difference isn't the comment, it's what it connects to underneath.",
      ),
      heading("Why the Same Situation Hits People Differently"),
      paragraph(
        "Triggers are personal because they're usually tied to something specific in your own history — a past rejection, an old insecurity, a pattern from earlier in life. That's why the same trigger can feel completely disproportionate to an outside observer while feeling completely reasonable from the inside.",
      ),
      heading("Common Triggers"),
      list(["Rejection", "Criticism", "Being ignored", "Feeling disrespected", "Failure", "Comparison", "Pressure", "Uncertainty", "Conflict", "Feeling inadequate"]),
      heading("Feeling an Emotion vs Acting on It"),
      paragraph(
        "The emotion itself isn't the problem — it's information. What causes trouble is acting on it automatically, without ever noticing there was a gap between feeling it and doing something about it.",
      ),
      heading("The Pause Awareness Creates"),
      paragraph(
        "Awareness is what inserts a pause between the stimulus and your response — stimulus, [pause], response — instead of stimulus jumping straight to reaction. Mapping your own triggers in advance, in a calm moment, is literally training for that pause: recognising a trigger in the moment gets faster every time you've already thought it through once.",
      ),
    ],
    practicalExercise:
      "The Practical Application section ahead walks you through mapping at least 3 real trigger situations in detail — situation, emotion, intensity, automatic reaction, actual response, likely cause, and a better response for next time.",
    reflectionQuestions: [
      "Think of the last time you reacted more strongly than the situation seemed to call for — what was really going on underneath?",
    ],
    actionTask: "Complete \"My Emotional Triggers\" in the Practical Application section, mapping at least 3 real situations.",
    keyTakeaways: [
      "A trigger is personal — the same situation can be neutral for one person and genuinely painful for another, usually because of history underneath it.",
      "The emotion itself isn't the problem; acting on it automatically, without noticing the gap, is where trouble starts.",
      "Mapping your triggers in a calm moment trains the pause between stimulus and response, so it's available faster when you actually need it.",
    ],
  },
  {
    title: "Recognising Your Bad Patterns",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "A single mistake teaches you something and moves on. A pattern keeps producing the same result until you actually name it.",
    blocks: [
      quote("A mistake is something that happens. A pattern is something that keeps happening."),
      heading("Common Patterns"),
      list([
        "Repeated procrastination",
        "Starting but not finishing",
        "Avoiding difficult tasks",
        "Seeking constant validation",
        "Giving up when results are slow",
        "Overthinking",
        "Impulsive decisions",
        "Negative self-talk",
        "Comparing yourself with others",
        "Making excuses",
      ]),
      heading("The Pattern Loop"),
      example("Trigger → Thought → Emotion → Behaviour → Result → Reinforcement"),
      paragraph(
        "A pattern survives because the result at the end of the loop often reinforces the thought at the start of it — procrastinating produces a rushed, mediocre result, which \"confirms\" the thought that you're not good under pressure anyway, which makes procrastinating easier to justify next time. The loop closes on itself. The good news: because there are multiple steps, there are multiple points where you can interrupt it — you don't have to wait for the result to change course.",
      ),
    ],
    practicalExercise:
      "A bonus activity in the Practical Application section walks you through breaking down one of your own patterns using this exact loop — trigger, thought, behaviour, result, and where you could interrupt it.",
    reflectionQuestions: ["What problem keeps repeating in your life?"],
    actionTask:
      "Name one pattern from the list above that you recognise in yourself, and identify the single moment in its loop where you'd have the most leverage to interrupt it.",
    keyTakeaways: [
      "A pattern is defined by repetition, not by any single instance — that's what makes it worth naming specifically.",
      "The Pattern Loop (Trigger → Thought → Emotion → Behaviour → Result → Reinforcement) closes on itself: the result often reinforces the thought that started it.",
      "Multiple steps in the loop mean multiple places to interrupt it — you don't have to wait until the result to change course.",
    ],
  },
  {
    title: "Understanding Your Environment",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "Willpower gets too much credit and environment gets too little. This lesson is about seeing what's actually shaping your behaviour from the outside in.",
    blocks: [
      heading("What \"Environment\" Includes"),
      list(["People", "Physical environment", "Digital environment", "Social media", "Information consumption", "Daily routines", "Culture", "Work environment"]),
      heading("Responsibility Still Matters"),
      paragraph(
        "None of this removes personal responsibility — but environment makes certain behaviours meaningfully easier or harder. Junk food within reach gets eaten more than junk food that isn't in the house at all, even for someone with identical willpower in both scenarios. Designing your environment on purpose is a legitimate form of discipline, not a way around it.",
      ),
      heading("Your Digital Environment, Specifically"),
      paragraph("Worth evaluating honestly, since it's often the least examined part of anyone's environment:"),
      list(["Social media usage", "Notifications", "Apps", "Content you consume", "People you follow", "People you communicate with", "Time spent online"]),
    ],
    practicalExercise:
      "Two things wait in the Practical Application section: a bonus Environment Audit (sort what's helping, what's borderline, and what to remove) and the required \"My Top 5 Distractions\" task.",
    reflectionQuestions: [
      "If a stranger only had access to your phone's screen time report and follow list, what would they assume matters most to you?",
    ],
    actionTask: "Complete the Environment Audit and \"My Top 5 Distractions\" in the Practical Application section.",
    keyTakeaways: [
      "Environment doesn't remove responsibility, but it makes certain behaviours meaningfully easier or harder — designing it on purpose is a form of discipline.",
      "Digital environment (social media, notifications, who you follow) is often the least examined part of anyone's environment, and one of the most influential.",
      "Auditing your environment honestly is the first step to changing what it's making easy versus hard.",
    ],
  },
  {
    title: "Self-Talk",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "The conversation running in your own head, most of the day, shapes your confidence and behaviour more than almost anything anyone else says to you.",
    blocks: [
      heading("What Self-Talk Is"),
      paragraph(
        "Self-talk is the internal dialogue you run with yourself, almost constantly, mostly without noticing it. It's easy to underestimate how much of it there is, because it's so familiar it stops registering as \"talk\" at all.",
      ),
      heading("Positive vs Negative vs Realistic"),
      paragraph(
        "Negative self-talk narrates every setback as proof of a permanent flaw. \"Positive thinking,\" taken too far, pretends the setback doesn't matter at all. Realistic self-talk does neither — it names what actually happened and asks a useful next question instead of a defeated or a fake-cheerful one.",
      ),
      heading("How Repeated Thoughts Become Beliefs"),
      paragraph(
        "A thought said to yourself once is just a thought. A thought repeated hundreds of times stops feeling like a thought and starts feeling like a fact about who you are — which is exactly why the specific words you use with yourself, over time, matter more than they seem to in any single moment.",
      ),
      heading("Reframing Examples"),
      example("Instead of: \"I always fail.\"\nUse: \"This attempt didn't work. I need to understand why and improve.\""),
      example("Instead of: \"I'm not good at this.\"\nUse: \"I'm not good at this yet.\""),
      example("Instead of: \"I can't do it.\"\nUse: \"I don't know how to do it yet. What do I need to learn?\""),
    ],
    practicalExercise:
      "A bonus Thought Reframe activity in the Practical Application section walks a real automatic thought of yours through this exact process, step by step.",
    reflectionQuestions: ["What's a sentence you say to yourself, in your own head, more often than you'd say it out loud to someone you cared about?"],
    actionTask: "Catch one instance of negative self-talk today and rewrite it in the moment, on paper or in your notes app.",
    keyTakeaways: [
      "Self-talk is the internal dialogue running almost constantly, mostly beneath notice — which is exactly why it's worth deliberately examining.",
      "Realistic self-talk isn't fake positivity or self-criticism — it names what happened accurately and asks a useful next question.",
      "A thought repeated enough times stops feeling like a thought and starts feeling like a fact — which is why the specific wording you use with yourself matters over time.",
    ],
  },
  {
    title: "Becoming Intentional",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "This lesson closes the level by bringing everything together into one habit: choosing deliberately instead of operating on autopilot.",
    blocks: [
      heading("What Intentional Living Means"),
      paragraph(
        "Intentional living means your decisions, relationships, learning, time, habits, goals and environment are chosen on purpose — not defaulted into by whatever was easiest or loudest in the moment.",
      ),
      list(["Intentional decisions", "Intentional relationships", "Intentional learning", "Intentional use of time", "Intentional habits", "Intentional goals", "Intentional environment"]),
      quote("If you don't decide how to use your time, something else will decide for you."),
      heading("Four Questions Worth Asking Often"),
      list(
        [
          "What am I doing?",
          "Why am I doing it?",
          "Is it helping me become who I want to become?",
          "If I continue this for one year, where will it take me?",
        ],
        "number",
      ),
      paragraph(
        "Ten lessons ago, this level opened with a simple idea: you cannot improve what you refuse to examine. Everything since — your strengths and weaknesses, your values, your Why, your triggers, your patterns, your environment, your self-talk — has been that examination. This lesson is where it turns into a habit you keep using, not a one-time exercise you finish and set aside.",
      ),
    ],
    practicalExercise:
      "A bonus Personal Intentionality Plan in the Practical Application section turns the four questions above into concrete commitments — what you'll start, stop, continue, and take seriously. Complete it, then move on to the level's Final Assessment.",
    reflectionQuestions: [
      "What am I doing?",
      "Why am I doing it?",
      "Is it helping me become who I want to become?",
      "If I continue this for one year, where will it take me?",
    ],
    actionTask: "Complete the Personal Intentionality Plan, then move on to the Final Assessment — Self-Mastery Reflection.",
    keyTakeaways: [
      "Intentional living means decisions, relationships, time, habits and environment are chosen on purpose, not defaulted into.",
      "\"If you don't decide how to use your time, something else will decide for you\" — the four questions are a repeatable check, not a one-time exercise.",
      "This lesson closes the loop on the level: everything you've examined in the last nine lessons only matters once it turns into deliberate, ongoing choices.",
    ],
  },
];

// ---------- Practical Application: 5 required tasks + 5 bonus activities, in lesson order ----------
const TASKS = [
  {
    title: "Task 1 — Personal SWOT Analysis",
    xpReward: 20,
    instructions: [
      paragraph(
        "A four-quadrant look at where you stand right now. Be specific — \"I'm disorganised\" is a start; \"I lose momentum on projects that take longer than two weeks\" is something you can actually work with.",
      ),
    ],
    inputFields: swotFields(),
  },
  {
    title: "Task 2 — My Personal Values",
    xpReward: 20,
    instructions: [
      paragraph(
        "From the values you read about in Lesson 3, pick your top 5 and rank them. For each one, be honest about the gap between how important it is to you and how much your current life actually reflects it — that gap is exactly what this exercise is for.",
      ),
    ],
    inputFields: valuesFields(),
  },
  {
    title: "Task 3 — My Personal Why",
    xpReward: 20,
    instructions: [
      paragraph(
        "Run the 5 Whys exercise from Lesson 4 on your own goal — each answer should dig one layer deeper than the last, not just restate the one before it. Then write your Personal Why Statement using what you find.",
      ),
      example("Why do I want to become successful?\n→ Because I want financial freedom.\nWhy?\n→ Because I don't want to depend on other people.\nWhy?\n→ Because I want control over my decisions."),
    ],
    inputFields: whyStatementFields(),
  },
  {
    title: "Task 4 — My Emotional Triggers",
    xpReward: 20,
    instructions: [
      paragraph(
        "Map at least 3 real situations from your own life where something triggered a strong emotional reaction. Use actual events, not hypothetical ones — the specificity is what makes this useful.",
      ),
    ],
    inputFields: triggerMappingFields(3),
  },
  {
    title: "Task 5 — My Top 5 Distractions",
    xpReward: 20,
    instructions: [
      paragraph(
        "Identify your five biggest distractions — the things that reliably pull your time and attention away from what actually matters to you. For each one, be honest about what it's really costing you.",
      ),
    ],
    inputFields: distractionFields(5),
  },
  {
    title: "Bonus — Strength & Weakness Inventory",
    xpReward: 10,
    instructions: [
      paragraph(
        "Optional, but worth doing before Task 1's SWOT — a closer look at 5 strengths and 5 weaknesses than a four-quadrant grid has room for. For each one, explain how it actually shows up in your life.",
      ),
    ],
    inputFields: strengthWeaknessBonusFields(),
  },
  {
    title: "Bonus — Pattern Loop Breakdown",
    xpReward: 10,
    instructions: [
      paragraph("Take the repeating problem you named in Lesson 7 and run it through the full loop: Trigger → Thought → Behaviour → Result → Interrupt."),
    ],
    inputFields: patternLoopFields(),
  },
  {
    title: "Bonus — Environment Audit",
    xpReward: 10,
    instructions: [
      paragraph("Sort your environment — people, digital habits, physical space, routines — into three honest categories: Keep, Reduce, and Remove."),
    ],
    inputFields: environmentAuditFields(),
  },
  {
    title: "Bonus — Thought Reframe",
    xpReward: 10,
    instructions: [
      paragraph("Take one real automatic thought from the last few days and put it through the full reframe process from Lesson 9, step by step."),
    ],
    inputFields: thoughtReframeFields(),
  },
  {
    title: "Bonus — Personal Intentionality Plan",
    xpReward: 15,
    instructions: [
      paragraph(
        "The level's capstone exercise. Turn everything you've examined across these 10 lessons into concrete, specific commitments — not vague intentions.",
      ),
    ],
    inputFields: intentionalityPlanFields(),
  },
];

// ---------- Final Assessment: 18 written questions, all question_type='written' ----------
const REFLECTION_QUESTIONS = [
  { part: "Part 1 · Self-Awareness", prompt: "What are your 5 strongest qualities?" },
  { part: "Part 1 · Self-Awareness", prompt: "What are 3 weaknesses you're actively working on?" },
  { part: "Part 1 · Self-Awareness", prompt: "What have you learned about yourself during this level?" },
  { part: "Part 2 · Values", prompt: "What are your top 5 values?" },
  { part: "Part 2 · Values", prompt: "Which value do you currently struggle to live by?" },
  { part: "Part 2 · Values", prompt: "What action will help you align with it?" },
  { part: "Part 3 · Emotional Awareness", prompt: "What are your biggest emotional triggers?" },
  { part: "Part 3 · Emotional Awareness", prompt: "How do you normally react?" },
  { part: "Part 3 · Emotional Awareness", prompt: "What will you do differently next time?" },
  { part: "Part 4 · Behaviour Patterns", prompt: "What negative pattern have you identified?" },
  { part: "Part 4 · Behaviour Patterns", prompt: "What usually triggers it?" },
  { part: "Part 4 · Behaviour Patterns", prompt: "What new behaviour will you use to interrupt it?" },
  { part: "Part 5 · Environment", prompt: "What is one environmental factor helping your growth?" },
  { part: "Part 5 · Environment", prompt: "What is one environmental factor holding you back?" },
  { part: "Part 6 · Intentionality", prompt: "What are you going to start?" },
  { part: "Part 6 · Intentionality", prompt: "What are you going to stop?" },
  { part: "Part 6 · Intentionality", prompt: "What are you going to continue?" },
  { part: "Part 7 · Personal Why", prompt: "Write your Personal Why Statement." },
];

async function main() {
  console.log("Signing in as admin…");
  const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) throw authError;

  console.log("Looking up the Level 2 learning path…");
  const { data: path, error: pathLookupError } = await supabase
    .from("learning_paths")
    .select("id")
    .eq("title", PATH_TITLE)
    .eq("section", "mind_training")
    .single();
  if (pathLookupError) throw pathLookupError;
  const PATH_ID = path.id;

  console.log("Publishing the path and creating the level…");
  const { error: pathPublishError } = await supabase.from("learning_paths").update({ published: true }).eq("id", PATH_ID);
  if (pathPublishError) throw pathPublishError;

  const { data: level, error: levelError } = await supabase
    .from("mind_training_levels")
    .insert({
      path_id: PATH_ID,
      title: "Level 2 — Self-Awareness & Self-Mastery",
      description: "You cannot master what you don't understand.",
      milestone_key: "self_aware",
      milestone_title: "Self-Aware",
      milestone_icon: "🏆",
      milestone_description:
        "You cannot master what you don't understand. The better you understand yourself, the better you can direct your thoughts, habits, decisions and actions.",
      order_index: 2,
      published: true,
    })
    .select()
    .single();
  if (levelError) throw levelError;
  const LEVEL_ID = level.id;

  async function createModule(title, description, orderIndex) {
    const { data, error } = await supabase
      .from("mind_training_modules")
      .insert({ level_id: LEVEL_ID, title, description, order_index: orderIndex, published: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  console.log("Creating modules…");
  const moduleCore = await createModule(
    "Core Lessons",
    "Ten lessons on understanding your thoughts, values, triggers, patterns and environment — the foundation self-mastery is built on.",
    1,
  );
  const moduleTasks = await createModule(
    "Practical Application",
    "Turn what you've learned into a real, personal inventory — your strengths and weaknesses, your values, your Why, your triggers, and your distractions.",
    2,
  );
  const moduleAssessment = await createModule(
    "Final Assessment",
    "Eighteen reflection questions across seven parts — not a quiz, a genuine check of whether you understand yourself better than when you started.",
    3,
  );

  console.log("Inserting 10 lessons…");
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

  console.log("Inserting 5 practical tasks + 5 bonus activities…");
  for (const [i, task] of TASKS.entries()) {
    const isBonus = task.title.startsWith("Bonus");
    const { error } = await supabase.from("mind_training_activities").insert({
      module_id: moduleTasks.id,
      title: task.title,
      instructions: task.instructions,
      order_index: i + 1,
      published: true,
      category: "practical_task",
      is_required: !isBonus,
      xp_reward: task.xpReward,
      input_fields: task.inputFields,
    });
    if (error) throw error;
    console.log(`  ${task.title}${isBonus ? " (optional)" : ""}`);
  }

  console.log("Creating the Final Assessment — Self-Mastery Reflection…");
  const { data: assessment, error: assessmentError } = await supabase
    .from("mind_training_assessments")
    .insert({
      module_id: moduleAssessment.id,
      title: "Self-Mastery Reflection",
      pass_score_percent: 70,
      xp_reward: 50,
    })
    .select()
    .single();
  if (assessmentError) throw assessmentError;

  console.log("Inserting 18 written reflection questions…");
  for (const [i, q] of REFLECTION_QUESTIONS.entries()) {
    const { error } = await supabase.from("mind_training_assessment_questions").insert({
      assessment_id: assessment.id,
      prompt: `${q.part} — ${q.prompt}`,
      question_type: "written",
      order_index: i + 1,
    });
    if (error) throw error;
    console.log(`  Q${i + 1}: ${q.part} — ${q.prompt}`);
  }

  console.log("\nDone. Level 2 — Self-Awareness & Self-Mastery is fully seeded and published.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
