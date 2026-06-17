import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontAlert,
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontInput,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSelect
} from "../../shared/storefront/storefront-ui";
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
    <StorefrontCard as="article" className="guide-list-card" elevated>
      <div className="guide-list-copy">
        <div className="hero-kicker-row">
          <StorefrontBadge className="eyebrow-chip">{blog.category?.name || "Guide"}</StorefrontBadge>
          <span className="guide-meta-text">
            {formatDate(blog.publishedAt)} | {blog.readingTimeMinutes} min read
          </span>
        </div>
        <h3>{blog.title}</h3>
        <p>{blog.excerpt}</p>
        <div className="chip-row">
          {(Array.isArray(blog.tags) ? blog.tags : []).slice(0, 4).map((tag) => (
            <StorefrontBadge key={tag} className="search-chip">
              {tag}
            </StorefrontBadge>
          ))}
        </div>
      </div>
      <StorefrontButton to={`/guides/${blog.slug}`} variant="light" className="compact-guide-link">
        Read Guide
      </StorefrontButton>
    </StorefrontCard>
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
    <main className="proto-main-shell">
      <StorefrontCard className="front-header" elevated>
        <StorefrontPageHeader
          eyebrow="Knowledge Base"
          title="Installation Guides, Buying Advice, and Troubleshooting"
          description="Browse setup notes, product comparisons, and support articles in the same storefront theme."
          actions={
            <StorefrontButton
              to={isAuthenticated ? "/account" : "/account/login"}
              variant="light"
            >
              {isAuthenticated
                ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
                : "Customer Login"}
            </StorefrontButton>
          }
        />

        <form
          className="guide-filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchText.trim());
          }}
        >
          <StorefrontInput
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search CCTV, smart lock, router, or troubleshooting guides"
          />
          <StorefrontSelect value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All guide categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </StorefrontSelect>
          <StorefrontButton type="submit">Search</StorefrontButton>
        </form>
      </StorefrontCard>

      <section className="list-meta">
        <p>{query ? `Showing guide results for "${query}"` : "Browse all published guides"}</p>
        <strong>{totalGuides} guides</strong>
      </section>

      {loading ? <StorefrontLoadingState label="Loading guides..." /> : null}
      {error ? <StorefrontAlert tone="error">{error}</StorefrontAlert> : null}

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
