export default function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If this keeps happening, contact an admin.",
  onRetry,
}) {
  return (
    <div className="state-block">
      <div className="state-icon">⚠️</div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{description}</div>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
