// Content seeder for Mind Training Level 1 — Mindset Foundation.
//
// Populates real lesson/task/challenge/assessment content directly via the
// same RLS an admin already has (current_role() = 'admin' insert/update on
// every mind_training_* table, 0066-0070) — no service_role key needed,
// just an admin session, same as every other write in the admin UI this
// content could equally have been typed into by hand. A script instead of
// clicking through the UI ~120 times because the content volume here
// (10 lessons + 3 tasks + 7 challenge days + 15 quiz questions x4 options)
// makes that impractical, not because the data model needs anything the
// admin UI can't also produce.
//
// Reuses the one "Mindset Foundation" path + "Level 1" row already created
// while building the Mind Training feature (rather than inserting a
// duplicate) -- renames/fills them in rather than creating new rows, and
// replaces the placeholder test module from that earlier build with the
// real content below.
//
// This file is also the template for Levels 2-10: the shape here (one
// level -> a "Core Lessons" module, a "Practical Application" module, an
// optional challenge module, a "Final Assessment" module) is exactly what
// MindTrainingPathManager.jsx's admin UI already supports end to end --
// copy this file, change the content, done.
//
// Usage: node supabase/seed-mind-training-level-1.mjs
//   Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (already in .env) and
//   an admin account's credentials, passed via env so they're never
//   hardcoded in a committed file:
//     SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node supabase/seed-mind-training-level-1.mjs
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

const PATH_ID = "734b8850-e743-4323-9096-b99696e61c9f"; // learning_paths: "Mindset Foundation"
const LEVEL_ID = "3b6d8bda-483c-4cb9-9842-1bab74f7ffb9"; // mind_training_levels: reused, renamed below

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

// ---------- shared input-field builders (used by the Practical Application tasks) ----------
function beliefInventoryFields() {
  const fields = [];
  for (let i = 1; i <= 5; i++) {
    fields.push(
      { key: `belief${i}_statement`, label: `Belief #${i} — What is the belief?`, type: "text" },
      { key: `belief${i}_origin`, label: `Belief #${i} — Where do you think it came from?`, type: "textarea" },
      { key: `belief${i}_evidence_for`, label: `Belief #${i} — What evidence appears to support it?`, type: "textarea" },
      { key: `belief${i}_evidence_against`, label: `Belief #${i} — What evidence challenges it?`, type: "textarea" },
      { key: `belief${i}_impact`, label: `Belief #${i} — How has this belief affected your behaviour?`, type: "textarea" },
    );
  }
  return fields;
}
function reframeFields() {
  const fields = [];
  for (let i = 1; i <= 5; i++) {
    fields.push(
      { key: `belief${i}_old`, label: `Belief #${i} — Old belief (from Task 1)`, type: "textarea" },
      { key: `belief${i}_new`, label: `Belief #${i} — New belief (realistic, actionable, believable)`, type: "textarea" },
    );
  }
  return fields;
}
function weaknessFields() {
  const fields = [];
  for (let i = 1; i <= 3; i++) {
    fields.push(
      { key: `weakness${i}_what`, label: `Weakness #${i} — What is the weakness?`, type: "text" },
      { key: `weakness${i}_effect`, label: `Weakness #${i} — How does it affect you?`, type: "textarea" },
      { key: `weakness${i}_cause`, label: `Weakness #${i} — What causes it?`, type: "textarea" },
      { key: `weakness${i}_behavior`, label: `Weakness #${i} — One behaviour you'll change to improve it`, type: "textarea" },
    );
  }
  return fields;
}

