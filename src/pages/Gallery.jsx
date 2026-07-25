import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { GALLERY_EVENTS } from "../data/gallery.js";

// How many photos show before an event collapses behind a "+N" tile —
// matches the desktop 4-column grid so the closed state reads as one row.
const PREVIEW_COUNT = 4;

export default function Gallery() {
  const [active, setActive] = useState(null); // { slug, title, index } | null
  const [expandedSlug, setExpandedSlug] = useState(null);

  const events = GALLERY_EVENTS;

  return (
    <>
      <PageMeta
        title="Team Gallery"
        description="Photos from SynergyTeam events, trainings, and get-togethers."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Gallery</span>
          </div>
          <div className="eyebrow">Moments from the team</div>
          <h1>Team Gallery</h1>
          <p className="lede">
            Photos from trainings, events, and get-togethers, a look at the team
            behind the two tracks.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {events.length === 0 ? (
            <div className="gallery-empty">
              <p>Photos coming soon, check back after our next team event.</p>
            </div>
          ) : (
            events.map((event) => {
              const isExpanded = expandedSlug === event.slug;
              const extraCount = event.photos.length - PREVIEW_COUNT;
              const hasMore = extraCount > 0;
              const visiblePhotos =
                isExpanded || !hasMore
                  ? event.photos
                  : event.photos.slice(0, PREVIEW_COUNT);

              return (
                <div className="gallery-event" key={event.slug}>
                  <div className="gallery-event-head">
                    <h3>{event.title}</h3>
                    {event.date && (
                      <span className="mono">
                        {formatEventDate(event.date)}
                      </span>
                    )}
                  </div>
                  <div className="gallery-grid">
                    {visiblePhotos.map((src, i) => {
                      const isLastVisible =
                        hasMore &&
                        !isExpanded &&
                        i === visiblePhotos.length - 1;
                      return (
                        <button
                          key={src}
                          className="gallery-thumb"
                          onClick={() =>
                            isLastVisible
                              ? setExpandedSlug(event.slug)
                              : setActive({
                                  slug: event.slug,
                                  title: event.title,
                                  index: i,
                                })
                          }
                        >
                          <img
                            src={src}
                            alt={`${event.title}, photo ${i + 1}`}
                            loading="lazy"
                          />
                          {isLastVisible && (
                            <span className="gallery-more-overlay">
                              +{extraCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {hasMore && isExpanded && (
                    <button
                      className="gallery-showless"
                      onClick={() => setExpandedSlug(null)}
                    >
                      Show less ▴
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Want to be at the next one?</h2>
            <p>Apply to join SynergyTeam and get in on the next team event.</p>
            <div className="hero-ctas">
              <Link to="/join" className="btn btn-primary">
                Apply to join SynergyTeam
              </Link>
            </div>
          </div>
        </div>
      </section>

      {active &&
        (() => {
          const event = events.find((e) => e.slug === active.slug);
          if (!event) return null;
          return (
            <Lightbox
              photos={event.photos}
              index={active.index}
              title={active.title}
              onClose={() => setActive(null)}
              onNavigate={(index) => setActive((prev) => ({ ...prev, index }))}
            />
          );
        })()}
    </>
  );
}

// CMS stores dates as ISO ("2026-03-01"); show them the way a caption reads.
function formatEventDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
