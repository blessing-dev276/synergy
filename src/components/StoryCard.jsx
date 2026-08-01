import { useLayoutEffect, useRef, useState } from "react";

// Clamps the quote to 10 lines and only shows "View more" if the story
// actually overflows that, so short stories never get an empty toggle.
function StoryQuote({ text }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <>
      <p ref={ref} className={`quote ${expanded ? "" : "quote-clamp"}`}>
        &quot;{text}&quot;
      </p>
      {clamped && (
        <button
          type="button"
          className="quote-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
    </>
  );
}

export default function StoryCard({ story }) {
  return (
    <div className="t-card">
      <div className="who">
        {story.picture ? (
          <img className="t-avatar" src={story.picture} alt={story.name} />
        ) : (
          <span className="t-avatar" />
        )}
        <div>
          <strong>{story.name}</strong>
          {story.status && <span>{story.status}</span>}
        </div>
      </div>
      <StoryQuote text={story.story} />
      {story.results?.length > 0 && (
        <div className="t-results">
          {story.results.map((r, i) => (
            <a
              className="t-result"
              href={r.image}
              target="_blank"
              rel="noreferrer"
              key={r.image}
            >
              <img src={r.image} alt={r.caption || `${story.name}'s result ${i + 1}`} />
              <span>{r.caption || "View result"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
