// ---------------------------------------------------------------------------
// Central site configuration & copy.
//
// EDIT THIS FILE FIRST. Everything a prospect sees, contact details, stats,
// testimonials, FAQ answers, is driven from here so you rarely need to touch
// component code to update copy.
//
// ⚠️ REPLACE BEFORE LAUNCH (if not already done):
//   - whatsappNumber, in international format, no "+", no spaces
//   - email
//   - web3formsAccessKey, get one free at https://web3forms.com (dashboard
//     shows which inbox it delivers to). Leave "" to run on WhatsApp only.
// ---------------------------------------------------------------------------

export const SITE = {
  name: "SynergyTeam",
  shortTagline: "Build Your Future with SynergyTeam.",
  metaDescription:
    "SynergyTeam trains members to earn from freelance tech skills and build a Neolife network marketing business, with real mentorship, systems, and a team that's already done it.",
  whatsappNumber: "2347047318901",
  whatsappDefaultMessage:
    "Hi SynergyTeam! I'd like to know more about joining the team.",
  email: "ceo@synergyteamm.com",
  location: "Lagos, Nigeria",
  // Web3Forms (https://web3forms.com) delivers Join-form submissions straight
  // to `email` above, in addition to the WhatsApp chat that always opens.
  // Leave "" to run on WhatsApp only, everything still works without it.
  web3formsAccessKey: "f4b6040d-eca8-4cc4-9475-4d72aa92f73c",
};

export const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/freelancing", label: "Freelancing" },
  { to: "/network-marketing", label: "Network Marketing" },
  { to: "/leadership", label: "Leadership" },
  { to: "/gallery", label: "Gallery" },
  { to: "/stories", label: "Stories" },
  { to: "/faq", label: "FAQ" },
];

export const FOOTER_LINKS = {
  tracks: [
    { to: "/freelancing", label: "Freelancing Track" },
    { to: "/network-marketing", label: "Network Marketing Track" },
  ],
  team: [
    { to: "/leadership", label: "Leadership" },
    { to: "/gallery", label: "Team Gallery" },
    { to: "/stories", label: "Success Stories" },
    { to: "/faq", label: "FAQ" },
    { to: "/join", label: "Join The Team" },
  ],
  legal: [
    { to: "/disclaimer", label: "Income Disclaimer" },
    { to: "/privacy", label: "Privacy" },
  ],
};

export const ABOUT = {
  eyebrow: "Who we are",
  heading: "About SynergyTeam",
  body: [
    "SynergyTeam is a team-first community built around two income paths: freelance tech skills that pay in dollars, and a Neolife network marketing business built on structured prospecting, both taught hands-on by people already running them, not theorists reading from a script.",
    "We call it synergy because the two tracks aren't run in isolation, freelance income funds the network marketing business while it's still growing, so members are earning while they build instead of waiting years for a payoff.",
  ],
};

export const TRUST_STATS = [
  { num: "50+", label: "People on the team" },
  { num: "2", label: "Income tracks" },
  { num: "5 yrs", label: "Proven freelance track record" },
  { num: "100%", label: "Hands-on training, no theory only" },
];

export const WHY_US = [
  {
    title: "Systems, not vibes",
    body: "Scripts, spreadsheets, and training decks the team already uses daily, not generic advice.",
  },
  {
    title: "Structured onboarding",
    body: 'You\'re placed on a track in week one, with clear next steps instead of an open-ended "figure it out."',
  },
  {
    title: "Active mentorship",
    body: "Led by a working freelancer and team builder, not someone teaching theory they've never lived.",
  },
];

export const FREELANCE_SKILLS = [
  {
    title: "Mobile app development",
    body: "Learn to build apps for iOS and Android using Flutter and FlutterFlow, no prior coding experience required.",
  },
  {
    title: "Website development",
    body: "Learn to build websites and web apps using React, Wix, and other tools, no prior coding experience required.",
  },
  {
    title: "AI-assisted development",
    body: "Use AI tools to move faster on real projects: scaffolding features, debugging, and shipping client work in less time.",
  },
  {
    title: "Graphics Design",
    body: "Learn to create graphics for apps, social media, and marketing materials using Canva and other tools, no Photoshop experience required.",
  },
  {
    title: "Marketing",
    body: "Learn to market your services and attract clients using social media, email, and other channels, no cold-calling required.",
  },
  {
    title: "Client-ready gig setup",
    body: "A done-with-you Fiverr and Upwork profile, portfolio, and gig listing so you look credible from day one.",
  },
  {
    title: "Outreach & pricing",
    body: "Scripts for reaching out to clients and pricing your work so you don't undersell yourself starting out.",
  },
];

export const FREELANCE_STEPS = [
  {
    title: "Skill assessment & track placement",
    body: "We find out what you already know and map a training path that gets you to a sellable skill fastest.",
  },
  {
    title: "Hands-on training",
    body: "Structured, practical sessions in Flutter, FlutterFlow, and AI-assisted development, you build real things, not slides.",
  },
  {
    title: "Portfolio & profile setup",
    body: "We help you set up Fiverr/Upwork gigs and a small portfolio so you have something to point clients to.",
  },
  {
    title: "Client outreach & first booking",
    body: "Outreach scripts and pricing guidance to help you land your first paying client.",
  },
  {
    title: "Ongoing project pipeline",
    body: "Once you're capable, you get access to real project work inside the team's existing client pipeline.",
  },
];

