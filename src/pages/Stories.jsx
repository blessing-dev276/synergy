import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { TRUST_STATS } from "../data/site.js";
import { STORIES } from "../data/stories.js";
import StoryCard from "../components/StoryCard.jsx";

export default function Stories() {
  return (
    <>
      <PageMeta
        title="Success Stories"
        description="Read what Synergy Team members say about the freelancing and network marketing tracks."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Success Stories</span>
          </div>
          <div className="eyebrow">From the team</div>
          <h1>Real people, two tracks, real progress.</h1>
          <p className="lede">
            A few notes from members on the freelancing track, the network marketing track, and
            those running both at once.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="trust-strip" style={{ marginTop: 0, marginBottom: 56 }}>
            {TRUST_STATS.map((stat) => (
              <div className="trust-item" key={stat.label}>
                <div className="num mono">{stat.num}</div>
                <div className="label">{stat.label}</div>
              </div>
            ))}
          </div>

          {STORIES.length === 0 ? (
            <div className="gallery-empty">
              <p>Stories coming soon — check back after our next round of results.</p>
            </div>
          ) : (
            <div className="testimonials">
              {STORIES.map((s) => (
                <StoryCard story={s} key={s.slug} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Want your story here next?</h2>
            <p>Apply to join Synergy Team and start building your own track record.</p>
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
