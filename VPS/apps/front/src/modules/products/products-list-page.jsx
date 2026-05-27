import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProducts, searchStorefront } from "./products.api";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { WebsiteBuyerLeadSection } from "../website-leads/website-buyer-lead-section";

function currency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function ProductCard({ product }) {
  const imageUrl = Array.isArray(product.images) && product.images[0] ? product.images[0] : null;

  return (
    <Link to={`/products/${product.slug}`} className="product-card">
      <div className="product-card-media">
        {imageUrl ? (
          <img src={imageUrl} alt={product.title} loading="lazy" />
        ) : (
          <div className="product-card-placeholder">No image</div>
        )}
      </div>
      <div className="product-card-body">
        <p className="product-card-brand">{product.brand || "Jenix India"}</p>
        <h3>{product.title}</h3>
        <div className="product-card-price-row">
          <strong>{currency(product.salePrice)}</strong>
          {Number(product.basePrice || 0) > Number(product.salePrice || 0) ? (
            <span>{currency(product.basePrice)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductsListPage() {
  const { customer, isAuthenticated } = useCustomerSession();
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [products, setProducts] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    const request = query
      ? searchStorefront({ q: query, limit: 20 })
      : listProducts({ q: "" });

    request
      .then((payload) => {
        if (!mounted) {
          return;
        }

        if (query) {
          const results = Array.isArray(payload?.results) ? payload.results : [];
          setProducts(
            results
              .filter((row) => row.entityType === "product" && row.product)
              .map((row) => row.product)
          );
          setBlogs(
            results
              .filter((row) => row.entityType === "blog" && row.blog)
              .map((row) => row.blog)
          );
          return;
        }

        setProducts(Array.isArray(payload) ? payload : []);
        setBlogs([]);
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || "Failed to load products.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [query]);

  const total = useMemo(() => products.length + blogs.length, [products, blogs]);

  return (
    <main className="front-shell">
      <header className="front-header">
        <div className="hero-kicker-row">
          <span className="eyebrow-chip">Storefront</span>
          <Link to={isAuthenticated ? "/account" : "/account/login"} className="inline-link">
            {isAuthenticated
              ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
              : "Customer Login"}
          </Link>
        </div>
        <div className="brand-block">
          <p>Jenix India</p>
          <h1>Security Product Store</h1>
        </div>

        <div className="chip-row">
          <Link to="/guides" className="inline-link">
            Browse Guides
          </Link>
        </div>

        <form
          className="front-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchText.trim());
          }}
        >
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by product, model, or keyword"
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <section className="list-meta">
        <p>{query ? `Showing results for "${query}"` : "Browse all products"}</p>
        <strong>{total} items</strong>
      </section>

      {loading ? <div className="state-box">Loading products...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      {!loading && !error ? (
        <>
          {products.length > 0 ? (
            <section className="products-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>
          ) : null}

          {blogs.length > 0 ? (
            <section className="section-block">
              <div className="section-head">
                <h3>Helpful guides from search</h3>
              </div>
              <div className="guide-inline-grid">
                {blogs.map((blog) => (
                  <Link key={blog.id} to={`/guides/${blog.slug}`} className="guide-inline-card">
                    <span className="eyebrow-chip">{blog.category?.name || "Guide"}</span>
                    <strong>{blog.title}</strong>
                    <p>{blog.excerpt}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <WebsiteBuyerLeadSection />
        </>
      ) : null}
    </main>
  );
}
