import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { API_BASE_URL } from "../../shared/api/http-client";
import { fetchProducts, generateProductContentDraft, updateProduct } from "./products.api";

const BACKEND_BASE = API_BASE_URL.replace(/\/api$/, "");
const PAGE_SIZE = 20;

function resolveImageUrl(image) {
  if (!image) return null;
  const src = typeof image === "string" ? image : (image.thumbnail || image.url || "");
  if (!src) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/static")) return `${BACKEND_BASE}${src}`;
  return `${BACKEND_BASE}/static/migration/${src}`;
}

function isEmptyArray(value) {
  return !Array.isArray(value) || value.length === 0;
}

function isMissingKeyFeatures(product) {
  return isEmptyArray(product.keyFeatures);
}

function isMissingSpecifications(product) {
  return !product.specifications || Object.keys(product.specifications).length === 0;
}

function isMissingSearchTags(product) {
  return isEmptyArray(product.technicalKeywords) || isEmptyArray(product.customerKeywords);
}

function isMissingApplications(product) {
  return isEmptyArray(product.useCases) || isEmptyArray(product.problemStatements);
}

function isMissingSeoMeta(product) {
  return !String(product.metaTitle || "").trim() || !String(product.metaDescription || "").trim();
}

function hasAnyGap(product) {
  return (
    isMissingKeyFeatures(product) ||
    isMissingSpecifications(product) ||
    isMissingSearchTags(product) ||
    isMissingApplications(product) ||
    isMissingSeoMeta(product)
  );
}

function specsObjectToPairs(specs) {
  return Object.entries(specs || {}).map(([key, value]) => ({ key, value: String(value) }));
}

function pairsToSpecsObject(pairs) {
  const result = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    const value = pair.value.trim();
    if (key && value) result[key] = value;
  }
  return result;
}

