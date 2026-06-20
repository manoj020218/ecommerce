import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import {
  StorefrontBadge,
  StorefrontButton,
  StorefrontCard,
  StorefrontChip,
  StorefrontErrorState,
  StorefrontLoadingState,
  StorefrontPageHeader,
  StorefrontSectionHeader
} from "../../shared/storefront/storefront-ui";
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
    <StorefrontCard as={Link} to={`/products/${product.slug}`} className="mini-card" elevated>
      <div className="mini-media">
        {imageUrl ? <img src={imageUrl} alt={product.title} loading="lazy" /> : <span>No image</span>}
      </div>
      <div className="mini-body">
        <p>{product.title}</p>
        <strong>{product.brand || "Jenix Product"}</strong>
      </div>
    </StorefrontCard>
  );
}

function GuideMiniCard({ blog }) {
  return (
    <StorefrontCard as={Link} to={`/guides/${blog.slug}`} className="guide-inline-card" elevated>
      <StorefrontBadge className="eyebrow-chip">{blog.category?.name || "Guide"}</StorefrontBadge>
      <strong>{blog.title}</strong>
      <p>{blog.excerpt}</p>
    </StorefrontCard>
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

  const articleMeta = [
    formatDate(article?.publishedAt),
    article?.readingTimeMinutes ? `${article.readingTimeMinutes} min read` : null,
    article?.author || null
  ].filter(Boolean);

  if (loading) {
    return (
      <main className="proto-main-shell">
        <StorefrontLoadingState label="Loading guide..." />
      </main>
    );
  }

  if (error || !article) {
    return (
      <main className="proto-main-shell">
        <StorefrontErrorState
          message={error || "Guide not found."}
          action={<StorefrontButton to="/guides" variant="light">Back to guides</StorefrontButton>}
        />
      </main>
    );
  }

  return (
    <main className="proto-main-shell guide-shell">
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

      <div className="proto-page-hero">
        <StorefrontPageHeader
          eyebrow={article.category?.name || "Guide"}
          title={article.title}
          description={article.excerpt}
          meta={
            <>
              <p className="guide-meta-text">{articleMeta.join(" | ")}</p>
              <div className="chip-row">
                {(Array.isArray(article.tags) ? article.tags : []).map((tag) => (
                  <StorefrontBadge key={tag} className="search-chip">
                    {tag}
                  </StorefrontBadge>
                ))}
              </div>
            </>
          }
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
      </div>

      <StorefrontCard as="section" className="guide-content-card" elevated>
        {contentBlocks.map((block, index) => (
          <p key={`${index}-${block.slice(0, 24)}`}>{block}</p>
        ))}
      </StorefrontCard>

      <StorefrontCard as="section" className="section-card" elevated>
        <StorefrontSectionHeader
          title="Need help choosing the right product?"
          description="Reach the store team directly or continue shopping from the approved storefront flow."
        />
        <div className="cta-grid">
          {payload.cta?.whatsappUrl ? (
            <StorefrontButton href={payload.cta.whatsappUrl} variant="whatsapp">
              WhatsApp Jenix
            </StorefrontButton>
          ) : null}
          <StorefrontButton to="/products" variant="light">
            Browse Products
          </StorefrontButton>
        </div>
      </StorefrontCard>

      {Array.isArray(payload.relatedProducts) && payload.relatedProducts.length > 0 ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Related products"
            description="Products referenced by this guide or commonly bought for the same use case."
          />
          <div className="carousel-track">
            {payload.relatedProducts.map((product) => (
              <ProductMiniCard key={product.id} product={product} />
            ))}
          </div>
        </StorefrontCard>
      ) : null}

      {Array.isArray(payload.relatedCategories) && payload.relatedCategories.length > 0 ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Related categories"
            description="Jump straight into the category pages connected to this guide."
          />
          <div className="chip-row">
            {payload.relatedCategories.map((category) => (
              <StorefrontChip
                key={category.id}
                as={category.slug ? undefined : "span"}
                to={category.slug ? `/categories/${category.slug}` : undefined}
                className="search-chip"
              >
                {category.name}
              </StorefrontChip>
            ))}
          </div>
        </StorefrontCard>
      ) : null}

      {Array.isArray(article.faqItems) && article.faqItems.length > 0 ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="FAQ"
            description="Quick answers pulled from the same published guide content."
          />
          <div className="faq-stack">
            {article.faqItems.map((item) => (
              <StorefrontCard key={item.question} as="article" className="faq-card" elevated>
                <strong>{item.question}</strong>
                <p>{item.answer}</p>
              </StorefrontCard>
            ))}
          </div>
        </StorefrontCard>
      ) : null}

      {Array.isArray(payload.relatedBlogs) && payload.relatedBlogs.length > 0 ? (
        <StorefrontCard as="section" className="section-card" elevated>
          <StorefrontSectionHeader
            title="Related guides"
            description="Keep exploring setup notes, buying advice, and troubleshooting articles."
          />
          <div className="guide-inline-grid">
            {payload.relatedBlogs.map((blog) => (
              <GuideMiniCard key={blog.id} blog={blog} />
            ))}
          </div>
        </StorefrontCard>
      ) : null}

      <WebsiteBuyerLeadSection />
    </main>
  );
}