// ---------- the 10 core lessons ----------
const LESSONS = [
  {
    title: "What Is Mindset?",
    estimatedMinutes: 8,
    xpReward: 10,
    intro:
      "Mindset gets talked about so often that the word has almost lost its meaning. Before anything else in this level, you need a working definition — one you can actually use, not a poster on a wall.",
    blocks: [
      heading("A Working Definition"),
      paragraph(
        "Your mindset is the set of thoughts, beliefs and habitual interpretations you use to make sense of what happens to you. It's not a personality trait you're born with — it's closer to a lens. The same event passes through it every time, and the lens shapes what you notice, what you feel, and what you decide to do next.",
      ),
      heading("The Chain Behind Every Result"),
      paragraph(
        "Nothing you do happens in a vacuum. Every action you take is downstream of a decision, every decision downstream of a belief, and every belief downstream of a thought. Written out, it looks like this:",
      ),
      example("Thought → Belief → Decision → Action → Result"),
      paragraph(
        "This is why two people can go through the identical situation — the same rejected pitch, the same slow month, the same difficult conversation — and come out the other side doing completely different things. It isn't the situation that decided their next move. It was what each of them made the situation mean.",
      ),
      heading("Positive Is Not the Same as Useful"),
      paragraph(
        "A lot of what gets called \"mindset work\" is really just forced positivity — telling yourself everything is fine when it isn't. That's not what this level is about, and it isn't especially useful. A positive mindset can just be denial with better branding. A useful mindset is different: it looks at what's actually happening, including the parts that are difficult, and still asks a productive question instead of a defeated one.",
      ),
      paragraph(
        "Mindset work is not pretending a problem doesn't exist. It's choosing what you do with the problem once you've admitted it's real.",
      ),
      heading("Mindset Is Trainable"),
      paragraph(
        "The most practical thing to understand about mindset is that it isn't fixed. It was built the same way any habit is built — through repetition — which means it can also be rebuilt the same way. That's the entire premise of this level: not that you'll feel different by the end of it, but that you'll have practiced thinking differently enough times that it starts to hold under real conditions.",
      ),
    ],
    practicalExercise:
      "Think back over the last few weeks. Identify one situation where your mindset — the way you interpreted what happened — directly shaped how you behaved afterward. Write down what happened, what you told yourself about it, and what you did as a result.",
    reflectionQuestions: [
      "How would you describe your current mindset?",
      "How do you normally respond when things don't go your way?",
      "What kind of thinker do you want to become?",
    ],
    actionTask: "Identify one real situation where your mindset affected your behaviour, and write it down before moving to Lesson 2.",
    keyTakeaways: [
      "Mindset is the lens you interpret events through — not a fixed trait, a trainable pattern.",
      "The same situation produces different results in different people because of what happens between the event and the action: thought, belief, decision.",
      "Useful is a higher bar than positive. Mindset work means facing reality accurately, not avoiding it.",
    ],
  },
  {
    title: "How Your Thinking Controls Your Actions",
    estimatedMinutes: 9,
    xpReward: 10,
    intro:
      "Lesson 1 introduced the chain. This lesson slows it down and walks through it step by step, using situations you'll recognize.",
    blocks: [
      heading("The Full Chain"),
      paragraph(
        "A single thought rarely jumps straight to a result. There are steps in between, and each one is where you actually have a chance to intervene:",
      ),
      example("Thought → Interpretation → Emotion → Decision → Action → Result"),
      paragraph("Three examples make this concrete."),
      heading("Network Marketing"),
      example(
        "Thought: \"I don't think people will listen to me.\"\n→ Interpretation: rejection is likely and personal.\n→ Emotion: anxiety.\n→ Decision: avoid the conversation.\n→ Action: fewer conversations started.\n→ Result: fewer opportunities, which then \"confirms\" the original thought.",
      ),
      heading("Freelancing"),
      example(
        "Thought: \"I'm not good enough to charge that much.\"\n→ Interpretation: my price has to match my self-doubt, not the market.\n→ Emotion: insecurity.\n→ Decision: underprice the work.\n→ Action: accept low-paying, low-respect projects.\n→ Result: poor positioning that reinforces \"I'm not worth more.\"",
      ),
      heading("Personal Growth"),
      example(
        "Thought: \"I always procrastinate.\"\n→ Interpretation: this is who I am, not something I'm currently doing.\n→ Emotion: resignation.\n→ Decision: stop trying to change it.\n→ Action: less effort invested in fixing it.\n→ Result: the behaviour continues, and the identity gets stronger.",
      ),
      heading("Thoughts Are Not Automatically Facts"),
      paragraph(
        "Notice that in all three examples, nothing about the external world forced the outcome. The thought arrived first — often automatically, without being chosen — and everything after it followed from treating that thought as true without checking it. A thought is a mental event, not a verdict. The chain only locks in when the thought goes unquestioned.",
      ),
    ],
    practicalExercise:
      "Take this situation: you post about your business or service and get zero engagement for a week. Write out your own version of the chain for this — the thought you'd likely have, the emotion it would trigger, the decision it would lead to, the action, and the probable result.",
    reflectionQuestions: ["What thought has influenced one of your recent decisions?"],
    actionTask:
      "Using a real recent decision, write out: Thought, Emotion, Decision, Action, Result. Be specific — use the actual situation, not a hypothetical.",
    keyTakeaways: [
      "Thought → Interpretation → Emotion → Decision → Action → Result is not abstract theory — it plays out in specific, nameable steps.",
      "The same unchecked thought pattern shows up across very different areas of life: business, pricing, and personal habits.",
      "Because the chain has multiple steps, there are multiple points where you can interrupt it — you don't have to wait until the result to change course.",
    ],
  },
  {
    title: "Fixed Mindset vs Growth Mindset",
    estimatedMinutes: 8,
    xpReward: 10,
    intro:
      "This is one of the most referenced ideas in personal development, and also one of the most misunderstood. This lesson defines both terms precisely, and corrects the most common misreading of \"growth mindset.\"",
    blocks: [
      heading("Fixed Mindset"),
      paragraph("A fixed mindset treats ability as a fixed quantity — you either have it or you don't. It sounds like:"),
      list([
        "\"I'm either good at this or I'm not.\"",
        "\"I can't do this.\"",
        "\"Failure proves I'm not capable.\"",
        "\"People's opinions define my ability.\"",
        "\"If I'm not naturally talented, there is no point.\"",
      ]),
      heading("Growth Mindset"),
      paragraph("A growth mindset treats ability as something built over time. It sounds like:"),
      list([
        "\"I can improve.\"",
        "\"I don't know how yet.\"",
        "\"Failure gives me information.\"",
        "\"Feedback can make me better.\"",
        "\"Skills can be developed through learning and practice.\"",
      ]),
      heading("What Growth Mindset Does NOT Mean"),
      paragraph("The idea gets distorted into something unhelpful when people take it to mean:"),
      quote("\"I can do absolutely anything instantly.\""),
      paragraph("That isn't growth mindset — that's wishful thinking with a rebrand. The accurate version is narrower and far more useful:"),
      quote("\"I can improve my ability through learning, practice, feedback and persistence.\""),
      paragraph(
        "That distinction matters because the exaggerated version sets people up to feel like failures the moment growth mindset \"doesn't work\" fast enough. The accurate version sets an expectation you can actually meet.",
      ),
    ],
    practicalExercise:
      "Situation: you sent 20 proposals and got no client.\n\nFixed response: \"Freelancing isn't for me.\"\nGrowth response: \"Something about my proposals, offer, targeting or portfolio needs improvement.\"\n\nWrite your own fixed-mindset response and growth-mindset response to this same situation, in your own words — not copied from the example.",
    reflectionQuestions: ["Where in your life do you currently default to a fixed response instead of a growth response?"],
    actionTask: "Pick one area where you've been thinking with a fixed mindset, and write the growth-mindset reframe of it.",
    keyTakeaways: [
      "Fixed mindset treats ability as static; growth mindset treats it as buildable.",
      "Growth mindset is not \"I can do anything instantly\" — it's \"I can improve through learning, practice, feedback and persistence.\"",
      "The same situation can be read either way. The situation doesn't decide which one you use — you do.",
    ],
  },
  {
    title: "The Power of Beliefs",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Thoughts are momentary. Beliefs are what a thought becomes once it's been repeated enough to feel like fact.",
    blocks: [
      heading("The Belief Loop"),
      paragraph("Beliefs don't just sit quietly in the background — they actively generate the results that then go on to confirm them:"),
      example("Belief → Expectation → Behaviour → Result → Reinforced Belief"),
      paragraph(
        "A belief sets an expectation. The expectation shapes behaviour, often without you noticing. The behaviour produces a result. And the result gets filed as evidence for the belief you started with — even when the belief itself is what produced the result in the first place.",
      ),
      heading("Where Beliefs Come From"),
      paragraph("Almost none of your beliefs were chosen deliberately. Most were absorbed from:"),
      list(["Family", "Environment", "Past experiences", "Society", "Friends", "Previous failures", "Repeated self-talk"]),
      paragraph(
        "Because they were absorbed rather than chosen, beliefs tend to become invisible assumptions — background rules you're operating by without ever having agreed to them consciously.",
      ),
      heading("An Event Is Not an Identity"),
      paragraph("There's a meaningful difference between these two sentences:"),
      quote("\"I failed.\""),
      quote("\"I am a failure.\""),
      paragraph(
        "The first describes something that happened — a single event, bounded in time. The second builds an identity out of it, and identities are far harder to update than events. Once \"failure\" becomes something you are rather than something that happened, every future setback gets absorbed as further proof of an identity, instead of being treated as one data point.",
      ),
    ],
    practicalExercise:
      "Complete each sentence honestly, without editing yourself:\n\n\"I believe that I am...\"\n\"I believe that money is...\"\n\"I believe that success requires...\"\n\"I believe that failure means...\"\n\"I believe that people...\"\n\nThen go back through what you wrote and mark which beliefs are helping you and which may be limiting you.",
    reflectionQuestions: ["Which of your beliefs are helping you?", "Which of your beliefs may be limiting you?"],
    actionTask: "Pick the one belief from the exercise that surprised you most, and write down where you think it actually came from.",
    keyTakeaways: [
      "Beliefs create the very evidence that goes on to confirm them — the loop is self-reinforcing unless you interrupt it.",
      "Most beliefs were absorbed from your environment, not chosen — which is exactly why they're worth examining instead of assuming they're true.",
      "\"I failed\" describes an event. \"I am a failure\" builds an identity. Keep the two separate on purpose.",
    ],
  },
  {
    title: "Identifying Limiting Beliefs",
    estimatedMinutes: 10,
    xpReward: 10,
    intro:
      "You can't change a belief you haven't named. This lesson is about making the invisible visible — and it feeds directly into Task 1 in the Practical Application section.",
    blocks: [
      heading("What a Limiting Belief Actually Is"),
      paragraph(
        "A limiting belief is a belief that restricts the way you see yourself, your possibilities, or your available actions. It doesn't announce itself as a belief — it usually just feels like an obvious fact about reality.",
      ),
      heading("Common Examples"),
      list([
        "\"I'm not smart enough.\"",
        "\"I'm too young.\"",
        "\"I'm too old.\"",
        "\"Nobody will buy from me.\"",
        "\"I don't have enough connections.\"",
        "\"I always fail.\"",
        "\"I can't speak confidently.\"",
        "\"I'm bad with money.\"",
        "\"I don't have enough time.\"",
        "\"Successful people are just lucky.\"",
      ]),
      paragraph(
        "If any of these felt uncomfortably familiar as you read them, that's normal — and useful. Recognizing a limiting belief is the first real step toward loosening its grip.",
      ),
      heading("Why This Needs a Structured Process"),
      paragraph(
        "Limiting beliefs survive by staying vague. \"I'm not good enough\" is hard to argue with precisely because it's never been forced to specify what it means, where it came from, or whether it's actually backed by evidence. The practical task attached to this lesson exists to force that specificity.",
      ),
    ],
    practicalExercise:
      "This lesson's practical work happens in the Practical Application section that follows the 10 lessons: Task 1 asks you to identify five limiting beliefs and examine each one — what it is, where it came from, what evidence supports it, what evidence challenges it, and how it has affected your behaviour. Read this lesson fully, then complete Task 1 before moving on.",
    reflectionQuestions: [
      "Which limiting belief from the list above landed closest to home for you?",
      "How long have you been carrying that belief?",
    ],
    actionTask: "Start noticing, over the next day, every time a limiting belief shows up in your self-talk — even before you formally do Task 1.",
    keyTakeaways: [
      "A limiting belief restricts what you think is possible for yourself — and it usually disguises itself as plain fact.",
      "Limiting beliefs survive on vagueness. Naming them precisely is what starts to loosen them.",
      "This lesson sets up Task 1 — the actual identification work happens there, in the Practical Application section.",
    ],
  },
  {
    title: "Reprogramming Negative Thinking",
    estimatedMinutes: 9,
    xpReward: 10,
    intro:
      "This lesson gives you a repeatable framework for what to do with an unhelpful thought once you've noticed it — without resorting to fake positivity.",
    blocks: [
      heading("The Framework: NOTICE → QUESTION → REFRAME → ACT"),
      list(
        [
          "NOTICE — \"What am I thinking?\" Name the thought precisely instead of just feeling its effect.",
          "QUESTION — \"Is this thought completely true?\" Look for the gap between the thought and the actual evidence.",
          "REFRAME — \"What is a more accurate and useful way to look at this?\" Not a fake-positive rewrite — an accurate one.",
          "ACT — \"What action can I take?\" A reframe that doesn't lead to an action hasn't actually changed anything yet.",
        ],
        "number",
      ),
      heading("Worked Example"),
      example(
        "Negative thought: \"Nobody wants what I'm offering.\"\nQuestion: \"Nobody? Is that actually true?\"\nReframe: \"Some people may not need it. I need to improve my targeting and find people who do.\"\nAction: \"I will identify a better audience and start 5 new conversations.\"",
      ),
      paragraph(
        "Notice what this framework is not doing: it isn't telling you the negative thought is wrong, or that you should just \"think positive.\" It's testing the thought against reality, and then asking what you'll actually do about what's left once the exaggeration is stripped out.",
      ),
    ],
    practicalExercise:
      "Reframe each of these three thoughts using NOTICE → QUESTION → REFRAME → ACT. Write out all four steps for each one — don't skip to the reframe:\n\n1. \"I always mess up important conversations.\"\n2. \"I'll never be as successful as [someone else].\"\n3. \"There's no point trying, this never works out for me.\"",
    reflectionQuestions: ["Which of the three thoughts above felt closest to something you actually think?"],
    actionTask: "The next time you catch yourself in a negative thought today, run it through all four steps in real time, even briefly.",
    keyTakeaways: [
      "NOTICE → QUESTION → REFRAME → ACT is a process, not a slogan — each step does a specific job.",
      "Reframing is not the same as denying. A good reframe survives contact with the evidence; forced positivity doesn't.",
      "A reframe without an action is just a nicer-sounding thought. The framework isn't complete until you act.",
    ],
  },
  {
    title: "Taking Responsibility for Your Life",
    estimatedMinutes: 9,
    xpReward: 10,
    intro: "Responsibility gets confused with two things it isn't: blaming everyone else, and blaming only yourself. This lesson draws a clear line between all three.",
    blocks: [
      heading("Three Different Postures"),
      list([
        "Blame — \"Everything is someone else's fault.\"",
        "Self-Blame — \"Everything bad that happens is because I'm terrible.\"",
        "Responsibility — \"I may not control everything, but I will focus on what I can control.\"",
      ]),
      paragraph(
        "Blame and self-blame look opposite, but they do the same thing: they put your attention entirely outside your own next action. Responsibility is the only one of the three that actually leads anywhere.",
      ),
      heading("The Circle of Control"),
      paragraph("A useful way to apply responsibility in practice is to sort your attention into three zones:"),
      heading("I Control"),
      list(["My effort", "My attitude", "My preparation", "My learning", "My actions", "My response"]),
      heading("I Influence"),
      list(["Relationships", "Team culture", "Client relationships", "Prospects", "Opportunities"]),
      heading("I Don't Control"),
      list(["Other people's decisions", "Other people's opinions", "The past", "Every external circumstance", "Every outcome"]),
      paragraph(
        "Most frustration comes from spending your energy on the third column as if it were the first. The Circle of Control doesn't ask you to stop caring about what you can't control — it asks you to stop spending your effort there.",
      ),
    ],
    practicalExercise:
      "List three things you're currently frustrated about. For each one, sort it: is it something you control, something you influence, or something you don't control? Then, for anything in the first two categories, write one specific action.",
    reflectionQuestions: ["What are you currently complaining about that you could instead take action on?"],
    actionTask: "Pick one item from your \"I Control\" list that you've been neglecting, and do something about it today.",
    keyTakeaways: [
      "Blame and self-blame both put your attention outside your own next action — responsibility is what actually moves you forward.",
      "The Circle of Control sorts your energy: control it, influence it, or release it.",
      "Most wasted frustration comes from treating the \"I don't control\" column as if it belonged in the first.",
    ],
  },
  {
    title: "Stop Blaming, Start Building",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "This lesson takes responsibility one step further — from an internal stance into a specific habit of asking better questions.",
    blocks: [
      heading("Two Default Questions"),
      list([
        "Complaint Mindset — \"Why is this happening to me?\"",
        "Builder Mindset — \"What can I do about it?\"",
      ]),
      paragraph("The situation doesn't decide which question you ask. Here's the same set of complaints, converted:"),
      example("Instead of: \"I don't have enough money.\"\nAsk: \"What skill can I develop that can increase my earning ability?\""),
      example("Instead of: \"Nobody is joining my team.\"\nAsk: \"How can I improve my prospecting, communication, follow-up and value?\""),
      example("Instead of: \"I don't have enough time.\"\nAsk: \"Where is my time actually going?\""),
      example("Instead of: \"I'm not good at designing.\"\nAsk: \"What do I need to learn and practice?\""),
      paragraph(
        "Notice that the Builder Mindset question is always more specific than the complaint it replaces. That's not a coincidence — specificity is what makes a question answerable, and an answerable question is what leads to an action.",
      ),
    ],
    practicalExercise:
      "This lesson's practical work happens in the Practical Application section: Task 3 asks you to identify your three biggest current mindset weaknesses and convert each one into a specific improvement behaviour, using the same Complaint → Builder shift shown above.",
    reflectionQuestions: ["What complaint have you repeated most often in the last month?"],
    actionTask: "Convert that recurring complaint into a Builder Mindset question, right now, in writing.",
    keyTakeaways: [
      "\"Why is this happening to me?\" and \"What can I do about it?\" are both available in every situation — you choose which one you default to.",
      "A Builder Mindset question is always more specific than the complaint it replaces, which is exactly what makes it actionable.",
      "This converts directly into Task 3's weakness-to-behaviour work.",
    ],
  },
  {
    title: "Developing a Positive but Realistic Mind",
    estimatedMinutes: 8,
    xpReward: 10,
    intro: "There's a difference between optimism and denial, and this level has been building toward being precise about it.",
    blocks: [
      heading("Three Positions"),
      list([
        "Toxic Positivity — \"Everything will work out somehow.\" (ignores the problem)",
        "Negative Thinking — \"Nothing will ever work.\" (ignores the possibility)",
        "Realistic Optimism — \"This may be difficult, but there are things I can learn, control and improve.\" (holds both at once)",
      ]),
      paragraph(
        "Realistic optimism is harder to sustain than either extreme, because it requires holding two things in mind simultaneously: the problem is real, and you're not powerless in front of it.",
      ),
      heading("What Realistic Optimism Looks Like in Practice"),
      list([
        "Accept reality — don't argue with what's actually happening.",
        "Recognise problems — name them specifically, not vaguely.",
        "Look for solutions — even partial ones.",
        "Maintain hope — grounded in what you can influence, not wishful thinking.",
        "Prepare for challenges — expect friction instead of being surprised by it.",
        "Avoid catastrophising — one setback is one data point, not the whole story.",
        "Avoid pretending problems don't exist — that's toxic positivity wearing a different outfit.",
      ]),
    ],
    practicalExercise:
      "For each situation below, write the toxic-positivity response, the negative-thinking response, and the realistic-optimism response:\n\n1. A launch that generated far less interest than expected.\n2. A team member who quit unexpectedly.\n3. A client who is unhappy with delivered work.",
    reflectionQuestions: ["Which of the three positions — toxic positivity, negative thinking, or realistic optimism — do you default to under pressure?"],
    actionTask: "Take one real problem you're currently facing and write its realistic-optimism response.",
    keyTakeaways: [
      "Toxic positivity avoids the problem. Negative thinking avoids the possibility. Realistic optimism holds both.",
      "Realistic optimism is a skill, not a personality — it's built the same way the rest of this level's tools are: through repeated, deliberate practice.",
      "Naming a problem specifically is part of realistic optimism, not the opposite of it.",
    ],
  },
  {
    title: "Becoming a Student of Life",
    estimatedMinutes: 8,
    xpReward: 10,
    intro:
      "The final lesson isn't about a technique — it's about the posture that makes every other lesson in this level keep working after today.",
    blocks: [
      heading("The Habits of a Student"),
      list([
        "Curiosity",
        "Humility",
        "Reading",
        "Asking questions",
        "Seeking feedback",
        "Learning from mistakes",
        "Learning from successful people",
        "Learning from failures",
        "Developing skills",
        "Staying teachable",
      ]),
      quote("I don't have to know everything. I need to be willing to learn."),
      paragraph(
        "This isn't a comfortable principle for everyone. Staying teachable means admitting, repeatedly, that there's something you don't yet know — including about the very topic of this level. That admission is exactly what keeps you improving instead of plateauing.",
      ),
      heading("Why This Has to Be Ongoing"),
      paragraph(
        "Industries change. Technology changes. Markets change. Opportunities open and close. Someone who stops learning the moment they feel competent will find that competence quietly expiring underneath them. Staying a student isn't a phase you graduate out of — it's the operating condition for staying relevant at all.",
      ),
    ],
    practicalExercise:
      "Identify one person — someone you know personally, or someone you follow or study — whose thinking or results you respect. Write down one specific thing you could learn from how they operate, and one specific way you could start applying it.",
    reflectionQuestions: [
      "What skill do you need to improve?",
      "What behaviour do you need to change?",
      "What do you need to learn?",
      "Who can teach you?",
      "What will you start doing this week?",
    ],
    actionTask: "Pick one answer from the reflection above and take the first concrete step toward it this week.",
    keyTakeaways: [
      "Staying teachable requires repeatedly admitting you don't already know everything — including about mindset itself.",
      "Learning is not a phase before competence. It's the condition that keeps competence from expiring.",
      "This lesson closes the loop on the whole level: everything you've learned only keeps working if you keep learning.",
    ],
  },
];

