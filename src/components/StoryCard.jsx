export default function StoryCard({ story }) {
  return (
    <div className="t-card">
      <p className="quote">&quot;{story.story}&quot;</p>
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
