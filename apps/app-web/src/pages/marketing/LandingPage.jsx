import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon.jsx";
import ProgressRing from "../../components/ProgressRing.jsx";
import logoIcon from "../../assets/images/logo-icon.png";
import "../../styles/landing.css";

// Public root route ("/", App.jsx) -- the one page in this app an
// unauthenticated visitor is meant to see. Deliberately its own file/
// stylesheet (landing.css) rather than folding into app.css: this never
// loads for a signed-in session, and app.css's own vocabulary (sidebar,
// cards, tables) isn't what a marketing page needs. Where the two design
// languages genuinely overlap -- buttons, icon badges, the hero's dashboard
// mockup -- this reuses app.css's real classes/components (.icon-badge,
// .today-task-row, ProgressRing) directly instead of re-deriving them, per
// the brief's "reuse dashboard components instead of a fake UI" note.

// IntersectionObserver-based scroll reveal -- no animation library in this
// project's dependencies (package.json) and this doesn't need one: a
// class toggle plus the .lp-reveal CSS transition is the whole mechanism.
// Fires once (unobserve after) so scrolling back up never re-triggers it.
function Reveal({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`lp-reveal${inView ? " in-view" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#learning", label: "Learning" },
  { href: "#paths", label: "Business Paths" },
  { href: "#features", label: "Features" },
];

function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={`lp-nav${open ? " open" : ""}`}>
      <div className="lp-container lp-nav-inner">
        <Link to="/" className="lp-nav-brand" onClick={() => setOpen(false)}>
          <img src={logoIcon} alt="" />
          <span>Synergy</span>
        </Link>

        <nav className="lp-nav-links">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav-actions">
          <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-sm">
            Log in
          </Link>
          <Link to="/signup" className="lp-btn lp-btn-secondary lp-btn-sm">
            Create an account
          </Link>
          <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-sm">
            Get Started
          </Link>
          <button
            type="button"
            className="lp-nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "x" : "menu"} size={18} />
          </button>
        </div>
      </div>

      <div className="lp-container lp-nav-mobile">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="lp-nav-mobile-link" onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <div className="lp-nav-mobile-actions">
          <Link to="/login" className="lp-btn lp-btn-secondary" onClick={() => setOpen(false)}>
            Log in
          </Link>
          <Link to="/signup" className="lp-btn lp-btn-primary" onClick={() => setOpen(false)}>
            Create an account
          </Link>
        </div>
      </div>
    </header>
  );
}

// The hero "product visualization" -- static, illustrative numbers (this
// page renders with no session), built from the same primitives the real
// Dashboard.jsx uses (ProgressRing, .today-task-row/.today-task-check) so
// it reads as an honest preview of the actual product, not a stock mockup.
function HeroMockup() {
  return (
    <div className="lp-mockup" aria-hidden="true">
      <div className="lp-mockup-chrome">
        <span className="lp-mockup-dot" />
        <span className="lp-mockup-dot" />
        <span className="lp-mockup-dot" />
        <span className="lp-mockup-title">Synergy — Today</span>
      </div>

      <div className="lp-mockup-body">
        <div className="lp-mockup-card">
          <div className="lp-mockup-card-title">
            <Icon name="check-square" size={14} style={{ color: "var(--blue-bright)" }} />
            Today's Work
          </div>
          <ul className="today-task-list">
            {[
              { title: "Complete a learning session", done: true },
              { title: "Prospect 3 new people", done: true },
              { title: "Follow up with 2 prospects", done: false },
              { title: "Submit daily activity report", done: false },
            ].map((t) => (
              <li key={t.title} className={`today-task-row${t.done ? " is-done" : ""}`}>
                <span className={`today-task-check${t.done ? " done" : ""}`} aria-hidden="true">
                  {t.done && <Icon name="check" size={12} />}
                </span>
                <div className="today-task-body">
                  <div className="today-task-title">{t.title}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-mockup-row">
          <div className="lp-mockup-card">
            <div className="lp-mockup-card-title">
              <Icon name="target" size={14} style={{ color: "var(--gold)" }} />
              Monthly Goals
            </div>
            <div className="lp-mockup-goal">
              <ProgressRing percent={68} size={54} strokeWidth={5} fillColor="var(--gold)" />
              <div className="lp-mockup-goal-copy">
                <div className="label">3 goals in progress</div>
                <div className="value">On track this month</div>
              </div>
            </div>
          </div>
          <div className="lp-mockup-card">
            <div className="lp-mockup-card-title">
              <Icon name="bar-chart" size={14} style={{ color: "var(--success)" }} />
              Daily Progress
            </div>
            <div className="lp-mockup-goal">
              <ProgressRing percent={80} size={54} strokeWidth={5} fillColor="var(--success)" />
              <div className="lp-mockup-goal-copy">
                <div className="label">4 of 5 tasks</div>
                <div className="value">Consistent this week</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-mockup-row">
          <div className="lp-mockup-card">
            <div className="lp-mockup-card-title">
              <Icon name="brain" size={14} style={{ color: "var(--blue-bright)" }} />
              Continue Learning
            </div>
            <div className="today-task-row" style={{ paddingLeft: 0 }}>
              <div className="today-task-body">
                <div className="today-task-title">Discipline & Habits</div>
                <div className="today-task-desc">Lesson 6 of 12 — Breaking Bad Habits</div>
              </div>
            </div>
          </div>
          <div className="lp-mockup-card">
            <div className="lp-mockup-card-title">
              <Icon name="network" size={14} style={{ color: "var(--blue-bright)" }} />
              Network Activity
            </div>
            <div className="lp-mockup-net-row">
              <span className="lp-mockup-net-name">New prospects this week</span>
              <span className="lp-mockup-net-val">+5</span>
            </div>
            <div className="lp-mockup-net-row">
              <span className="lp-mockup-net-name">Active team members</span>
              <span className="lp-mockup-net-val">12</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div>
          <div className="lp-eyebrow">Your Digital Office for Growth</div>
          <h1>
            Learn. Work. Build. <span className="accent">Earn.</span>
          </h1>
          <p className="lp-hero-sub">
            A structured digital office for building real skills, growing your business, and turning consistent daily
            action into progress — through Network Marketing and Freelancing.
          </p>
          <div className="lp-hero-ctas">
            <Link to="/signup" className="lp-btn lp-btn-primary">
              Get Started
            </Link>
            <a href="#how-it-works" className="lp-btn lp-btn-secondary">
              See How It Works
            </a>
          </div>
          <p className="lp-hero-note">Learn at your pace. Work from anywhere. Build with a system.</p>
        </div>
        <Reveal>
          <HeroMockup />
        </Reveal>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { icon: "book", title: "Learn Without Action", text: "You consume information but don't know what to do next." },
  { icon: "compass", title: "No Structure", text: "You have goals, but no daily system keeping you accountable." },
  { icon: "user", title: "Work Alone", text: "You're trying to build skills and a business without a clear path or support system." },
];

function ProblemSection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-section-head center" style={{}}>
          <h2>Learning alone isn't enough.</h2>
          <p>
            Most people collect courses, save videos, and make plans — but never turn what they learn into
            consistent action.
          </p>
        </Reveal>

        <div className="lp-problem-grid">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} className={`lp-problem-card lp-reveal-${i + 1}`}>
              <span className="icon-badge tone-danger">
                <Icon name={p.icon} size={18} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal as="p" className="lp-transition-line">
          Synergy brings learning, work, accountability, and business-building into one place.
        </Reveal>
      </div>
    </section>
  );
}

const STEPS = [
  { num: "01", title: "Learn", text: "Follow structured learning paths and develop practical skills." },
  { num: "02", title: "Work", text: "Complete daily activities and turn knowledge into practice." },
  { num: "03", title: "Build", text: "Build your freelance career, Network Marketing business, portfolio, and network." },
  { num: "04", title: "Earn", text: "Turn your skills and business activity into real opportunities and income." },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="lp-section lp-section-alt">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>One system. One place to build.</h2>
        </Reveal>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} className={`lp-step lp-reveal-${i + 1}`}>
              <div className="lp-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="lp-step-connector" aria-hidden="true" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PathsSection() {
  return (
    <section id="paths" className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>Choose your path. Build both.</h2>
        </Reveal>

        <div className="lp-paths-grid">
          <Reveal className="lp-path-card gradient lp-reveal-1">
            <span className="icon-badge">
              <Icon name="network" size={20} />
            </span>
            <h3>Network Marketing</h3>
            <p>Build your Network Marketing business with structure, training, daily activities, team support, and accountability.</p>
            <ul className="lp-path-list">
              {["Prospecting", "Follow-ups", "Team building", "Product/business knowledge", "Goal tracking", "Sponsor support"].map((f) => (
                <li key={f}>
                  <span className="tick">
                    <Icon name="check" size={11} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="lp-btn lp-btn-secondary">
              Explore Network Marketing
            </Link>
          </Reveal>

          <Reveal className="lp-path-card lp-reveal-2">
            <span className="icon-badge">
              <Icon name="laptop" size={20} />
            </span>
            <h3>Freelancing</h3>
            <p>Develop practical digital skills and turn them into freelance opportunities.</p>
            <ul className="lp-path-list">
              {["Skill development", "Portfolio building", "Fiverr / Upwork preparation", "Client acquisition", "Practical projects", "Business development"].map((f) => (
                <li key={f}>
                  <span className="tick">
                    <Icon name="check" size={11} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="lp-btn lp-btn-primary">
              Explore Freelancing
            </Link>
          </Reveal>
        </div>

        <Reveal as="p" className="lp-paths-note">
          You don't have to choose forever. <strong>You can build both paths together.</strong>
        </Reveal>
      </div>
    </section>
  );
}

const OFFICE_ITEMS = [
  { icon: "check-square", title: "Today's Work", text: "Know exactly what you need to accomplish today." },
  { icon: "target", title: "Goals", text: "Set monthly goals and track your progress." },
  { icon: "layers", title: "Learning Hub", text: "Follow structured learning paths instead of random courses." },
  { icon: "network", title: "Network", text: "Build and manage your business network." },
  { icon: "users", title: "Team", text: "Work with your sponsor and team." },
  { icon: "folder", title: "Reports", text: "Stay accountable by reporting your activities." },
  { icon: "bar-chart", title: "Progress", text: "See how consistently you're showing up." },
];

function DigitalOfficeSection() {
  return (
    <section id="features" className="lp-section lp-section-alt">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>Everything you need for your workday.</h2>
        </Reveal>
        <div className="lp-office-grid">
          {OFFICE_ITEMS.map((item, i) => (
            <Reveal key={item.title} className={`lp-office-card lp-reveal-${(i % 4) + 1}`}>
              <span className="icon-badge">
                <Icon name={item.icon} size={17} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const TODAY_ITEMS = [
  "Complete learning session",
  "Prospect new people",
  "Follow up with prospects",
  "Work on freelance skill",
  "Complete business activity",
  "Submit daily report",
];

function ConsistencySection() {
  return (
    <section className="lp-section">
      <div className="lp-container lp-consistency-grid">
        <Reveal>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "34px", letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: "16px" }}>
            Your results start with what you do every day.
          </h2>
          <p style={{ fontSize: "16px", lineHeight: 1.65, color: "var(--navy-soft)" }}>
            Synergy is designed around consistency. Instead of asking:
          </p>
          <div className="lp-consistency-quote">
            <span>"What do I feel like doing today?"</span>
            <strong>You should be able to open your office and see: "What needs to be done today?"</strong>
          </div>
          <Link to="/signup" className="lp-btn lp-btn-primary">
            Build Your Workday
          </Link>
        </Reveal>

        <Reveal className="lp-reveal-2">
          <div className="lp-today-card">
            <div className="lp-today-card-head">
              <span>Today</span>
              <Icon name="clock" size={15} style={{ color: "var(--slate)" }} />
            </div>
            <ul className="lp-today-list">
              {TODAY_ITEMS.map((t) => (
                <li key={t} className="lp-today-item">
                  <span className="tick">
                    <Icon name="check" size={11} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const LEARNING_AREAS = [
  { icon: "brain", title: "Mind Training", text: "Build mindset, discipline, self-awareness, goals, and personal development." },
  { icon: "network", title: "Network Marketing", text: "Learn prospecting, follow-up, product knowledge, leadership, team building, and business fundamentals." },
  { icon: "laptop", title: "Freelancing", text: "Develop practical digital skills and learn how to turn them into freelance opportunities." },
  { icon: "book", title: "Personal Development", text: "Books, podcasts, videos, and resources for continuous growth." },
];

function LearningHubSection() {
  return (
    <section id="learning" className="lp-section lp-section-alt">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>Don't just collect knowledge. Build capability.</h2>
        </Reveal>
        <div className="lp-learning-grid">
          {LEARNING_AREAS.map((a, i) => (
            <Reveal key={a.title} className={`lp-learning-card lp-reveal-${i + 1}`}>
              <span className="icon-badge">
                <Icon name={a.icon} size={17} />
              </span>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal as="div" style={{ textAlign: "center" }}>
          <Link to="/signup" className="lp-btn lp-btn-primary">
            Explore Learning Hub
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function AccountabilitySection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>Treat your growth like a real job.</h2>
          <p>Set your goals. Show up every day. Complete your work. Track your progress. Report your activity. Improve.</p>
        </Reveal>

        <Reveal className="lp-flow">
          {["Monthly Goal", "Daily Tasks", "Daily Action", "Report", "Progress", "Better Results"].map((step, i, arr) => (
            <div key={step} style={{ width: "100%" }}>
              <div className={`lp-flow-step${i === arr.length - 1 ? " strong" : ""}`}>{step}</div>
              {i < arr.length - 1 && (
                <div className="lp-flow-arrow">
                  <Icon name="arrow-down" size={16} />
                </div>
              )}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="lp-section lp-section-alt">
      <div className="lp-container lp-team-grid">
        <Reveal>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "34px", letterSpacing: "-0.02em", marginBottom: "8px" }}>
            You don't have to build alone.
          </h2>
          <div className="lp-team-points">
            <div className="lp-team-point">
              <span className="icon-badge">
                <Icon name="user" size={16} />
              </span>
              <p>
                <strong>Sponsor</strong>
                Get guidance from the person who brought you in.
              </p>
            </div>
            <div className="lp-team-point">
              <span className="icon-badge">
                <Icon name="users" size={16} />
              </span>
              <p>
                <strong>Team</strong>
                Work alongside the people you're building with.
              </p>
            </div>
            <div className="lp-team-point">
              <span className="icon-badge">
                <Icon name="network" size={16} />
              </span>
              <p>
                <strong>Network</strong>
                Grow and manage the business relationships you build.
              </p>
            </div>
            <div className="lp-team-point">
              <span className="icon-badge">
                <Icon name="compass" size={16} />
              </span>
              <p>
                <strong>Community</strong>
                Stay connected to people building toward the same thing.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal className="lp-reveal-2">
          <div className="lp-network-visual" aria-hidden="true">
            <div className="lp-network-node you">You</div>
            <div className="lp-network-line" />
            <div className="lp-network-row">
              <div className="lp-network-node small">
                <Icon name="user" size={16} />
              </div>
              <div className="lp-network-node small">
                <Icon name="user" size={16} />
              </div>
              <div className="lp-network-node small">
                <Icon name="user" size={16} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const AUDIENCE = [
  { icon: "compass", title: "The Beginner", text: "“I don't know where to start.”" },
  { icon: "layers", title: "The Skill Builder", text: "“I want to develop a valuable digital skill.”" },
  { icon: "laptop", title: "The Freelancer", text: "“I want to turn my skills into freelance opportunities.”" },
  { icon: "network", title: "The Network Builder", text: "“I want structure for building my Network Marketing business.”" },
];

function WhoItsForSection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-section-head center">
          <h2>Synergy is for people who are ready to build.</h2>
        </Reveal>
        <div className="lp-audience-grid">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.title} className={`lp-audience-card lp-reveal-${i + 1}`}>
              <span className="icon-badge">
                <Icon name={a.icon} size={17} />
              </span>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" className="lp-audience-foot">
          Wherever you're starting, the goal is the same: Learn. Work. Build. Earn.
        </Reveal>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-final">
          <h2>Your office is ready.</h2>
          <p>Stop waiting for the perfect time. Start building the skills, habits, network, and business that move you forward.</p>
          <div className="lp-final-ctas">
            <Link to="/signup" className="lp-btn lp-btn-primary">
              Create Your Account
            </Link>
            <Link to="/login" className="lp-btn lp-btn-secondary">
              Log In
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <div className="lp-footer-brand">
              <img src={logoIcon} alt="" />
              <span>Synergy</span>
            </div>
            <p className="lp-footer-desc">
              A digital office for learning, working, and building through Freelancing and Network Marketing.
            </p>
          </div>
          <div className="lp-footer-col">
            <h4>Platform</h4>
            <ul>
              <li>
                <a href="#how-it-works">How It Works</a>
              </li>
              <li>
                <a href="#learning">Learning</a>
              </li>
              <li>
                <a href="#paths">Business Paths</a>
              </li>
              <li>
                <Link to="/login">Login</Link>
              </li>
              <li>
                <Link to="/signup">Create Account</Link>
              </li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Legal</h4>
            <ul>
              <li>
                <Link to="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/terms">Terms of Service</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Synergy. Build your future.</span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <Nav />
      <Hero />
      <ProblemSection />
      <HowItWorksSection />
      <PathsSection />
      <DigitalOfficeSection />
      <ConsistencySection />
      <LearningHubSection />
      <AccountabilitySection />
      <TeamSection />
      <WhoItsForSection />
      <FinalCTASection />
      <Footer />
    </div>
  );
}
