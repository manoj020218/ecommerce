export function LoadingBlock({ label = "Loading..." }) {
  return (
    <div className="state-panel">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}
