import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { WebsiteBuyerLeadSection } from "../website-leads/website-buyer-lead-section";
import { getBlog } from "./blogs.api";

function formatDate(value) {
  if (!value) {
    return "Unpublished";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function ProductMiniCard({ product }) {
  const imageUrl = Array.isArray(product.images) && product.images[0] ? product.images[0] : null;

  return (
    <Link to={`/products/${product.slug}`} className="mini-card">
      <div className="mini-media">
        {imageUrl ? <img src={imageUrl} alt={product.title} loading="lazy" /> : <span>No image</span>}
      </div>
      <div className="mini-body">
        <p>{product.title}</p>
        <strong>{product.brand || "Jenix Product"}</strong>
      </div>
    </Link>
  );
}

function GuideMiniCard({ blog }) {
  return (
    <Link to={`/guides/${blog.slug}`} className="guide-inline-card">
      <span className="eyebrow-chip">{blog.category?.name || "Guide"}</span>
      <strong>{blog.title}</strong>
      <p>{blog.excerpt}</p>
    </Link>
  );
}

export function BlogPage() {
  const { slug } = useParams();
  const { customer, isAuthenticated } = useCustomerSession();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getBlog(slug)
      .then((data) => {
        if (active) {
          setPayload(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Failed to load guide.");
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
  }, [slug]);

  const article = payload?.article || null;
  const contentBlocks = useMemo(() => {
    if (!article?.content) {
      return [];
    }

    return article.content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
  }, [article?.content]);

  if (loading) {
    return <main className="front-shell"><div className="state-box">Loading guide...</div></main>;
  }

  if (error || !article) {
    return (
      <main className="front-shell">
        <div className="state-box error">{error || "Guide not found."}</div>
        <Link to="/guides" className="back-link">
          Back to guides
        </Link>
      </main>
    );
  }

  return (
    <main className="front-shell guide-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload.structuredData?.article || {}) }}
      />
      {payload.structuredData?.faq ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(payload.structuredData.faq) }}
        />
      ) : null}

      <header className="front-header">
        <div className="hero-kicker-row">
          <span className="eyebrow-chip">{article.category?.name || "Guide"}</span>
          <Link to={isAuthenticated ? "/account" : "/account/login"} className="inline-link">
            {isAuthenticated
              ? `Account: ${(customer?.name || "Customer").split(" ")[0]}`
              : "Customer Login"}
          </Link>
        </div>
        <div className="guide-title-block">
          <p className="guide-meta-text">
            {formatDate(article.publishedAt)} - {article.readingTimeMinutes} min read - {article.author}
          </p>
          <h1>{article.title}</h1>
          <p>{article.excerpt}</p>
        </div>
        <div className="chip-row">
          {(Array.isArray(article.tags) ? article.tags : []).map((tag) => (
            <span key={tag} className="search-chip">
              {tag}
            </span>
          ))}
        </div>
      </header>

      <section className="guide-content-card">
        {contentBlocks.map((block, index) => (
          <p key={`${index}-${block.slice(0, 24)}`}>{block}</p>
        ))}
      </section>

      <section className="section-block">
        <div className="section-head">
          <h3>Need help choosing the right product?</h3>
        </div>
        <div className="cta-grid">
          <a className="btn whatsapp" href={payload.cta?.whatsappUrl}>
            WhatsApp Jenix
          </a>
          <Link to="/" className="btn secondary">
            Browse Products
          </Link>
        </div>
      </section>

      {Array.isArray(payload.relatedProducts) && payload.relatedProducts.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h3>Related products</h3>
          </div>
          <div className="carousel-track">
            {payload.relatedProducts.map((product) => (
              <ProductMiniCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {Array.isArray(payload.relatedCategories) && payload.relatedCategories.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h3>Related categories</h3>
          </div>
          <div className="chip-row">
            {payload.relatedCategories.map((category) => (
              <span key={category.id} className="search-chip">
                {category.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {Array.isArray(article.faqItems) && article.faqItems.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h3>FAQ</h3>
          </div>
          <div className="faq-stack">
            {article.faqItems.map((item) => (
              <article key={item.question} className="faq-card">
                <strong>{item.question}</strong>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {Array.isArray(payload.relatedBlogs) && payload.relatedBlogs.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h3>Related guides</h3>
          </div>
          <div className="guide-inline-grid">
            {payload.relatedBlogs.map((blog) => (
              <GuideMiniCard key={blog.id} blog={blog} />
            ))}
          </div>
        </section>
      ) : null}

      <WebsiteBuyerLeadSection />
    </main>
  );
}
