import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import teamLead from "../assets/images/team-lead.jpg";
import Steps from "../components/Steps.jsx";
import { WHY_US } from "../data/site.js";

const STORY_STEPS = [
  {
    title: "Started freelancing solo",
    body: "Began picking up mobile app development gigs on Fiverr and Upwork, learning pricing and client communication the hard way.",
  },
  {
    title: "Joined Neolife as a distributor",
    body: "Started building a network marketing business alongside freelance work, treating it as a second, longer-term income engine.",
  },
  {
    title: "Systematized both",
    body: "Turned five years of trial and error into repeatable scripts, training decks, and onboarding steps other people could actually follow.",
  },
  {
    title: "Started Synergy Team",
    body: "Opened both systems up to a team, so new members don't have to spend years figuring out what already works.",
  },
];

export default function Leadership() {
  return (
    <>
      <PageMeta
        title="Leadership"
        description="Meet the team lead behind Synergy Team — a working freelance developer and Neolife network marketing team builder."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Leadership</span>
          </div>
          <div className="eyebrow">The person behind the systems</div>
          <h1>Built by someone who's actually done both.</h1>
          <p className="lede">
            Synergy Team isn't a franchise of generic advice. It's the systems one person built,
            tested, and refined across five years of freelance client work and an active network
            marketing business.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="leader">
            <div className="leader-photo">
              <img src={teamLead} alt="Synergy Team lead" />
            </div>
            <div className="leader-copy">
              <div className="name-row">
                <h3>Team Lead, Synergy Team</h3>
                <span className="leader-badge">Verified builder</span>
              </div>
              <p className="leader-role">
                Mobile app developer · Neolife team leader · Synergy Team founder
              </p>
              <p className="bio">
                Five years building mobile apps for clients across Fiverr and Upwork, alongside
                running an active network marketing team on the Neolife platform. Synergy Team
                exists because both paths were built and tested first-hand — not copied from a
                course or a template.
              </p>
              <p className="bio">
                The goal with the team is simple: don't make new members waste years figuring out
                what already works. Hand them the training, the scripts, and the mentorship on
                day one instead.
              </p>
              <div className="leader-stats">
                <div>
                  <strong className="mono">5+</strong>
                  <span>Years freelancing</span>
                </div>
                <div>
                  <strong className="mono">19</strong>
                  <span>Team members led</span>
                </div>
                <div>
                  <strong className="mono">2</strong>
                  <span>Active verticals run</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How Synergy Team came to be</div>
            <h2>From solo hustle to a team system</h2>
          </div>
          <Steps items={STORY_STEPS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">What that means for you</div>
            <h2>Why it's worth training under this team</h2>
          </div>
          <div className="why-grid">
            {WHY_US.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="3.4" stroke="#9A6A15" strokeWidth="1.6" />
                    <path
                      d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"
                      stroke="#9A6A15"
                      strokeWidth="1.6"
                      strokeLinecap="round"
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
          <div className="final-cta">
            <h2>Want to train under this system directly?</h2>
            <p>Apply to join Synergy Team and get mentorship from someone who's lived both tracks.</p>
            <div className="hero-ctas">
              <Link to="/join" className="btn btn-primary">
                Apply to join Synergy Team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