// ---------- Practical Application: 3 tasks ----------
const TASKS = [
  {
    title: "Task 1 — Identify 5 Limiting Beliefs",
    xpReward: 20,
    instructions: [
      paragraph(
        "For each of the five beliefs below, be specific and honest. Vague answers keep a limiting belief in place — precise ones start to loosen it.",
      ),
    ],
    inputFields: beliefInventoryFields(),
  },
  {
    title: "Task 2 — Replace Each With an Empowering Belief",
    xpReward: 20,
    instructions: [
      paragraph(
        "Using the five beliefs from Task 1, write a replacement for each one. The replacement should not be a fake affirmation — it should be realistic, actionable and believable.",
      ),
      example("Old Belief: \"I am not good at selling.\"\nNew Belief: \"I can become better at communicating value by learning and practicing.\""),
    ],
    inputFields: reframeFields(),
  },
  {
    title: "Task 3 — Current Mindset Weaknesses",
    xpReward: 20,
    instructions: [
      paragraph(
        "Identify the three biggest weaknesses in your current mindset. For each one: name it, explain how it affects you, identify what causes it, and choose one behaviour that would improve it.",
      ),
    ],
    inputFields: weaknessFields(),
  },
];

// ---------- 7-Day Mindset Awareness Challenge ----------
const CHALLENGE_DAYS = [
  {
    title: "Day 1 — Observe Your Thoughts",
    xpReward: 10,
    instructions: [paragraph("Before you can change your thinking, you have to actually notice it. Today is pure observation — no fixing yet.")],
    inputFields: [
      { key: "thought1", label: "Recurring thought #1", type: "text" },
      { key: "thought2", label: "Recurring thought #2", type: "text" },
      { key: "thought3", label: "Recurring thought #3", type: "text" },
    ],
  },
  {
    title: "Day 2 — Catch Negative Thinking",
    xpReward: 10,
    instructions: [paragraph("Narrow yesterday's observation down to thoughts that are working against you.")],
    inputFields: [
      { key: "negative1", label: "Negative or unhelpful thought #1", type: "text" },
      { key: "negative2", label: "Negative or unhelpful thought #2", type: "text" },
      { key: "negative3", label: "Negative or unhelpful thought #3", type: "text" },
    ],
  },
  {
    title: "Day 3 — Reframe",
    xpReward: 10,
    instructions: [paragraph("Take one thought from Day 2 and put it through a real reframe — accurate, not just positive.")],
    inputFields: [
      { key: "negative_thought", label: "The negative thought you're reframing", type: "textarea" },
      { key: "realistic_alternative", label: "A more accurate, useful alternative", type: "textarea" },
    ],
  },
  {
    title: "Day 4 — Take Responsibility",
    xpReward: 10,
    instructions: [paragraph("Find one thing you've been blaming on circumstances or other people, and separate out what's actually yours to work with.")],
    inputFields: [
      { key: "blame_situation", label: "What have you been blaming on circumstances or people?", type: "textarea" },
      { key: "what_you_control", label: "What, specifically, can you control in this situation?", type: "textarea" },
    ],
  },
  {
    title: "Day 5 — Learn From Failure",
    xpReward: 10,
    instructions: [paragraph("Pick one recent failure and mine it for what it actually taught you — not what it says about your worth.")],
    inputFields: [
      { key: "failure_description", label: "What happened?", type: "textarea" },
      { key: "lesson1", label: "Lesson #1", type: "text" },
      { key: "lesson2", label: "Lesson #2", type: "text" },
      { key: "lesson3", label: "Lesson #3", type: "text" },
    ],
  },
  {
    title: "Day 6 — Practice Gratitude + Realism",
    xpReward: 10,
    instructions: [paragraph("Gratitude and realism aren't opposites — today, practice both at once.")],
    inputFields: [
      { key: "gratitude1", label: "Something you appreciate #1", type: "text" },
      { key: "gratitude2", label: "Something you appreciate #2", type: "text" },
      { key: "gratitude3", label: "Something you appreciate #3", type: "text" },
      { key: "problem", label: "One problem you're facing", type: "textarea" },
      { key: "action", label: "One action you can take about it", type: "textarea" },
    ],
  },
  {
    title: "Day 7 — Mindset Review",
    xpReward: 15,
    instructions: [paragraph("Close out the week by reviewing what actually changed — not in theory, in your own thinking.")],
    inputFields: [
      { key: "discovery", label: "What did I discover about myself?", type: "textarea" },
      { key: "pattern_to_change", label: "What thought pattern do I need to change?", type: "textarea" },
      { key: "strength_discovered", label: "What mindset strength did I discover?", type: "textarea" },
      { key: "continue_practicing", label: "What will I continue practicing?", type: "textarea" },
    ],
  },
];