function toCsv(values) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function fromCsv(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProductContentAssistantPage() {
  const { session } = useAuthSession();
  const canEdit = hasPermission(session, "products.edit");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [activeProduct, setActiveProduct] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftWarnings, setDraftWarnings] = useState([]);
  const [draftFeatures, setDraftFeatures] = useState([]);
  const [draftSpecs, setDraftSpecs] = useState([]);
  const [draftTechnicalKeywords, setDraftTechnicalKeywords] = useState("");
  const [draftCustomerKeywords, setDraftCustomerKeywords] = useState("");
  const [draftUseCases, setDraftUseCases] = useState("");
  const [draftProblemStatements, setDraftProblemStatements] = useState("");
  const [draftMetaTitle, setDraftMetaTitle] = useState("");
  const [draftMetaDescription, setDraftMetaDescription] = useState("");

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchProducts({ includeInactive: false });
      setProducts(Array.isArray(data) ? data : []);
    } catch (apiError) {
      setError(apiError.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const missingList = useMemo(() => {
    const needsWork = products.filter(hasAnyGap);
    const q = search.trim().toLowerCase();
    const filtered = q ? needsWork.filter((p) => p.title.toLowerCase().includes(q)) : needsWork;
    return filtered.sort((a, b) => a.title.localeCompare(b.title));
  }, [products, search]);

  const visibleList = missingList.slice(0, visibleCount);
  const missingFeaturesCount = products.filter(isMissingKeyFeatures).length;
  const missingSpecsCount = products.filter(isMissingSpecifications).length;
  const missingSearchTagsCount = products.filter(isMissingSearchTags).length;
  const missingSeoMetaCount = products.filter(isMissingSeoMeta).length;

  const loadDraftFromProduct = (product) => {
    setDraftFeatures(Array.isArray(product.keyFeatures) ? [...product.keyFeatures] : []);
    setDraftSpecs(specsObjectToPairs(product.specifications));
    setDraftTechnicalKeywords(toCsv(product.technicalKeywords));
    setDraftCustomerKeywords(toCsv(product.customerKeywords));
    setDraftUseCases(toCsv(product.useCases));
    setDraftProblemStatements(toCsv(product.problemStatements));
    setDraftMetaTitle(product.metaTitle || "");
    setDraftMetaDescription(product.metaDescription || "");
  };

  const openGenerate = async (product) => {
    setActiveProduct(product);
    setModalOpen(true);
    setDraftError("");
    setDraftWarnings([]);
    loadDraftFromProduct(product);
    await runGenerate(product);
  };

  const runGenerate = async (product) => {
    setGenerating(true);
    setDraftError("");
    try {
      const draft = await generateProductContentDraft(product.id);
      if (draft.keyFeatures.length) setDraftFeatures(draft.keyFeatures);
      if (Object.keys(draft.specifications).length) setDraftSpecs(specsObjectToPairs(draft.specifications));
      if (draft.technicalKeywords.length) setDraftTechnicalKeywords(toCsv(draft.technicalKeywords));
      if (draft.customerKeywords.length) setDraftCustomerKeywords(toCsv(draft.customerKeywords));
      if (draft.useCases.length) setDraftUseCases(toCsv(draft.useCases));
      if (draft.problemStatements.length) setDraftProblemStatements(toCsv(draft.problemStatements));
      if (draft.metaTitle) setDraftMetaTitle(draft.metaTitle);
      if (draft.metaDescription) setDraftMetaDescription(draft.metaDescription);
      setDraftWarnings(draft.warnings || []);
    } catch (apiError) {
      setDraftError(apiError.message || "Failed to generate draft.");
    } finally {
      setGenerating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveProduct(null);
    setDraftFeatures([]);
    setDraftSpecs([]);
    setDraftWarnings([]);
    setDraftError("");
    setDraftTechnicalKeywords("");
    setDraftCustomerKeywords("");
    setDraftUseCases("");
    setDraftProblemStatements("");
    setDraftMetaTitle("");
    setDraftMetaDescription("");
  };

  const onSaveDraft = async () => {
    if (!activeProduct) return;
    setSaving(true);
    setDraftError("");
    try {
      const patch = {
        keyFeatures: draftFeatures.map((f) => f.trim()).filter(Boolean),
        specifications: pairsToSpecsObject(draftSpecs),
        technicalKeywords: fromCsv(draftTechnicalKeywords),
        customerKeywords: fromCsv(draftCustomerKeywords),
        useCases: fromCsv(draftUseCases),
        problemStatements: fromCsv(draftProblemStatements),
        metaTitle: draftMetaTitle.trim(),
        metaDescription: draftMetaDescription.trim()
      };
      await updateProduct(activeProduct.id, patch);
      setProducts((current) =>
        current.map((p) => (p.id === activeProduct.id ? { ...p, ...patch } : p))
      );
      setNotice(`Saved content for "${activeProduct.title}".`);
      closeModal();
    } catch (apiError) {
      setDraftError(apiError.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading catalogue content gaps..." />;
  }

  if (error && products.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Content Assistant"
        description="AI-drafted Key Features, Specifications, search tags, SEO meta, and applications for products missing them — every draft is reviewed and saved one product at a time, nothing is applied automatically."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="summary-grid">
        <article className="summary-card">
          <p>Missing Key Features</p>
          <h3>{missingFeaturesCount}</h3>
          <span>of {products.length} active products</span>
        </article>
        <article className="summary-card">
          <p>Missing Specifications</p>
          <h3>{missingSpecsCount}</h3>
          <span>of {products.length} active products</span>
        </article>
        <article className="summary-card">
          <p>Missing Search Tags</p>
          <h3>{missingSearchTagsCount}</h3>
          <span>of {products.length} active products</span>
        </article>
        <article className="summary-card">
          <p>Missing SEO Meta</p>
          <h3>{missingSeoMetaCount}</h3>
          <span>of {products.length} active products</span>
        </article>
      </div>

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Products Needing Content</h3>
          </div>
          <label className="field">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search by title..."
            />
          </label>
        </div>

        {missingList.length === 0 ? (
          <EmptyBlock
            title="Nothing missing."
            description="Every active product has Key Features, Specifications, search tags, SEO meta, and applications filled in."
          />
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Product</th>
                    <th>Missing</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleList.map((product) => (
                    <tr key={product.id}>
                      <td>
                        {resolveImageUrl(product.images?.[0]) ? (
                          <img
                            src={resolveImageUrl(product.images[0])}
                            alt=""
                            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }}
                          />
                        ) : null}
                      </td>
                      <td>{product.title}</td>
                      <td>
                        {isMissingKeyFeatures(product) ? (
                          <span className="status-pill amber">Key Features</span>
                        ) : null}{" "}
                        {isMissingSpecifications(product) ? (
                          <span className="status-pill amber">Specifications</span>
                        ) : null}{" "}
                        {isMissingSearchTags(product) ? (
                          <span className="status-pill amber">Search Tags</span>
                        ) : null}{" "}
                        {isMissingApplications(product) ? (
                          <span className="status-pill amber">Applications</span>
                        ) : null}{" "}
                        {isMissingSeoMeta(product) ? (
                          <span className="status-pill amber">SEO Meta</span>
                        ) : null}
                      </td>
                      <td className="row-actions">
                        {canEdit ? (
                          <button type="button" className="btn-link" onClick={() => openGenerate(product)}>
                            Generate Draft
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {visibleList.map((product) => (
                <article key={product.id} className="card">
                  <div className="card-head">
                    <h4>{product.title}</h4>
                  </div>
                  <p className="muted">
                    {[
                      isMissingKeyFeatures(product) && "Key Features",
                      isMissingSpecifications(product) && "Specifications",
                      isMissingSearchTags(product) && "Search Tags",
                      isMissingApplications(product) && "Applications",
                      isMissingSeoMeta(product) && "SEO Meta"
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {canEdit ? (
                    <div className="card-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => openGenerate(product)}>
                        Generate Draft
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            {visibleCount < missingList.length ? (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                >
                  Show More ({missingList.length - visibleCount} remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Modal title={activeProduct?.title || "Content Draft"} open={modalOpen} onClose={closeModal} width="640px">
        {activeProduct ? (
          <section className="stack">
            <p className="alert-info">
              AI-generated draft — review for accuracy before saving, especially technical or
              electrical specifications the model may not have had source data for.
            </p>

            {draftError ? <p className="form-error">{draftError}</p> : null}

            {generating ? (
              <LoadingBlock label="Generating draft..." />
            ) : (
              <>
                {draftWarnings.length > 0 ? (
                  <div className="field">
                    <span>AI notes</span>
                    <ul>
                      {draftWarnings.map((w, i) => (
                        <li key={i} className="muted">{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="field">
                  <span>Key Features</span>
                  <div className="stack">
                    {draftFeatures.map((feature, index) => (
                      <div key={index} style={{ display: "flex", gap: 8 }}>
                        <input
                          value={feature}
                          onChange={(event) =>
                            setDraftFeatures((current) =>
                              current.map((f, i) => (i === index ? event.target.value : f))
                            )
                          }
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setDraftFeatures((current) => current.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setDraftFeatures((current) => [...current, ""])}
                    >
                      + Add Feature
                    </button>
                  </div>
                </div>

                <div className="field">
                  <span>Specifications</span>
                  <div className="stack">
                    {draftSpecs.map((pair, index) => (
                      <div key={index} style={{ display: "flex", gap: 8 }}>
                        <input
                          value={pair.key}
                          placeholder="Spec name"
                          onChange={(event) =>
                            setDraftSpecs((current) =>
                              current.map((p, i) => (i === index ? { ...p, key: event.target.value } : p))
                            )
                          }
                          style={{ flex: 1 }}
                        />
                        <input
                          value={pair.value}
                          placeholder="Value"
                          onChange={(event) =>
                            setDraftSpecs((current) =>
                              current.map((p, i) => (i === index ? { ...p, value: event.target.value } : p))
                            )
                          }
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setDraftSpecs((current) => current.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setDraftSpecs((current) => [...current, { key: "", value: "" }])}
                    >
                      + Add Spec
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span>Technical Keywords (search tags, comma separated)</span>
                  <input
                    value={draftTechnicalKeywords}
                    onChange={(event) => setDraftTechnicalKeywords(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Customer Keywords (search tags, comma separated)</span>
                  <input
                    value={draftCustomerKeywords}
                    onChange={(event) => setDraftCustomerKeywords(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Use Cases / Applications (comma separated)</span>
                  <input value={draftUseCases} onChange={(event) => setDraftUseCases(event.target.value)} />
                </label>

                <label className="field">
                  <span>Problem Statements (comma separated)</span>
                  <input
                    value={draftProblemStatements}
                    onChange={(event) => setDraftProblemStatements(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>SEO Meta Title</span>
                  <input value={draftMetaTitle} onChange={(event) => setDraftMetaTitle(event.target.value)} />
                </label>

                <label className="field">
                  <span>SEO Meta Description</span>
                  <textarea
                    rows={3}
                    value={draftMetaDescription}
                    onChange={(event) => setDraftMetaDescription(event.target.value)}
                  />
                </label>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => runGenerate(activeProduct)}>
                    Regenerate
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  {canEdit ? (
                    <button type="button" className="btn btn-primary" onClick={onSaveDraft} disabled={saving}>
                      {saving ? "Saving..." : "Save to Product"}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        ) : null}
      </Modal>
    </section>
  );
}
