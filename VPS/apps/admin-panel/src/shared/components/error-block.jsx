export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="state-panel error">
      <p>{message || "Something went wrong."}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
