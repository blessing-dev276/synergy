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
      {story.result && (
        <a className="t-result" href={story.result} target="_blank" rel="noreferrer">
          <img src={story.result} alt={`${story.name}'s result`} />
          View result
        </a>
      )}
    </div>
  );
}
