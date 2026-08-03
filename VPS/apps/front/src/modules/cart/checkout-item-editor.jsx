import { useEffect, useRef, useState } from "react";
import { searchStorefront } from "../products/products.api";
import { formatCurrency } from "./cart.utils";

function resolveSearchImg(product) {
  const image = Array.isArray(product?.images) && product.images[0];
  if (!image) {
    return "";
  }
  return typeof image === "string" ? image : image.thumbnail || image.url || "";
}

function resolveSearchPrice(product) {
  return Number(product?.pricing?.visiblePrice ?? product?.salePrice ?? 0);
}

// Lets a buyer adjust qty, remove, or add a product from the Review step —
// right before Pay Now / Place Order — instead of having to leave checkout
// and go back to the cart page. Every action goes straight to the server
// cart (same add/update/delete endpoints the cart page itself uses) and the
// caller re-fetches the cart afterward, so this tab's view of the cart —
// and the updatedAt value sent with the final order submission — always
// reflects whatever this tab did last, not stale data from page load.
export function CheckoutItemEditor({ items, existingProductIds, busy, onQtyChange, onRemove, onAddProduct }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await searchStorefront({ q: trimmed, limit: 6 });
        setResults((response?.results || []).filter((row) => row.entityType === "product"));
      } catch (_error) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="proto-review-items-editor">
      <div className="proto-review-items-list">
        {items.map((item) => (
          <div key={item.productId} className="proto-review-item-row">
            <div className="proto-review-item-media">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} loading="lazy" />
              ) : (
                <span>{item.sku || "Jenix"}</span>
              )}
            </div>
            <div className="proto-review-item-copy">
              <p>{item.title}</p>
              <strong>{formatCurrency(item.lineTotal)}</strong>
            </div>
            <div className="proto-review-item-qty">
              <button
                type="button"
                disabled={busy || Number(item.qty) <= 1}
                onClick={() => onQtyChange(item.productId, Number(item.qty) - 1)}
                aria-label={`Decrease quantity of ${item.title}`}
              >
                −
              </button>
              <span>{item.qty}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onQtyChange(item.productId, Number(item.qty) + 1)}
                aria-label={`Increase quantity of ${item.title}`}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="proto-review-item-remove"
              disabled={busy}
              onClick={() => onRemove(item.productId)}
              aria-label={`Remove ${item.title}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="proto-review-add-product">
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Search to add another product…"
        />
        {showResults && query.trim().length >= 2 ? (
          <div className="proto-review-add-results">
            {searching ? (
              <p className="proto-review-add-empty">Searching…</p>
            ) : results.length === 0 ? (
              <p className="proto-review-add-empty">No products found.</p>
            ) : (
              results.map((row) => {
                const alreadyInCart = existingProductIds.includes(row.id);
                return (
                  <div key={row.id} className="proto-review-add-row">
                    <div className="proto-review-item-media">
                      {resolveSearchImg(row.product) ? (
                        <img src={resolveSearchImg(row.product)} alt={row.title} loading="lazy" />
                      ) : (
                        <span>Jenix</span>
                      )}
                    </div>
                    <div className="proto-review-item-copy">
                      <p>{row.title}</p>
                      <strong>{formatCurrency(resolveSearchPrice(row.product))}</strong>
                    </div>
                    <button
                      type="button"
                      className="proto-review-add-btn"
                      disabled={busy || alreadyInCart}
                      onClick={() => {
                        onAddProduct(row.product);
                        setQuery("");
                        setResults([]);
                        setShowResults(false);
                      }}
                    >
                      {alreadyInCart ? "In Cart" : "Add"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
