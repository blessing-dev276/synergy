import { useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { GALLERY_EVENTS } from "../data/gallery.js";
import { getEventPhotos } from "../lib/galleryPhotos.js";

export default function Gallery() {
  const [active, setActive] = useState(null); // { slug, title, index } | null

  const events = GALLERY_EVENTS.map((event) => ({
    ...event,
    photos: getEventPhotos(event.slug),
  })).filter((event) => event.photos.length > 0);

  return (
    <>
      <PageMeta
        title="Team Gallery"
        description="Photos from Synergy Team events, trainings, and get-togethers."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Gallery</span>
          </div>
          <div className="eyebrow">Moments from the team</div>
          <h1>Team Gallery</h1>
          <p className="lede">
            Photos from trainings, events, and get-togethers — a look at the team behind the two
            tracks.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          {events.length === 0 ? (
            <div className="gallery-empty">
              <p>Photos coming soon — check back after our next team event.</p>
            </div>
          ) : (
            events.map((event) => (
              <div className="gallery-event" key={event.slug}>
                <div className="gallery-event-head">
                  <h3>{event.title}</h3>
                  {event.date && <span className="mono">{event.date}</span>}
                </div>
                <div className="gallery-grid">
                  {event.photos.map((src, i) => (
                    <button
                      key={src}
                      className="gallery-thumb"
                      onClick={() => setActive({ slug: event.slug, title: event.title, index: i })}
                    >
                      <img src={src} alt={`${event.title} — photo ${i + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta">
            <h2>Want to be at the next one?</h2>
            <p>Apply to join Synergy Team and get in on the next team event.</p>
            <div className="hero-ctas">
              <Link to="/join" className="btn btn-primary">
                Apply to join Synergy Team
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