export const FREELANCE_FIT_YES = [
  "You can commit a few focused hours a week to practice, not just watch tutorials",
  'You\'re comfortable being a beginner in public, messaging clients before you feel "ready"',
  "You want a skill that pays in dollars and travels with you anywhere",
];

export const FREELANCE_FIT_NO = [
  "You want a passive, done-for-you income with zero learning curve",
  "You can't dedicate any consistent weekly time to training",
  "You're looking for a guaranteed income figure, freelancing income depends on your effort and skill",
];

export const NETWORK_STEPS = [
  {
    title: "Onboarding & product education",
    body: "Get set up as a distributor and understand the Neolife product line before you talk to anyone.",
  },
  {
    title: "Prospecting system",
    body: "A tested script and structured approach to reaching out, not guesswork, not pressure tactics.",
  },
  {
    title: "Weekly training",
    body: "In-person and virtual sessions run every week so you're never building alone.",
  },
  {
    title: "Rank progression",
    body: "A clear path from new distributor upward, with your mentor helping you track activity and next steps.",
  },
];

export const NETWORK_BENEFITS = [
  {
    title: "Income that compounds",
    body: "Every person you bring on and support adds to what the whole team moves, so your income isn't capped at what you alone can sell in a day.",
  },
  {
    title: "A real, reorderable product",
    body: "Neolife products get used up and repurchased every month. You're building repeat customers, not chasing one-time sales.",
  },
  {
    title: "Low cost to start",
    body: "No storefront, no inventory to warehouse, no staff to pay. You start a real business for the cost of a distributor sign-up.",
  },
  {
    title: "A team, not a solo grind",
    body: "Weekly training and a mentor who's actually building alongside you, so you're never guessing what to do next.",
  },
  {
    title: "Leverage beyond your hours",
    body: "A job pays for the hours you personally work. A team you build and support can eventually earn more than you could alone.",
  },
  {
    title: "Skills that outlast the business",
    body: "Prospecting, leadership, and people skills you pick up here carry over into anything else you go on to build.",
  },
];

export const NETWORK_FIT_YES = [
  "You're fine with slower, compounding results in exchange for leveraged, longer-term income",
  "You want a structured prospecting system rather than posting and hoping",
  "You can show up to weekly training and actually apply what's covered",
];

export const NETWORK_FIT_NO = [
  "You've been told this is guaranteed or passive, it isn't, it's a real business",
  "You're not willing to talk to people or build a customer base",
  "You want overnight results, this track compounds over months, not days",
];

export const FAQS = [
  {
    q: "Do I have to do both tracks?",
    a: "Yes, by default. If you're serious about building a business that creates lasting wealth, you need both tracks, you're not just building something to feed yourself today, you're building a legacy that can provide for future generations. The one exception: if you already have another source of income financing your Neolife business, you can run Network Marketing on its own. Freelancing, on the other hand, is never offered as a standalone track, it only runs alongside Network Marketing.",
  },
  {
    q: "How much time do I need per week?",
    a: "It depends on the track and your goals, but plan for at least a few focused hours a week for training and practice. We'll be upfront with you about the time commitment during onboarding.",
  },
  {
    q: "Is there a cost to join the team?",
    a: "Joining SynergyTeam itself is free. The freelancing track requires your time to train and practice. The network marketing track involves standard Neolife distributor sign-up and product costs, which your mentor will walk you through transparently before you commit to anything.",
  },
  {
    q: "Do I need prior experience?",
    a: "No prior experience is required for either track. We start from wherever you currently are and build from there with structured training.",
  },
  {
    q: "How fast can I start earning from freelancing?",
    a: "This varies by person and effort, but the goal of the training and gig-setup process is to get you positioned for your first paying client as quickly as realistically possible, some members have landed their first gig within weeks of finishing setup. Results are not guaranteed and depend on your consistency.",
  },
  {
    q: "Is Neolife a legitimate business?",
    a: "Neolife is an established network marketing company with a real product line. As with any network marketing business, results depend on individual effort, see our income disclaimer for the full picture before you commit.",
  },
  {
    q: "What if I only want the network marketing side?",
    a: "That's fine only if you already have another source of income financing your Neolife business, product costs and consistent activity take some capital. Tell us that on the application and we'll focus your training and mentorship there. If you don't have that funding in place yet, we'll onboard you onto both tracks so freelancing income can cover it.",
  },
  {
    q: "How do I apply?",
    a: 'Use the "Join The Team" button anywhere on the site to fill out a short form, or message us directly on WhatsApp. We aim to respond and onboard within 48 hours.',
  },
];

// Freelancing is only ever offered bundled with Network Marketing, it isn't
// available on its own. Network Marketing alone is only for applicants who
// already have another income source to finance it (see the "financeNote"
// field this drives on the Join form).
export const TRACK_OPTIONS = [
  {
    value: "both",
    label: "Both Tracks (standard path)",
    desc: "Freelancing + Network Marketing together, how most members start.",
  },
  {
    value: "network-marketing",
    label: "Network Marketing only",
    desc: "Only for applicants who already have another income source financing their Neolife business.",
  },
  {
    value: "not-sure",
    label: "Not sure yet",
    desc: "Talk me through it before I decide.",
  },
];

export const STATUS_OPTIONS = [
  "Student",
  "Employed full-time",
  "Employed part-time / side hustle",
  "Between jobs",
  "Running my own business",
  "Other",
];
