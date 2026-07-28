import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { buildCartContext, notifyStorefrontCartUpdated } from "../cart/cart.utils";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontButton,
  StorefrontChip,
  StorefrontEmptyState,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSelect
} from "../../shared/storefront/storefront-ui";
import { useProgressiveProducts } from "../../shared/products/use-progressive-products";
import { ProductSkeletonGrid } from "../../shared/products/product-skeleton";
import {
  addCartItem,
  listCategories
} from "./products.api";

function currency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function resolveImg(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  return img.url || img.thumbnail || "";
}

function visiblePrice(product) {
  return Number(product?.pricing?.visiblePrice ?? product?.salePrice ?? 0);
}

function compareAtPrice(product) {
  if (product?.pricing?.compareAtPrice !== null && product?.pricing?.compareAtPrice !== undefined) {
    return Number(product.pricing.compareAtPrice);
  }

  const basePrice = Number(product?.basePrice || 0);
  const salePrice = Number(product?.salePrice || 0);
  return basePrice > salePrice ? basePrice : null;
}

function ProductCard({ product, busy, onAddToCart }) {
  const price = visiblePrice(product);
  const comparePrice = compareAtPrice(product);
  const outOfStock = product.isPurchasable === false;

  return (
    <Link to={`/products/${product.slug}`} className="proto-product-card proto-product-card-grid">
      <div className="proto-product-media proto-product-media-grid">
        {Array.isArray(product.images) && product.images[0] ? (
          <img src={resolveImg(product.images[0])} alt={product.title} loading="lazy" />
        ) : (
          <div className="proto-product-placeholder">{product.brand || "Jenix"}</div>
        )}
        {outOfStock ? (
          <span className="proto-product-flag proto-flag-red">Out of Stock</span>
        ) : null}
      </div>
      <div className="proto-product-copy">
        <p>{product.brand || "Jenix India"}</p>
        <h3>{product.title}</h3>
        <div className="proto-price-row">
          <strong>{currency(price)}</strong>
          {comparePrice && comparePrice > price ? <span>{currency(comparePrice)}</span> : null}
        </div>
        <small>+{Number(product.gstRate || 18)}% GST</small>
        <StorefrontButton
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onAddToCart(product);
          }}
          disabled={busy || outOfStock}
        >
          {outOfStock ? "Out of Stock" : busy ? "Adding..." : "Add to Cart"}
        </StorefrontButton>
      </div>
    </Link>
  );
}

function sortProducts(products, sortValue) {
  const rows = [...products];

  if (sortValue === "price_low") {
    return rows.sort((left, right) => visiblePrice(left) - visiblePrice(right));
  }

  if (sortValue === "price_high") {
    return rows.sort((left, right) => visiblePrice(right) - visiblePrice(left));
  }

  if (sortValue === "title") {
    return rows.sort((left, right) => left.title.localeCompare(right.title));
  }

  return rows;
}

