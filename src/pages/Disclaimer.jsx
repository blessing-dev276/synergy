import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { SITE } from "../data/site.js";

export default function Disclaimer() {
  return (
    <>
      <PageMeta title="Income Disclaimer" description="Synergy Team's income disclaimer for the freelancing and network marketing tracks." />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Income Disclaimer</span>
          </div>
          <div className="eyebrow">Please read before applying</div>
          <h1>Income Disclaimer</h1>
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="prose">
            <span className="updated">Last updated: 2026</span>

            <h2>No guaranteed income</h2>
            <p>
              Any income figures, examples, or success stories mentioned or implied anywhere on
              this site, in team chats, or in conversations with team members are not typical and
              are not guaranteed. Your results will depend on your own effort, skill, consistency,
              market conditions, and factors outside Synergy Team's control.
            </p>

            <h2>Freelancing track</h2>
            <p>
              The freelancing track provides training, mentorship, and gig-setup support. It does
              not guarantee clients, bookings, or any specific income. Freelance platforms such as
              Fiverr and Upwork set their own rules and fees, which are outside our control and
              may change at any time.
            </p>

            <h2>Network marketing track</h2>
            <p>
              The network marketing track involves becoming an independent distributor with
              Neolife. This is a real business that requires genuine effort, consistent
              prospecting, and customer relationships — it is not a passive income stream and it
              is not an investment vehicle. As with any network marketing business, most
              participants earn modest amounts, and a smaller number who build and lead active
              teams over time earn more. Synergy Team does not control, and is not responsible
              for, Neolife's official compensation plan, pricing, or policies — ask your mentor
              for the current official documentation before you commit to anything.
            </p>

            <h2>No professional advice</h2>
            <p>
              Nothing on this site constitutes financial, legal, or tax advice. Consider your own
              circumstances, and consult a qualified professional where appropriate, before making
              financial decisions.
            </p>

            <h2>Questions</h2>
            <p>
              If anything here is unclear, ask us directly before you apply — reach us at{" "}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or via WhatsApp from the{" "}
              <Link to="/join">Join</Link> page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
