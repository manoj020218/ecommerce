import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { WebsiteBuyerLeadSection } from "../website-leads/website-buyer-lead-section";
import { listBlogCategories, listBlogs } from "./blogs.api";

function formatDate(value) {
  if (!value) {
    return "Draft";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function GuideCard({ blog }) {
  return (
    <article className="guide-list-card">
      <div className="guide-list-copy">
        <div className="hero-kicker-row">
          <span className="eyebrow-chip">{blog.category?.name || "Guide"}</span>
          <span className="guide-meta-text">
            {formatDate(blog.publishedAt)} - {blog.readingTimeMinutes} min read
          </span>
        </div>
        <h3>{blog.title}</h3>
        <p>{blog.excerpt}</p>
        <div className="chip-row">
          {(Array.isArray(blog.tags) ? blog.tags : []).slice(0, 4).map((tag) => (
            <span key={tag} className="search-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <Link to={`/guides/${blog.slug}`} className="btn secondary compact-guide-link">
        Read Guide
      </Link>
    </article>
  );
}

export function BlogsListPage() {
  const { customer, isAuthenticated } = useCustomerSession();
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      listBlogCategories(),
      listBlogs({
        q: query,
        categoryId
      })
    ])
      .then(([categoryRows, blogRows]) => {
        if (!active) {
          return;
        }
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
        setBlogs(Array.isArray(blogRows) ? blogRows : []);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Failed to load guides.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [query, categoryId]);

  const totalGuides = useMemo(() => blogs.length, [blogs]);

  return (
    <main className="front-shell">
      <header className="front-header">
        <div className="hero-kicker-row">
          <span className="eyebrow-chip">Knowledge Base</span>
          <Link to={isAuthenticated ? "/account" : "/account/login"} className="inline-link">
            {isAuthenticated
              ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
              : "Customer Login"}
          </Link>
        </div>
        <div className="brand-block">
          <p>Jenix India</p>
          <h1>Installation Guides, Buying Advice, and Troubleshooting</h1>
        </div>

        <form
          className="guide-filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchText.trim());
          }}
        >
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search CCTV, smart lock, router, or troubleshooting guides"
          />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All guide categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button type="submit">Search</button>
        </form>
      </header>

      <section className="list-meta">
        <p>{query ? `Showing guide results for "${query}"` : "Browse all published guides"}</p>
        <strong>{totalGuides} guides</strong>
      </section>

      {loading ? <div className="state-box">Loading guides...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="guide-list-grid">
            {blogs.map((blog) => (
              <GuideCard key={blog.id} blog={blog} />
            ))}
          </section>
          <WebsiteBuyerLeadSection />
        </>
      ) : null}
    </main>
  );
}
