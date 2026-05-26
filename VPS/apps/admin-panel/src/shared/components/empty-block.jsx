export function EmptyBlock({ title = "No data found.", description }) {
  return (
    <div className="state-panel">
      <p>{title}</p>
      {description ? <p className="muted">{description}</p> : null}
    </div>
  );
}
