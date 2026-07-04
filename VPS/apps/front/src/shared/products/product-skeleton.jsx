// Skeleton placeholder cards shown while products load progressively
export function ProductSkeletonCard({ variant = "grid" }) {
  return (
    <div className={`proto-skel-card${variant === "rail" ? " proto-skel-card-rail" : ""}`} aria-hidden="true">
      <div className="proto-skel-media" />
      <div className="proto-skel-body">
        <div className="proto-skel-line proto-skel-sm" />
        <div className="proto-skel-line proto-skel-lg" />
        <div className="proto-skel-line proto-skel-md" />
        <div className="proto-skel-btn-bar" />
      </div>
    </div>
  );
}

export function ProductSkeletonGrid({ count = 5, variant = "grid" }) {
  return Array.from({ length: count }, (_, i) => (
    <ProductSkeletonCard key={i} variant={variant} />
  ));
}