export function ProductsListPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { isAuthenticated } = useCustomerSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busyProductId, setBusyProductId] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const query = searchParams.get("q") || "";
  const sortValue = searchParams.get("sort") || "relevance";
  const inStockOnly = searchParams.get("availability") === "in_stock";
  const activeFilterCount = [Boolean(slug), Boolean(query), inStockOnly].filter(Boolean).length;

  useEffect(() => {
    let active = true;

    setCategoryLoading(true);
    listCategories()
      .then((rows) => {
        if (active) {
          setCategories(Array.isArray(rows) ? rows : []);
        }
      })
      .catch(() => {
        if (active) {
          setCategories([]);
        }
      })
      .finally(() => {
        if (active) {
          setCategoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const activeCategory = useMemo(
    () => categories.find((category) => category.slug === slug) || null,
    [categories, slug]
  );
  const unknownCategory = Boolean(slug && !categoryLoading && !activeCategory);

  const {
    products: rawProducts,
    skeletonCount,
    initialLoading,
    error: productsError
  } = useProgressiveProducts({
    q: query,
    categoryId: activeCategory?.id || ""
  });

  const visibleProducts = useMemo(() => {
    const rows = inStockOnly ? rawProducts.filter((p) => p.isPurchasable) : rawProducts;
    return sortProducts(rows, sortValue);
  }, [rawProducts, inStockOnly, sortValue]);

  const selectedCategoryName = activeCategory?.name || "All Products";

  const updateSearch = (nextValues = {}) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || value === false) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, String(value));
      }
    });

    setSearchParams(nextParams, { replace: true });
  };

  const addProductToCart = async (product) => {
    setBusyProductId(product.id);
    setNotice("");

    try {
      await addCartItem({
        ...buildCartContext(isAuthenticated),
        productId: product.id,
        qty: 1
      });
      notifyStorefrontCartUpdated();
      setNotice(`${product.title} added to cart.`);
    } catch (requestError) {
      setNotice(requestError.message || "Unable to add this product to the cart.");
    } finally {
      setBusyProductId("");
    }
  };

  const clearFilters = () => {
    setMobileFiltersOpen(false);
    navigate("/products");
  };

  const navigateToCategory = (nextSlug = "") => {
    setMobileFiltersOpen(false);
    const nextParams = new URLSearchParams(searchParams);
    const suffix = nextParams.toString();
    const nextPath = nextSlug ? `/categories/${nextSlug}` : "/products";
    navigate(suffix ? `${nextPath}?${suffix}` : nextPath);
  };

  return (
    <main className="proto-main-shell">
      <div className="proto-listing-shell">
        <nav className="proto-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <span>{selectedCategoryName}</span>
        </nav>

        <StorefrontPageHeader
          className="proto-listing-header"
          title={selectedCategoryName}
          description={
            query
              ? `${visibleProducts.length} results for "${query}"`
              : `${visibleProducts.length} products found`
          }
          actions={
            <div className="proto-listing-actions">
              <StorefrontSelect
              value={sortValue}
              onChange={(event) => updateSearch({ sort: event.target.value })}
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="title">Alphabetical</option>
              </StorefrontSelect>
              <StorefrontButton
                type="button"
                variant="light"
                className="proto-mobile-filter-trigger"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <span>Filters</span>
                {activeFilterCount > 0 ? (
                  <span className="proto-filter-trigger-count">{activeFilterCount}</span>
                ) : null}
              </StorefrontButton>
            </div>
          }
        />

        {notice ? <StorefrontAlert>{notice}</StorefrontAlert> : null}
        {productsError && !unknownCategory ? <StorefrontAlert tone="error">{productsError}</StorefrontAlert> : null}

        <div className="proto-filter-chip-row">
          {slug ? (
            <StorefrontChip type="button" active onClick={clearFilters}>
              {selectedCategoryName}
            </StorefrontChip>
          ) : null}
          {query ? (
            <StorefrontChip type="button" active onClick={() => updateSearch({ q: "" })}>
              Search: {query}
            </StorefrontChip>
          ) : null}
          {inStockOnly ? (
            <StorefrontChip
              type="button"
              active
              onClick={() => updateSearch({ availability: "" })}
            >
              In Stock Only
            </StorefrontChip>
          ) : null}
          {slug || query || inStockOnly ? (
            <button type="button" className="proto-filter-reset" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
        </div>

        <div className="proto-filter-layout">
          <aside className="proto-filter-sidebar">
            <div className="proto-filter-card">
              <h3>Categories</h3>
              <div className="proto-filter-stack">
                <button
                  type="button"
                  className={`proto-filter-option${!slug ? " active" : ""}`}
                  onClick={() => navigateToCategory("")}
                >
                  All Products
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`proto-filter-option${slug === category.slug ? " active" : ""}`}
                    onClick={() => {
                      navigateToCategory(category.slug);
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="proto-filter-card">
              <h3>Availability</h3>
              <label className="proto-check-option">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(event) =>
                    updateSearch({
                      availability: event.target.checked ? "in_stock" : ""
                    })
                  }
                />
                <span>In Stock Only</span>
              </label>
            </div>
          </aside>

          <section className="proto-listing-content">
            {(initialLoading || (categoryLoading && Boolean(slug))) && !unknownCategory ? (
              <StorefrontLoadingState label="Loading products..." />
            ) : null}

            {unknownCategory ? (
              <StorefrontAlert tone="error">This category is not available in the current catalog.</StorefrontAlert>
            ) : null}

            {!initialLoading && !unknownCategory && !productsError && skeletonCount === 0 && visibleProducts.length === 0 ? (
              <StorefrontEmptyState
                title="No products matched"
                description="Try another category, search keyword, or availability filter."
              />
            ) : null}

            {!unknownCategory && (visibleProducts.length > 0 || skeletonCount > 0) ? (
              <div className="proto-product-grid proto-product-grid-catalog">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    busy={busyProductId === product.id}
                    onAddToCart={addProductToCart}
                  />
                ))}
                <ProductSkeletonGrid count={skeletonCount} />
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <div className={`proto-mobile-sheet${mobileFiltersOpen ? " open" : ""}`}>
        <button
          type="button"
          className="proto-mobile-sheet-backdrop"
          onClick={() => setMobileFiltersOpen(false)}
          aria-label="Close filters"
        />
        <div className="proto-mobile-sheet-panel">
          <div className="proto-mobile-sheet-head">
            <h3>Filters</h3>
            <button type="button" onClick={() => setMobileFiltersOpen(false)}>
              Close
            </button>
          </div>

          <div className="proto-filter-card">
            <h3>Sort</h3>
            <StorefrontSelect
              value={sortValue}
              onChange={(event) => updateSearch({ sort: event.target.value })}
            >
              <option value="relevance">Relevance</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="title">Alphabetical</option>
            </StorefrontSelect>
          </div>

          <div className="proto-filter-card">
            <h3>Categories</h3>
            <div className="proto-filter-stack">
              <button
                type="button"
                className={`proto-filter-option${!slug ? " active" : ""}`}
                onClick={() => {
                  navigateToCategory("");
                }}
              >
                All Products
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`proto-filter-option${slug === category.slug ? " active" : ""}`}
                  onClick={() => {
                    navigateToCategory(category.slug);
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="proto-filter-card">
            <h3>Availability</h3>
            <label className="proto-check-option">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) =>
                  updateSearch({
                    availability: event.target.checked ? "in_stock" : ""
                  })
                }
              />
              <span>In Stock Only</span>
            </label>
          </div>

          <div className="proto-mobile-sheet-actions">
            <StorefrontButton type="button" variant="light" onClick={clearFilters}>
              Clear
            </StorefrontButton>
            <StorefrontButton type="button" onClick={() => setMobileFiltersOpen(false)}>
              Apply Filters
            </StorefrontButton>
          </div>
        </div>
      </div>
    </main>
  );
}
