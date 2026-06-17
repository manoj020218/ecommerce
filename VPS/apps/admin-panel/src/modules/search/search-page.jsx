import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import {
  formatDateTime,
  formatNumber,
  splitCsvInput,
  toCsvInput
} from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  createBuyerPhraseMapping,
  createProductKeywordMapping,
  createSearchRedirect,
  createSearchSynonym,
  fetchBuyerPhraseMappings,
  fetchProductKeywordMappings,
  fetchSearchLogs,
  fetchSearchOverview,
  fetchSearchRedirects,
  fetchSearchSynonyms,
  fetchZeroResultSearches,
  reindexSearch
} from "./search.api";

const DEFAULT_FILTERS = { q: "", includeInactive: true, limit: 50 };

const EMPTY_FORMS = {
  synonym: { term: "", synonyms: "", language: "mixed" },
  phrase: { phrase: "", productIds: "", weight: "50", notes: "" },
  keyword: { productId: "", keywords: "", useCases: "", problemStatements: "" },
  redirect: { fromQuery: "", toType: "product", toValue: "" }
};

export function SearchPage() {
  const { session } = useAuthSession();
  const canManageSynonyms = hasPermission(session, "search.manage_synonyms");
  const canManagePhrases = hasPermission(session, "search.manage_phrase_mappings");
  const canManageKeywords = hasPermission(session, "search.manage_keywords");
  const canManageRedirects = hasPermission(session, "search.manage_redirects");
  const canViewLogs = hasPermission(session, "search.view_logs");
  const canReindex = hasPermission(session, "search.reindex");

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [overview, setOverview] = useState(null);
  const [synonyms, setSynonyms] = useState([]);
  const [phrases, setPhrases] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [redirects, setRedirects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [zeroResults, setZeroResults] = useState([]);
  const [forms, setForms] = useState(EMPTY_FORMS);

  const loadAll = async (nextFilters = filters) => {
    const [overviewData, synonymsData, phrasesData, keywordsData, redirectsData, logsData, zeroData] =
      await Promise.all([
        fetchSearchOverview(),
        fetchSearchSynonyms(nextFilters),
        fetchBuyerPhraseMappings(nextFilters),
        fetchProductKeywordMappings(nextFilters),
        fetchSearchRedirects(nextFilters),
        canViewLogs ? fetchSearchLogs(nextFilters) : Promise.resolve([]),
        canViewLogs ? fetchZeroResultSearches(nextFilters) : Promise.resolve([])
      ]);

    setOverview(overviewData);
    setSynonyms(Array.isArray(synonymsData) ? synonymsData : []);
    setPhrases(Array.isArray(phrasesData) ? phrasesData : []);
    setKeywords(Array.isArray(keywordsData) ? keywordsData : []);
    setRedirects(Array.isArray(redirectsData) ? redirectsData : []);
    setLogs(Array.isArray(logsData) ? logsData : []);
    setZeroResults(Array.isArray(zeroData) ? zeroData : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      await loadAll(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load search workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const runMutation = async (key, request, message, resetKey = "") => {
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await request();
      await loadAll(filters);
      if (resetKey) {
        setForms((current) => ({ ...current, [resetKey]: EMPTY_FORMS[resetKey] }));
      }
      setNotice(message);
    } catch (apiError) {
      setError(apiError.message || "Search action failed.");
    } finally {
      setBusyKey("");
    }
  };

  const updateForm = (name, key, value) => {
    setForms((current) => ({
      ...current,
      [name]: {
        ...current[name],
        [key]: value
      }
    }));
  };

  if (loading) {
    return <LoadingBlock label="Loading search workspace..." />;
  }

  if (error && !overview) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Search"
        description="Admin workspace for search mappings, redirects, reindex control, and zero-result visibility."
        actions={
          canReindex ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runMutation("reindex", () => reindexSearch(), "Search index refreshed.")}
              disabled={busyKey === "reindex"}
            >
              {busyKey === "reindex" ? "Reindexing..." : "Reindex Search"}
            </button>
          ) : null
        }
      />

      <div className="summary-grid">
        <article className="summary-card"><p>Indexed Products</p><h3>{formatNumber(overview?.productsIndexed || 0)}</h3><span>Active catalogue rows</span></article>
        <article className="summary-card"><p>Synonyms</p><h3>{formatNumber(overview?.synonymsCount || 0)}</h3><span>Configured terms</span></article>
        <article className="summary-card"><p>Buyer Phrases</p><h3>{formatNumber(overview?.buyerPhraseMappingsCount || 0)}</h3><span>Intent mappings</span></article>
        <article className="summary-card"><p>Keyword Maps</p><h3>{formatNumber(overview?.productKeywordMappingsCount || 0)}</h3><span>Per-product mapping rows</span></article>
        <article className="summary-card"><p>Redirects</p><h3>{formatNumber(overview?.redirectsCount || 0)}</h3><span>Query redirects</span></article>
        <article className="summary-card"><p>Search Logs</p><h3>{formatNumber(overview?.searchLogsCount || 0)}</h3><span>Tracked search events</span></article>
      </div>

      {overview?.reindexMeta?.lastReindexedAt ? (
        <section className="summary-card">
          <p className="muted">
            Last reindexed {formatDateTime(overview.reindexMeta.lastReindexedAt)}.
            {overview?.reindexMeta?.note ? ` ${overview.reindexMeta.note}` : ""}
          </p>
        </section>
      ) : null}

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={(event) => { event.preventDefault(); loadAll(filters).catch((apiError) => setError(apiError.message || "Failed to refresh search data.")); }}>
          <label className="field"><span>Search Query</span><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} /></label>
          <label className="field"><span>Limit</span><input type="number" min="1" max="500" value={filters.limit} onChange={(event) => setFilters((current) => ({ ...current, limit: event.target.value }))} /></label>
          <label className="inline-check field-full"><input type="checkbox" checked={Boolean(filters.includeInactive)} onChange={(event) => setFilters((current) => ({ ...current, includeInactive: event.target.checked }))} /><span>Include inactive mappings</span></label>
          <div className="form-actions"><button type="submit" className="btn btn-primary">Refresh Search Data</button></div>
        </form>
      </section>

      <section className="summary-card">
        <div className="section-head"><div><h3 className="subsection-title">Synonyms</h3></div></div>
        {canManageSynonyms ? (
          <form className="form-grid wide" onSubmit={(event) => { event.preventDefault(); runMutation("create-synonym", () => createSearchSynonym({ term: forms.synonym.term, synonyms: splitCsvInput(forms.synonym.synonyms), language: forms.synonym.language, isActive: true }), `Synonym created for "${forms.synonym.term}".`, "synonym"); }}>
            <label className="field"><span>Term</span><input value={forms.synonym.term} onChange={(event) => updateForm("synonym", "term", event.target.value)} /></label>
            <label className="field field-full"><span>Synonyms CSV</span><input value={forms.synonym.synonyms} onChange={(event) => updateForm("synonym", "synonyms", event.target.value)} /></label>
            <label className="field"><span>Language</span><input value={forms.synonym.language} onChange={(event) => updateForm("synonym", "language", event.target.value)} /></label>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busyKey === "create-synonym"}>{busyKey === "create-synonym" ? "Saving..." : "Create Synonym"}</button></div>
          </form>
        ) : null}
        <div className="table-wrap"><table><thead><tr><th>Term</th><th>Synonyms</th><th>Language</th><th>Status</th></tr></thead><tbody>{synonyms.map((row) => <tr key={row.id}><td>{row.term}</td><td>{toCsvInput(row.synonyms)}</td><td>{row.language || "mixed"}</td><td><StatusBadge value={row.isActive ? "active" : "inactive"} /></td></tr>)}</tbody></table></div>
      </section>

      <section className="summary-card">
        <div className="section-head"><div><h3 className="subsection-title">Buyer Phrases</h3></div></div>
        {canManagePhrases ? (
          <form className="form-grid wide" onSubmit={(event) => { event.preventDefault(); runMutation("create-phrase", () => createBuyerPhraseMapping({ phrase: forms.phrase.phrase, productIds: splitCsvInput(forms.phrase.productIds), weight: Number(forms.phrase.weight || 50), notes: forms.phrase.notes, isActive: true }), `Buyer phrase created: ${forms.phrase.phrase}`, "phrase"); }}>
            <label className="field"><span>Phrase</span><input value={forms.phrase.phrase} onChange={(event) => updateForm("phrase", "phrase", event.target.value)} /></label>
            <label className="field field-full"><span>Product IDs CSV</span><input value={forms.phrase.productIds} onChange={(event) => updateForm("phrase", "productIds", event.target.value)} /></label>
            <label className="field"><span>Weight</span><input type="number" min="1" max="100" value={forms.phrase.weight} onChange={(event) => updateForm("phrase", "weight", event.target.value)} /></label>
            <label className="field field-full"><span>Notes</span><textarea rows="2" value={forms.phrase.notes} onChange={(event) => updateForm("phrase", "notes", event.target.value)} /></label>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busyKey === "create-phrase"}>{busyKey === "create-phrase" ? "Saving..." : "Create Buyer Phrase"}</button></div>
          </form>
        ) : null}
        <div className="table-wrap"><table><thead><tr><th>Phrase</th><th>Products</th><th>Weight</th><th>Status</th></tr></thead><tbody>{phrases.map((row) => <tr key={row.id}><td>{row.phrase}</td><td>{toCsvInput(row.productIds)}</td><td>{formatNumber(row.weight || 0)}</td><td><StatusBadge value={row.isActive ? "active" : "inactive"} /></td></tr>)}</tbody></table></div>
      </section>

      <section className="summary-card">
        <div className="section-head"><div><h3 className="subsection-title">Keyword Mappings</h3></div></div>
        {canManageKeywords ? (
          <form className="form-grid wide" onSubmit={(event) => { event.preventDefault(); runMutation("create-keyword", () => createProductKeywordMapping({ productId: forms.keyword.productId, keywords: splitCsvInput(forms.keyword.keywords), useCases: splitCsvInput(forms.keyword.useCases), problemStatements: splitCsvInput(forms.keyword.problemStatements), isActive: true }), `Keyword mapping created for ${forms.keyword.productId}`, "keyword"); }}>
            <label className="field"><span>Product ID</span><input value={forms.keyword.productId} onChange={(event) => updateForm("keyword", "productId", event.target.value)} /></label>
            <label className="field field-full"><span>Keywords CSV</span><input value={forms.keyword.keywords} onChange={(event) => updateForm("keyword", "keywords", event.target.value)} /></label>
            <label className="field field-full"><span>Use Cases CSV</span><input value={forms.keyword.useCases} onChange={(event) => updateForm("keyword", "useCases", event.target.value)} /></label>
            <label className="field field-full"><span>Problem Statements CSV</span><input value={forms.keyword.problemStatements} onChange={(event) => updateForm("keyword", "problemStatements", event.target.value)} /></label>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busyKey === "create-keyword"}>{busyKey === "create-keyword" ? "Saving..." : "Create Keyword Mapping"}</button></div>
          </form>
        ) : null}
        <div className="table-wrap"><table><thead><tr><th>Product</th><th>Keywords</th><th>Use Cases</th><th>Problems</th></tr></thead><tbody>{keywords.map((row) => <tr key={row.id}><td>{row.productId}</td><td>{toCsvInput(row.keywords)}</td><td>{toCsvInput(row.useCases)}</td><td>{toCsvInput(row.problemStatements)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="summary-card">
        <div className="section-head"><div><h3 className="subsection-title">Redirects</h3></div></div>
        {canManageRedirects ? (
          <form className="form-grid wide" onSubmit={(event) => { event.preventDefault(); runMutation("create-redirect", () => createSearchRedirect({ fromQuery: forms.redirect.fromQuery, toType: forms.redirect.toType, toValue: forms.redirect.toValue, isActive: true }), `Redirect created for "${forms.redirect.fromQuery}".`, "redirect"); }}>
            <label className="field"><span>From Query</span><input value={forms.redirect.fromQuery} onChange={(event) => updateForm("redirect", "fromQuery", event.target.value)} /></label>
            <label className="field"><span>Target Type</span><select value={forms.redirect.toType} onChange={(event) => updateForm("redirect", "toType", event.target.value)}><option value="product">Product</option><option value="category">Category</option><option value="url">URL</option></select></label>
            <label className="field field-full"><span>Target Value</span><input value={forms.redirect.toValue} onChange={(event) => updateForm("redirect", "toValue", event.target.value)} /></label>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busyKey === "create-redirect"}>{busyKey === "create-redirect" ? "Saving..." : "Create Redirect"}</button></div>
          </form>
        ) : null}
        <div className="table-wrap"><table><thead><tr><th>From Query</th><th>Target Type</th><th>Target Value</th><th>Status</th></tr></thead><tbody>{redirects.map((row) => <tr key={row.id}><td>{row.fromQuery}</td><td>{row.toType}</td><td>{row.toValue}</td><td><StatusBadge value={row.isActive ? "active" : "inactive"} /></td></tr>)}</tbody></table></div>
      </section>

      {canViewLogs ? (
        <>
          <section className="summary-card">
            <div className="section-head"><div><h3 className="subsection-title">Zero Result Searches</h3></div></div>
            <div className="table-wrap"><table><thead><tr><th>Query</th><th>Count</th><th>Last Searched</th></tr></thead><tbody>{zeroResults.map((row) => <tr key={row.normalizedQuery}><td>{row.query}</td><td>{formatNumber(row.count || 0)}</td><td>{formatDateTime(row.lastSearchedAt)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="summary-card">
            <div className="section-head"><div><h3 className="subsection-title">Search Logs</h3></div></div>
            <div className="table-wrap"><table><thead><tr><th>Query</th><th>Results</th><th>Top Results</th><th>Created</th></tr></thead><tbody>{logs.map((row) => <tr key={row.id}><td><strong>{row.query}</strong><p className="row-sub">{row.normalizedQuery}</p></td><td>{formatNumber(row.resultCount || 0)}</td><td>{toCsvInput(row.topResultIds)}</td><td>{formatDateTime(row.createdAt)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      ) : null}
    </section>
  );
}
