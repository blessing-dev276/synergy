import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Steps from "../components/Steps.jsx";
import FitGrid from "../components/FitGrid.jsx";
import Accordion from "../components/Accordion.jsx";
import {
  NETWORK_STEPS,
  NETWORK_FIT_YES,
  NETWORK_FIT_NO,
  NETWORK_BENEFITS,
} from "../data/site.js";

const NETWORK_FAQS = [
  {
    q: "Is this a pyramid scheme?",
    a: "No. Neolife is a network marketing company selling a real, physical product line. You earn from product sales and from a team you build and support, not from recruitment fees alone. See our income disclaimer for the full picture.",
  },
  {
    q: "How much does it cost to get started?",
    a: "There's a standard Neolife distributor sign-up cost and initial product cost. Your mentor will walk you through the exact, current figures transparently before you commit, nothing hidden.",
  },
  {
    q: "How much time does this really take?",
    a: "Expect to show up to weekly training and put in consistent conversations and follow-ups. This is a real business, not a passive investment, the people who progress are the ones who show up consistently.",
  },
  {
    q: "What if I don't like selling?",
    a: "The system leans on structured prospecting and genuine product use rather than hard selling, but it still requires talking to people. If that's a complete non-starter for you, this may not be the right team, freelancing isn't offered as an alternative on its own, only alongside network marketing.",
  },
  {
    q: "Can I join network marketing without also doing freelancing?",
    a: "Yes, but only if you already have another source of income, a job, a business, anything, financing your Neolife product costs and activity. If you don't have that in place yet, we'll onboard you onto both tracks so freelancing income can fund it.",
  },
];

export default function NetworkMarketing() {
  return (
    <>
      <PageMeta
        title="Network Marketing Track"
        description="Build a real Neolife network marketing business with a structured prospecting system, weekly training, and income that grows with your team."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span>{" "}
            <span>Network Marketing Track</span>
          </div>
          <div className="eyebrow">Network Marketing Track</div>
          <h1>
            Stop trading hours for money. Build income that grows with your
            team.
          </h1>
          <p className="lede">
            Most income stops the moment you stop working. Network marketing is
            different: you partner with Neolife to sell a real, reorderable
            product, and as you bring people onto your team and help them
            succeed, you earn from what they build too. Your income is no longer
            capped by your own two hands. It takes real, consistent work to
            build, and we give you the exact system to do it: proven prospecting
            scripts, weekly training, and a mentor building alongside you. This
            is the one track we offer on its own, but only if you already have
            another income source financing it. Otherwise it runs alongside the
            freelancing track.
          </p>
          <div className="hero-ctas">
            <Link
              to="/join?track=network-marketing"
              className="btn btn-primary"
            >
              Apply for the network marketing track
            </Link>
            <Link to="/freelancing" className="btn btn-secondary">
              See the freelancing track
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>A system, not a solo hustle.</h2>
          </div>
          <Steps items={NETWORK_STEPS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Why it's worth building</div>
            <h2>Why leveraged income beats a paycheck</h2>
            <p>
              A job pays you for the hours you personally show up. Network
              marketing lets you build something bigger than yourself, here's
              what that actually gets you.
            </p>
          </div>
          <div className="why-grid">
            {NETWORK_BENEFITS.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
                      stroke="#9A6A15"
                      strokeWidth="1.6"
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
            <div className="eyebrow">Be honest with yourself</div>
            <h2>Is the network marketing track right for you?</h2>
          </div>
          <FitGrid yes={NETWORK_FIT_YES} no={NETWORK_FIT_NO} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Network marketing FAQ</div>
            <h2>Questions people ask before applying</h2>
          </div>
          <Accordion items={NETWORK_FAQS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Ready to build something that compounds?</h2>
            <p>
              Apply for the network marketing track and we'll get you onboarded
              this week.
            </p>
            <div className="hero-ctas">
              <Link
                to="/join?track=network-marketing"
                className="btn btn-primary"
              >
                Apply for the network marketing track
              </Link>
              <Link to="/disclaimer" className="btn btn-secondary">
                Read the income disclaimer
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
