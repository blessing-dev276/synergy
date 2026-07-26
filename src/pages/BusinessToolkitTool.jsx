import { Link, useParams } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import NotFound from "./NotFound.jsx";
import { getToolkitTool } from "../data/businessToolkit.js";

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
        stroke="#9A6A15"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="#0B3E91"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Generic renderer for every /business-toolkit/:slug page, driven entirely
// by src/data/businessToolkit.js, adding a new tool never touches this file.
export default function BusinessToolkitTool() {
  const { slug } = useParams();
  const tool = getToolkitTool(slug);

  if (!tool) return <NotFound />;

  const {
    name,
    affiliateLink,
    meta,
    hero,
    challengesHeading,
    challenges,
    featuresHeading,
    features,
    audiencesHeading,
    audiences,
    whyWeRecommend,
    finalCta,
  } = tool;

  const affiliateProps = {
    href: affiliateLink,
    target: "_blank",
    rel: "noopener noreferrer sponsored nofollow",
  };

  return (
    <>
      <PageMeta title={meta.title.split(" | ")[0]} description={meta.description} />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span>{" "}
            <span>Business Toolkit</span> <span>/</span> <span>{name}</span>
          </div>
          <div className="eyebrow">{hero.eyebrow}</div>
          <h1>{hero.headline}</h1>
          <p className="lede">{hero.subheadline}</p>
          <div className="hero-ctas">
            <a {...affiliateProps} className="btn btn-primary">
              {hero.ctaLabel}
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">{challengesHeading.eyebrow}</div>
            <h2>{challengesHeading.heading}</h2>
          </div>
          <div className="why-grid">
            {challenges.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <SparkIcon />
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
            <div className="eyebrow">{featuresHeading.eyebrow}</div>
            <h2>{featuresHeading.heading}</h2>
          </div>
          <div className="toolkit-feature-grid">
            {features.map((feature) => (
              <div className="toolkit-feature-card" key={feature}>
                <CheckIcon />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">{audiencesHeading.eyebrow}</div>
            <h2>{audiencesHeading.heading}</h2>
          </div>
          <div className="why-grid">
            {audiences.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <SparkIcon />
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
          <div className="section-head center">
            <div className="eyebrow">{whyWeRecommend.eyebrow}</div>
            <h2>{whyWeRecommend.heading}</h2>
          </div>
          <div className="about-body">
            {whyWeRecommend.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>{finalCta.heading}</h2>
            <div className="hero-ctas">
              <a {...affiliateProps} className="btn btn-primary">
                {finalCta.ctaLabel}
              </a>
            </div>
          </div>
          <div className="affiliate-disclosure">
            <strong>Affiliate Disclosure:</strong> Some links on this page are
            affiliate links. If you choose to purchase through them, we may
            earn a commission at no additional cost to you. We only recommend
            products we believe provide genuine value.
          </div>
        </div>
      </section>
    </>
  );
}
