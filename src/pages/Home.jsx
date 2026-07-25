import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import teamLead from "../assets/images/team-lead.jpg";
import { whatsappLink } from "../lib/whatsapp.js";
import { SITE, ABOUT, TRUST_STATS, WHY_US } from "../data/site.js";
import { STORIES } from "../data/stories.js";
import StoryCard from "../components/StoryCard.jsx";

export default function Home() {
  return (
    <>
      <PageMeta
        title="Build Two Income Engines, One Team"
        description={SITE.metaDescription}
      />

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <div className="eyebrow">
                SynergyTeam · Freelancing + Network Marketing
              </div>
              <h1>
                Build your future{" "}
                <span className="accent">with SynergyTeam.</span>
              </h1>
              <p className="lede">
                We train people to earn from freelance tech skills and build a
                network marketing business at the same time, with real
                mentorship, real systems, and a team that's already done it.
              </p>
              <div className="hero-ctas">
                <Link to="/join" className="btn btn-primary">
                  Join SynergyTeam →
                </Link>
                <a href="#engines" className="btn btn-secondary">
                  See how it works
                </a>
              </div>
            </div>
            <div className="hero-photo">
              <img src={teamLead} alt="SynergyTeam lead" />
              <div className="hero-photo-tag">
                <span className="dot" />
                <div>
                  <strong>Team Lead, Synergy</strong>
                  <span>Freelance dev · Network marketing builder</span>
                </div>
              </div>
            </div>
          </div>

          <div className="trust-strip">
            {TRUST_STATS.map((stat) => (
              <div className="trust-item" key={stat.label}>
                <div className="num mono">{stat.num}</div>
                <div className="label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section>
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">{ABOUT.eyebrow}</div>
            <h2>{ABOUT.heading}</h2>
          </div>
          <div className="about-body">
            {ABOUT.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      {/* TWO ENGINES */}
      <section id="engines">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How the tracks work together</div>
            <h2>Both tracks, one team, with one exception.</h2>
            <p>
              Most members run both: freelancing funds daily activity while
              network marketing builds the long-term asset. The only standalone
              option is Network Marketing, and only if you already have another
              income source financing it, freelancing isn't offered on its own.
            </p>
          </div>

          <div className="engines">
            <div className="engine-card freelance">
              <div className="engine-tag">Freelancing Track</div>
              <h3>Learn a skill, get paid in dollars.</h3>
              <p className="desc">
                We teach the exact skills the team already earns from, app
                development, no-code builds, and AI tools, then help you land
                your first paying clients on Fiverr and Upwork.
              </p>
              <ul className="engine-list">
                <li>
                  Hands-on training in Flutter, FlutterFlow, and AI-assisted
                  development
                </li>
                <li>
                  Fiverr &amp; Upwork profile and gig setup, done with you
                </li>
                <li>
                  Client outreach scripts and pricing that actually convert
                </li>
                <li>
                  Access to real project work inside the team's client pipeline
                </li>
              </ul>
              <p className="engine-note">
                Always paired with Network Marketing, not offered as a
                standalone track.
              </p>
              <Link to="/freelancing" className="engine-link">
                Explore the freelancing track →
              </Link>
            </div>

            <div className="engine-card network">
              <div className="engine-tag">Network Marketing Track</div>
              <h3>Build a team, build leveraged income.</h3>
              <p className="desc">
                We run an active Neolife business built on structured
                prospecting, not pressure. You get a tested script, a rank
                roadmap, and a team that trains together.
              </p>
              <ul className="engine-list">
                <li>Step-by-step prospecting system, not guesswork</li>
                <li>Leveraged income that grows as your team grows</li>
                <li>In-person and virtual training sessions run weekly</li>
                <li>A downline support structure that already works</li>
              </ul>
              <p className="engine-note">
                Can be run alone only if you already have another income source
                financing it.
              </p>
              <Link to="/network-marketing" className="engine-link">
                Explore the network marketing track →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how">
        <div className="wrap">
          <div className="how">
            <div className="section-head">
              <div className="eyebrow on-dark">The synergy part</div>
              <h2>Why two tracks beat one</h2>
              <p>
                Freelancing pays you fast while you learn. Network marketing
                pays you longer while you build. Run together, one funds the
                other.
              </p>
            </div>

            <div className="merge-diagram">
              <div className="track">
                <div className="k">Track 01</div>
                <h4>Freelance income</h4>
                <p>
                  Cash in your account within weeks of your first client. Funds
                  your product stock and daily activity.
                </p>
              </div>
              <div className="merge-center">
                <svg viewBox="0 0 60 60" fill="none">
                  <path
                    d="M8 10 L38 30 L8 50"
                    stroke="#29B2E8"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M22 10 L52 30 L22 50"
                    stroke="#D9992E"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                </svg>
              </div>
              <div className="track gold">
                <div className="k">Track 02</div>
                <h4>Network income</h4>
                <p>
                  Grows slower but pays you even when you're not actively
                  working, built once, earns on repeat.
                </p>
              </div>
            </div>

            <div className="result-strip">
              = <span>SynergyTeam:</span> short-term cash flow funding long-term
              wealth
            </div>
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Why people join and stay</div>
            <h2>This isn't a group chat with motivational quotes.</h2>
          </div>
          <div className="why-grid">
            {WHY_US.map((item) => (
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

      {/* LEADER TEASER */}
      <section id="leader">
        <div className="wrap">
          <div className="leader">
            <div className="leader-photo">
              <img src={teamLead} alt="SynergyTeam lead" />
            </div>
            <div className="leader-copy">
              <div className="name-row">
                <h3>Meet your team lead</h3>
                <span className="leader-badge">Verified builder</span>
              </div>
              <p className="leader-role">
                Mobile app developer · Neolife team leader · SynergyTeam founder
              </p>
              <p className="bio">
                Five years building mobile apps for clients across Fiverr and
                Upwork, alongside running an active network marketing team.
                SynergyTeam exists because both paths were built and tested
                first-hand, not copied from a course.
              </p>
              <Link to="/leadership" className="engine-link">
                Read the full story →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="stories">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">From the team</div>
            <h2>What members are saying</h2>
          </div>
          {STORIES.length === 0 ? (
            <p className="placeholder-note">
              Stories are on their way, check back soon, or{" "}
              <Link to="/stories">see the stories page →</Link>
            </p>
          ) : (
            <>
              <div className="testimonials">
                {STORIES.slice(0, 3).map((s) => (
                  <StoryCard story={s} key={s.slug} />
                ))}
              </div>
              <p className="see-all-link">
                <Link to="/stories">See all stories →</Link>
              </p>
            </>
          )}
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="join">
        <div className="wrap">
          <div className="final-cta">
            <h2>Ready to build your two income tracks?</h2>
            <p>
              Tell us which track you want to start on. We'll onboard you within
              48 hours.
            </p>
            <div className="hero-ctas">
              <Link to="/join" className="btn btn-primary">
                Apply to join SynergyTeam
              </Link>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Chat with us on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
