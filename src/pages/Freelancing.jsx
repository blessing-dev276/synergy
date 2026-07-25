import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Steps from "../components/Steps.jsx";
import FitGrid from "../components/FitGrid.jsx";
import Accordion from "../components/Accordion.jsx";
import {
  FREELANCE_SKILLS,
  FREELANCE_STEPS,
  FREELANCE_FIT_YES,
  FREELANCE_FIT_NO,
} from "../data/site.js";

const FREELANCE_FAQS = [
  {
    q: "What if I've never coded before?",
    a: "That's the normal starting point. Training starts from the fundamentals and builds up to shipping real client work, you don't need any prior experience.",
  },
  {
    q: "Do I need my own laptop?",
    a: "Yes, a laptop that can run Flutter/FlutterFlow and a basic AI coding assistant is required. We'll advise on minimum specs during onboarding if you're not sure what you have is enough.",
  },
  {
    q: "How much can I realistically earn?",
    a: "It depends entirely on your effort, consistency, and how quickly you apply what you learn, we don't promise a number. What we do promise is a structured path to your first paying client and real project work once you're capable.",
  },
  {
    q: "Is this only mobile app development?",
    a: "Mobile app development with Flutter and FlutterFlow is the core skill, but training also covers AI-assisted development workflows that speed up almost any kind of client project.",
  },
  {
    q: "Can I do the freelancing track on its own?",
    a: "No, freelancing is only offered bundled with the network marketing track, never as a standalone path. If you'd rather run network marketing alone, that's possible if you already have another income source financing it; see the network marketing track for details.",
  },
];

export default function Freelancing() {
  return (
    <>
      <PageMeta
        title="Freelancing Track"
        description="Learn Flutter, FlutterFlow, and AI-assisted development, then get help landing your first paying clients on Fiverr and Upwork."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span>{" "}
            <span>Freelancing Track</span>
          </div>
          <div className="eyebrow">Freelancing Track</div>
          <h1>Turn a new skill into your first client, in weeks, not years.</h1>
          <p className="lede">
            We teach the exact skills the team already earns from, mobile app
            development, no-code builds, and AI-assisted workflows, then walk
            you through gig setup, pricing, and outreach until you land paying
            work. This track always runs alongside network marketing, it isn't
            offered on its own.
          </p>
          <div className="hero-ctas">
            <Link to="/join?track=both" className="btn btn-primary">
              Apply, freelancing + network marketing
            </Link>
            <Link to="/network-marketing" className="btn btn-secondary">
              See the network marketing track
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">What you'll learn</div>
            <h2>Skills you can sell within weeks.</h2>
          </div>
          <div className="why-grid">
            {FREELANCE_SKILLS.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 17l6-6-6-6M12 19h8"
                      stroke="#9A6A15"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>From zero to your first client.</h2>
          </div>
          <Steps items={FREELANCE_STEPS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Be honest with yourself</div>
            <h2>Is the freelancing track right for you?</h2>
          </div>
          <FitGrid yes={FREELANCE_FIT_YES} no={FREELANCE_FIT_NO} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Freelancing FAQ</div>
            <h2>Questions people ask before applying</h2>
          </div>
          <Accordion items={FREELANCE_FAQS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Ready to start building a sellable skill?</h2>
            <p>
              Apply and we'll place you on a training path this week, alongside
              your network marketing track.
            </p>
            <div className="hero-ctas">
              <Link to="/join?track=both" className="btn btn-primary">
                Apply, freelancing + network marketing
              </Link>
              <Link to="/faq" className="btn btn-secondary">
                Read the full FAQ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
