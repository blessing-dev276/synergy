import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Accordion from "../components/Accordion.jsx";
import { FAQS } from "../data/site.js";

export default function FAQ() {
  return (
    <>
      <PageMeta
        title="FAQ"
        description="Answers to common questions about joining SynergyTeam's freelancing and network marketing tracks."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>FAQ</span>
          </div>
          <div className="eyebrow">Before you apply</div>
          <h1>Frequently asked questions</h1>
          <p className="lede">
            Everything people usually ask before joining SynergyTeam. Still have
            a question? Reach out on WhatsApp — we reply fast.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Accordion items={FAQS} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Ready to apply?</h2>
            <p>
              Tell us which track you want to start on. We'll onboard you within
              48 hours.
            </p>
            <div className="hero-ctas">
              <Link to="/join" className="btn btn-primary">
                Apply to join SynergyTeam
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
