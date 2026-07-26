import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Accordion from "../components/Accordion.jsx";
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

function CheckIcon({ size = 16, stroke = "#0B3E91" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Small, distinct line-icon per audience so the "Who Is It For?" cards read
// at a glance instead of repeating one generic icon seven times.
const AUDIENCE_ICONS = {
  freelancer: (
    <path
      d="M4 8h16v11H4z M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2 M4 13h16"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  agency: (
    <path
      d="M4 21V9l6-4 6 4v12 M4 21h16 M10 21v-5h4v5 M8 12h.01 M13 12h.01 M8 16h.01 M13 16h.01"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  coach: (
    <path
      d="M3 11v3l14 4V7L3 11z M17 9v7 M20 10.5v4"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  consultant: (
    <path
      d="M4 5h16v10H8l-4 4V5z M8 9h8 M8 12h5"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  network: (
    <path
      d="M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M19 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 8v6 M12 14l-6 4 M12 14l6 4"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  business: (
    <path
      d="M4 9l1-5h14l1 5 M4 9v11h16V9 M4 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0 M10 20v-6h4v6"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  creator: (
    <path
      d="M3 5h14v14H3z M17 9l4-2v10l-4-2 M9 9l3 3-3 3"
      stroke="#9A6A15"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

function AudienceIcon({ icon }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      {AUDIENCE_ICONS[icon] || AUDIENCE_ICONS.business}
    </svg>
  );
}

// Decorative, hand-built CRM/dashboard illustration for the hero, not an
// actual GoHighLevel screenshot, this page doesn't have a licensed product
// asset to show, so it draws a generic dashboard in the site's own palette
// instead of scraping or reproducing GoHighLevel's real UI or logo.
function DashboardMockup() {
  return (
    <svg viewBox="0 0 480 340" width="100%" height="100%" role="presentation">
      <rect x="0" y="0" width="480" height="340" rx="14" fill="#FFFFFF" />
      <rect x="0" y="0" width="480" height="28" rx="14" fill="#F6F8FB" />
      <circle cx="16" cy="14" r="4" fill="#E3E8F0" />
      <circle cx="30" cy="14" r="4" fill="#E3E8F0" />
      <circle cx="44" cy="14" r="4" fill="#E3E8F0" />
      <rect x="70" y="9" width="150" height="10" rx="5" fill="#E3E8F0" />

      {/* sidebar */}
      <rect x="0" y="28" width="88" height="312" fill="#0B1F3A" />
      <rect x="16" y="52" width="56" height="10" rx="5" fill="#1E7FE0" />
      <rect x="16" y="80" width="56" height="8" rx="4" fill="#33455E" />
      <rect x="16" y="102" width="56" height="8" rx="4" fill="#33455E" />
      <rect x="16" y="124" width="56" height="8" rx="4" fill="#33455E" />
      <rect x="16" y="146" width="40" height="8" rx="4" fill="#33455E" />

      {/* stat cards */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${104 + i * 128}, 46)`}>
          <rect width="112" height="66" rx="10" fill="#F6F8FB" stroke="#E3E8F0" />
          <rect x="14" y="14" width="34" height="8" rx="4" fill="#5B6B84" />
          <rect x="14" y="32" width="54" height="14" rx="4" fill="#0B1F3A" />
          <rect x="14" y="50" width="24" height="6" rx="3" fill={i === 1 ? "#1FB971" : "#D9992E"} />
        </g>
      ))}

      {/* bar chart */}
      <rect x="104" y="126" width="180" height="120" rx="10" fill="#F6F8FB" stroke="#E3E8F0" />
      {[26, 44, 34, 58, 40, 66].map((h, i) => (
        <rect
          key={i}
          x={120 + i * 26}
          y={230 - h}
          width="14"
          height={h}
          rx="3"
          fill={i % 2 === 0 ? "#1E7FE0" : "#29B2E8"}
        />
      ))}

      {/* contact list */}
      <rect x="296" y="126" width="168" height="120" rx="10" fill="#F6F8FB" stroke="#E3E8F0" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(310, ${142 + i * 32})`}>
          <circle cx="10" cy="10" r="10" fill="#D9992E" opacity="0.5" />
          <rect x="30" y="4" width="90" height="7" rx="3.5" fill="#0B1F3A" />
          <rect x="30" y="16" width="60" height="6" rx="3" fill="#5B6B84" />
        </g>
      ))}

      {/* funnel strip */}
      <rect x="104" y="258" width="360" height="60" rx="10" fill="#F6F8FB" stroke="#E3E8F0" />
      <rect x="120" y="274" width="80" height="12" rx="6" fill="#0B3E91" />
      <rect x="208" y="274" width="80" height="12" rx="6" fill="#1E7FE0" opacity="0.75" />
      <rect x="296" y="274" width="80" height="12" rx="6" fill="#29B2E8" opacity="0.6" />
      <rect x="384" y="274" width="64" height="12" rx="6" fill="#D9992E" opacity="0.7" />
      <rect x="120" y="294" width="328" height="6" rx="3" fill="#E3E8F0" />
    </svg>
  );
}

function SectionCta({ label, affiliateProps }) {
  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <a {...affiliateProps} className="btn btn-primary">
        {label}
      </a>
    </div>
  );
}

// Generic renderer for every /business-toolkit/:slug page, driven entirely
// by src/data/businessToolkit.js, adding a new tool never touches this file.
// Sections whose data is missing from the config simply don't render, so
// this stays a shared module rather than a GoHighLevel-only page.
export default function BusinessToolkitTool() {
  const { slug } = useParams();
  const tool = getToolkitTool(slug);

  const heroCtaRef = useRef(null);
  const finalCtaRef = useRef(null);
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const heroEl = heroCtaRef.current;
    const finalEl = finalCtaRef.current;
    if (!heroEl || !finalEl) return undefined;

    let heroVisible = true;
    let finalVisible = false;
    const update = () => setShowSticky(!heroVisible && !finalVisible);

    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        heroVisible = entry.isIntersecting;
        update();
      },
      { rootMargin: "-72px 0px 0px 0px" },
    );
    const finalObserver = new IntersectionObserver(([entry]) => {
      finalVisible = entry.isIntersecting;
      update();
    });
    heroObserver.observe(heroEl);
    finalObserver.observe(finalEl);
    return () => {
      heroObserver.disconnect();
      finalObserver.disconnect();
    };
  }, [slug]);

  if (!tool) return <NotFound />;

  const {
    name,
    affiliateLink,
    meta,
    hero,
    trustBadges,
    challengesHeading,
    challenges,
    featuresHeading,
    features,
    replaceSection,
    audiencesHeading,
    audiences,
    whyWeRecommend,
    faqsHeading,
    faqs,
    bonus,
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
          <div className="toolkit-hero-grid">
            <div>
              <div className="eyebrow">{hero.eyebrow}</div>
              <h1>{hero.headline}</h1>
              <p className="lede">{hero.subheadline}</p>
              <div className="hero-ctas">
                <a {...affiliateProps} ref={heroCtaRef} className="btn btn-primary">
                  {hero.ctaLabel}
                </a>
              </div>
            </div>
            <div className="hero-photo toolkit-mockup">
              <DashboardMockup />
              {hero.mockupCaption && (
                <div className="hero-photo-tag">
                  <span className="dot" />
                  <div>
                    <strong>{hero.mockupCaption}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {trustBadges && trustBadges.length > 0 && (
        <section className="toolkit-trust-section">
          <div className="wrap">
            <div className="trust-badges">
              {trustBadges.map((label) => (
                <div className="trust-badge" key={label}>
                  <CheckIcon size={14} stroke="#0B3E91" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
          <SectionCta label={hero.ctaLabel} affiliateProps={affiliateProps} />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">{featuresHeading.eyebrow}</div>
            <h2>{featuresHeading.heading}</h2>
          </div>
          <div className="why-grid">
            {features.map((item) => (
              <div className="why-card" key={item.title}>
                <div className="icon">
                  <CheckIcon />
                </div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <SectionCta label={hero.ctaLabel} affiliateProps={affiliateProps} />
        </div>
      </section>

      {replaceSection && (
        <section>
          <div className="wrap">
            <div className="section-head">
              <div className="eyebrow">{replaceSection.eyebrow}</div>
              <h2>{replaceSection.heading}</h2>
            </div>
            <div className="fit-grid">
              <div className="fit-card no">
                <h4>{replaceSection.replaceHeading}</h4>
                <ul>
                  {replaceSection.replaceList.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="fit-card yes">
                <h4>{replaceSection.withHeading}</h4>
                <ul>
                  {replaceSection.withList.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <SectionCta label={hero.ctaLabel} affiliateProps={affiliateProps} />
          </div>
        </section>
      )}

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
                  <AudienceIcon icon={item.icon} />
                </div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <SectionCta label={hero.ctaLabel} affiliateProps={affiliateProps} />
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

      {faqs && faqs.length > 0 && (
        <section>
          <div className="wrap">
            <div className="section-head">
              <div className="eyebrow">{faqsHeading.eyebrow}</div>
              <h2>{faqsHeading.heading}</h2>
            </div>
            <Accordion items={faqs} />
            <SectionCta label={hero.ctaLabel} affiliateProps={affiliateProps} />
          </div>
        </section>
      )}

      {bonus && (
        <section>
          <div className="wrap">
            <div className="bonus-box">
              <h3>{bonus.heading}</h3>
              <p>{bonus.body}</p>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="wrap">
          <div className="final-cta" ref={finalCtaRef}>
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

      {showSticky && (
        <a {...affiliateProps} className="toolkit-sticky-cta">
          <span>{hero.ctaLabel}</span>
          <span className="btn btn-primary">Go →</span>
        </a>
      )}
    </>
  );
}
