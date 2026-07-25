import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Steps from "../components/Steps.jsx";
import FitGrid from "../components/FitGrid.jsx";
import Accordion from "../components/Accordion.jsx";
import { NETWORK_STEPS, NETWORK_FIT_YES, NETWORK_FIT_NO, RANK_PATH } from "../data/site.js";

const NETWORK_FAQS = [
  {
    q: "Is this a pyramid scheme?",
    a: "No. Neolife is a network marketing company selling a real, physical product line. You earn from product sales and from a team you build and support — not from recruitment fees alone. See our income disclaimer for the full picture.",
  },
  {
    q: "How much does it cost to get started?",
    a: "There's a standard Neolife distributor sign-up cost and initial product cost. Your mentor will walk you through the exact, current figures transparently before you commit — nothing hidden.",
  },
  {
    q: "How much time does this really take?",
    a: "Expect to show up to weekly training and put in consistent conversations and follow-ups. This is a real business, not a passive investment — the people who progress are the ones who show up consistently.",
  },
  {
    q: "What if I don't like selling?",
    a: "The system leans on structured prospecting and genuine product use rather than hard selling, but it still requires talking to people. If that's a complete non-starter for you, this may not be the right team — freelancing isn't offered as an alternative on its own, only alongside network marketing.",
  },
  {
    q: "Can I join network marketing without also doing freelancing?",
    a: "Yes, but only if you already have another source of income — a job, a business, anything — financing your Neolife product costs and activity. If you don't have that in place yet, we'll onboard you onto both tracks so freelancing income can fund it.",
  },
];

export default function NetworkMarketing() {
  return (
    <>
      <PageMeta
        title="Network Marketing Track"
        description="Build a real Neolife network marketing business with a structured prospecting system, weekly training, and a clear rank path."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Network Marketing Track</span>
          </div>
          <div className="eyebrow">Network Marketing Track</div>
          <h1>Build a team, build leveraged income — the structured way.</h1>
          <p className="lede">
            We run an active Neolife business built on a tested prospecting system, weekly
            training, and a clear rank path — not pressure tactics and not guesswork. This is the
            one track we offer on its own — but only if you already have another income source
            financing it. Otherwise it runs alongside the freelancing track.
          </p>
          <div className="hero-ctas">
            <Link to="/join?track=network-marketing" className="btn btn-primary">
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
            <div className="eyebrow">Where this can take you</div>
            <h2>The rank path, in plain terms</h2>
            <p>
              Illustrative — your mentor will walk you through the exact, current Neolife
              compensation plan and rank requirements once you're onboarded.
            </p>
          </div>
          <div className="rank-path">
            {RANK_PATH.map((rank) => (
              <div className="rank-step" key={rank.name}>
                <div className="rank-dot" />
                <div>
                  <div className="rank-name">{rank.name}</div>
                  <div className="rank-desc">{rank.desc}</div>
                </div>
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
            <p>Apply for the network marketing track and we'll get you onboarded this week.</p>
            <div className="hero-ctas">
              <Link to="/join?track=network-marketing" className="btn btn-primary">
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
