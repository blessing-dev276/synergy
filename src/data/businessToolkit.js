// Business Toolkit: tools Synergy personally uses and recommends to
// freelancers, entrepreneurs, and network marketers. Add a new tool by
// adding one object here, nothing in Header.jsx, App.jsx, or routing needs
// to change, the nav dropdown and the /business-toolkit/:slug page are both
// generated from this list (see src/pages/BusinessToolkitTool.jsx).
export const BUSINESS_TOOLKIT = [
  {
    slug: "gohighlevel",
    name: "GoHighLevel",
    featured: true,
    affiliateLink: "https://www.gohighlevel.com/?fp_ref=5il6ha",
    meta: {
      title: "GoHighLevel | Business Toolkit | Synergy",
      description:
        "Discover why Synergy recommends GoHighLevel for freelancers, entrepreneurs, agencies, and business owners looking to automate, grow, and manage their businesses from one platform.",
    },
    hero: {
      eyebrow: "Business Toolkit",
      headline: "Run Your Entire Business From One Platform",
      subheadline:
        "Whether you're a freelancer, entrepreneur, agency owner, coach, or network marketer, GoHighLevel gives you the tools to capture leads, automate follow-ups, build websites, create sales funnels, manage customers, and grow your business from a single dashboard.",
      ctaLabel: "Start Your Free Trial",
    },
    challengesHeading: {
      eyebrow: "The problem",
      heading: "Why Businesses Struggle",
    },
    challenges: [
      {
        title: "Leads are forgotten",
        body: "Without one place to capture and track them, promising leads quietly go cold.",
      },
      {
        title: "Manual follow-up wastes time",
        body: "Chasing every lead by hand doesn't scale, so a lot of follow-up simply never happens.",
      },
      {
        title: "Subscriptions add up",
        body: "A separate tool for funnels, email, SMS, and booking gets expensive fast, and none of them talk to each other.",
      },
      {
        title: "Customer information is scattered",
        body: "Details live across spreadsheets, inboxes, and apps, making it hard to see the full picture of a customer.",
      },
      {
        title: "Sales get lost without follow-up",
        body: "Most sales are lost not from a bad offer, but from no one following up at the right moment.",
      },
    ],
    featuresHeading: {
      eyebrow: "The platform",
      heading: "Everything You Need",
    },
    features: [
      "CRM",
      "Sales Funnels",
      "Landing Pages",
      "Website Builder",
      "Email Marketing",
      "SMS Marketing",
      "Booking Calendars",
      "Workflow Automation",
      "AI Automations",
      "Membership Sites",
      "Online Courses",
      "Reputation Management",
      "Mobile App",
    ],
    audiencesHeading: {
      eyebrow: "Who it's for",
      heading: "Who Is It For?",
    },
    audiences: [
      {
        title: "Freelancers",
        body: "Capture client inquiries, send proposals and invoices, and keep every project conversation in one inbox.",
      },
      {
        title: "Agencies",
        body: "Run client campaigns, funnels, and reporting for multiple accounts from a single dashboard.",
      },
      {
        title: "Coaches",
        body: "Sell programs, host courses or membership content, and automate check-ins with clients.",
      },
      {
        title: "Consultants",
        body: "Book discovery calls automatically and follow up with prospects without manual reminders.",
      },
      {
        title: "Network Marketers",
        body: "Capture and nurture prospects on autopilot instead of relying only on direct messages.",
      },
      {
        title: "Small Business Owners",
        body: "Bring bookings, reviews, and customer follow-up into one system instead of five separate apps.",
      },
      {
        title: "Content Creators",
        body: "Turn an audience into leads and customers with landing pages and automated email/SMS sequences.",
      },
    ],
    whyWeRecommend: {
      eyebrow: "Why we recommend it",
      heading: "Why We Recommend GoHighLevel",
      body: [
        "At Synergy, we only put a tool in the Business Toolkit if we've actually used it to run part of our own business, freelancing, network marketing, or both.",
        "GoHighLevel earned its place here because it replaces a handful of separate subscriptions with one system for capturing leads, following up automatically, and keeping customer information in one place, which is exactly the kind of problem freelancers and network marketers run into as they grow.",
        "It isn't a magic fix, and results still depend on how well it's set up and used. We recommend it because it's the platform we trust for that job, not because it promises overnight results.",
      ],
    },
    finalCta: {
      heading: "Start Building a Smarter Business Today",
      ctaLabel: "Start Free Trial",
    },
  },
];

export function getToolkitTool(slug) {
  return BUSINESS_TOOLKIT.find((tool) => tool.slug === slug);
}
