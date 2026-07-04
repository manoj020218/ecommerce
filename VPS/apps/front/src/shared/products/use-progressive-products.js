import { useEffect, useRef, useState } from "react";
import { listProducts } from "../../modules/products/products.api";

const FIRST_BATCH = 5;
const NEXT_BATCH = 10;

// Fetches products in progressive batches:
// 1. First 5 immediately (tiny payload → fast first render)
// 2. Then 10 at a time automatically until all loaded
// Returns products[], skeletonCount (how many placeholders to show), initialLoading, error
export function useProgressiveProducts({ q = "", categoryId = "" } = {}) {
  const [products, setProducts] = useState([]);
  const [skeletonCount, setSkeletonCount] = useState(FIRST_BATCH);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setProducts([]);
    setSkeletonCount(FIRST_BATCH);
    setInitialLoading(true);
    setError("");

    async function run() {
      try {
        // Batch 1: 5 products — small payload, renders in ~100ms
        const first = await listProducts({ q, categoryId, limit: FIRST_BATCH, offset: 0 });
        if (cancelRef.current) return;

        const firstItems = Array.isArray(first) ? first : (first?.items ?? []);
        setProducts(firstItems);
        setInitialLoading(false);

        // Backward-compat: if server returned flat array, we're done
        if (Array.isArray(first) || !first?.hasMore) {
          setSkeletonCount(0);
          return;
        }

        // Batches 2+: auto-load 10 at a time
        let offset = firstItems.length;
        let more = first.hasMore;
        const total = first.total ?? Infinity;

        while (more && !cancelRef.current) {
          const remaining = total - offset;
          setSkeletonCount(Math.min(NEXT_BATCH, remaining));

          const next = await listProducts({ q, categoryId, limit: NEXT_BATCH, offset });
          if (cancelRef.current) return;

          const nextItems = next?.items ?? [];
          setProducts((prev) => [...prev, ...nextItems]);
          offset += nextItems.length;
          more = next?.hasMore ?? false;
        }

        if (!cancelRef.current) setSkeletonCount(0);
      } catch (err) {
        if (!cancelRef.current) {
          setError(err.message || "Failed to load products.");
          setInitialLoading(false);
          setSkeletonCount(0);
        }
      }
    }

    run();
    return () => { cancelRef.current = true; };
  }, [q, categoryId]);

  return { products, skeletonCount, initialLoading, error };
}