// ---------- Final Assessment: 15 questions ----------
const QUIZ_QUESTIONS = [
  {
    prompt: "Mindset means staying positive no matter what happens, even if it means ignoring real problems.",
    options: ["True", "False"],
    correctIndex: 1,
  },
  {
    prompt: "Which sequence correctly describes how a single thought can shape a result?",
    options: [
      "Action → Thought → Result",
      "Thought → Interpretation → Emotion → Decision → Action → Result",
      "Result → Thought → Action",
      "Emotion → Result → Thought",
    ],
    correctIndex: 1,
  },
  {
    prompt:
      "A member believes \"I don't think people will listen to me\" and stops prospecting as a result. What actually happened here?",
    options: [
      "The market rejected them before they tried anything.",
      "A thought shaped their behaviour before any real evidence came in.",
      "Prospecting never works for anyone who has that thought.",
      "Their sponsor failed to train them properly.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "A growth mindset means believing you can do absolutely anything instantly if you try hard enough.",
    options: ["True", "False"],
    correctIndex: 1,
  },
  {
    prompt:
      "You sent 30 proposals and received no response. Which reply demonstrates a growth mindset?",
    options: [
      "\"Freelancing doesn't work.\"",
      "\"Clients don't like me.\"",
      "\"I need to examine my offer, targeting, portfolio and proposal strategy.\"",
      "\"I'll stop trying.\"",
    ],
    correctIndex: 2,
  },
  {
    prompt: "What is the key difference between \"I failed\" and \"I am a failure\"?",
    options: [
      "There is no real difference; both mean the same thing.",
      "\"I failed\" describes an event; \"I am a failure\" creates an identity.",
      "\"I am a failure\" is more accurate because failure defines character.",
      "Neither statement is useful, so both should be avoided entirely.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "A limiting belief is best described as:",
    options: [
      "Any belief that is factually false.",
      "A belief that restricts how a person sees themselves, their possibilities, or their actions.",
      "A belief that only applies to money.",
      "A permanent trait a person is born with.",
    ],
    correctIndex: 1,
  },
  {
    prompt:
      "Someone thinks \"Nobody wants what I'm offering\" after two people said no. Using NOTICE → QUESTION → REFRAME → ACT, what should come right after NOTICE?",
    options: [
      "Immediately give up on the offer.",
      "Ask whether the thought is completely true.",
      "Tell themselves nothing is wrong.",
      "Blame the two people who said no.",
    ],
    correctIndex: 1,
  },
  {
    prompt: "Taking responsibility means believing that everything bad that happens is your fault.",
    options: ["True", "False"],
    correctIndex: 1,
  },
  {
    prompt: "Which of the following is inside your Circle of Control?",
    options: [
      "Another person's decision to buy from you.",
      "Your level of preparation before a conversation.",
      "What a client says about you online.",
      "The state of the economy.",
    ],
    correctIndex: 1,
  },
  {
    prompt:
      "A member keeps saying \"Nobody is joining my team.\" Which response reflects a Builder Mindset rather than a Complaint Mindset?",
    options: [
      "\"Why does this always happen to me?\"",
      "\"This business doesn't work.\"",
      "\"How can I improve my prospecting, communication, follow-up and value?\"",
      "\"I'll wait until people come to me.\"",
    ],
    correctIndex: 2,
  },
  {
    prompt: "Which of these best describes \"Realistic Optimism\"?",
    options: [
      "Believing everything will work out with no effort required.",
      "Expecting the worst so you're never disappointed.",
      "Accepting reality while looking for what can be learned, controlled and improved.",
      "Avoiding problems until they resolve themselves.",
    ],
    correctIndex: 2,
  },
  {
    prompt: "Toxic positivity and realistic optimism are the same thing.",
    options: ["True", "False"],
    correctIndex: 1,
  },
  {
    prompt: "\"I don't have to know everything, I need to be willing to learn\" reflects which principle from this level?",
    options: ["Fixed mindset", "Becoming a student of life", "Toxic positivity", "Self-blame"],
    correctIndex: 1,
  },
  {
    prompt:
      "A member underprices their freelance services because they think \"I'm not good enough to charge that much.\" What is the most useful next step, based on this level?",
    options: [
      "Accept the belief as permanent and keep underpricing.",
      "Notice the thought, question whether it's completely true, and look at real evidence of their skill and results.",
      "Quit freelancing altogether.",
      "Raise prices without addressing the underlying thought.",
    ],
    correctIndex: 1,
  },
];

async function main() {
  console.log("Signing in as admin…");
  const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) throw authError;

  console.log("Removing the placeholder test module from earlier development…");
  await supabase.from("mind_training_modules").delete().eq("level_id", LEVEL_ID).eq("title", "Module 1: What is Mindset");

  console.log("Setting up the level…");
  const { error: levelError } = await supabase
    .from("mind_training_levels")
    .update({
      title: "Level 1 — Mindset Foundation",
      description: "Your results begin with how you think.",
      milestone_key: "mindset_starter",
      milestone_title: "Mindset Starter",
      milestone_icon: "🏆",
      milestone_description:
        "You've taken the first step toward becoming more intentional about how you think, respond and act.",
      order_index: 1,
      published: true,
    })
    .eq("id", LEVEL_ID)
    .eq("path_id", PATH_ID);
  if (levelError) throw levelError;

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
    "Ten lessons on how your thinking shapes your interpretations, decisions and results.",
    1,
  );
  const moduleTasks = await createModule(
    "Practical Application",
    "Turn what you've learned into a real, personal inventory of your own beliefs and thinking patterns.",
    2,
  );
  const moduleChallenge = await createModule(
    "7-Day Mindset Awareness Challenge",
    "Seven days of short, focused practice to build real awareness of how you think.",
    3,
  );
  const moduleAssessment = await createModule(
    "Final Assessment",
    "A 15-question check on how well you can apply this level's thinking tools to real situations.",
    4,
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

  console.log("Inserting 3 practical tasks…");
  for (const [i, task] of TASKS.entries()) {
    const { error } = await supabase.from("mind_training_activities").insert({
      module_id: moduleTasks.id,
      title: task.title,
      instructions: task.instructions,
      order_index: i + 1,
      published: true,
      category: "practical_task",
      is_required: true,
      xp_reward: task.xpReward,
      input_fields: task.inputFields,
    });
    if (error) throw error;
    console.log(`  ${task.title}`);
  }

  console.log("Inserting 7 challenge days…");
  for (const [i, day] of CHALLENGE_DAYS.entries()) {
    const { error } = await supabase.from("mind_training_activities").insert({
      module_id: moduleChallenge.id,
      title: day.title,
      instructions: day.instructions,
      order_index: i + 1,
      published: true,
      category: "challenge_day",
      is_required: true,
      xp_reward: day.xpReward,
      input_fields: day.inputFields,
    });
    if (error) throw error;
    console.log(`  ${day.title}`);
  }

  console.log("Creating the final assessment…");
  const { data: assessment, error: assessmentError } = await supabase
    .from("mind_training_assessments")
    .insert({
      module_id: moduleAssessment.id,
      title: "Mindset Foundation Quiz",
      pass_score_percent: 80,
      xp_reward: 50,
    })
    .select()
    .single();
  if (assessmentError) throw assessmentError;

  console.log("Inserting 15 questions…");
  for (const [i, q] of QUIZ_QUESTIONS.entries()) {
    const { data: question, error: qError } = await supabase
      .from("mind_training_assessment_questions")
      .insert({ assessment_id: assessment.id, prompt: q.prompt, order_index: i + 1 })
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

  console.log("\nDone. Level 1 — Mindset Foundation is fully seeded and published.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
