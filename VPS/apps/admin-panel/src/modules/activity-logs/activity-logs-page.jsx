import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { EmptyBlock } from "../../shared/components/empty-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { PageHeader } from "../../shared/components/page-header";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import { fetchActivityLogs } from "./activity-logs.api";

const DEFAULT_FILTERS = {
  actorId: "",
  action: "",
  resourceType: "",
  limit: 50
};

export function ActivityLogsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [logs, setLogs] = useState([]);

  const loadLogs = async (nextFilters = filters) => {
    setError("");
    const data = await fetchActivityLogs(nextFilters);
    setLogs(Array.isArray(data) ? data : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadLogs(DEFAULT_FILTERS);
    } catch (apiError) {
      setError(apiError.message || "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const metrics = useMemo(() => {
    const uniqueActors = new Set(logs.map((row) => row.actorId).filter(Boolean)).size;
    const uniqueActions = new Set(logs.map((row) => row.action).filter(Boolean)).size;

    return {
      total: logs.length,
      uniqueActors,
      uniqueActions
    };
  }, [logs]);

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      await loadLogs(filters);
    } catch (apiError) {
      setError(apiError.message || "Failed to filter activity logs.");
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading audit trail..." />;
  }

  if (error && logs.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Audit Logs"
        description="Operational audit trail for admin actions recorded across the platform."
        actions={
          <button type="button" className="btn btn-secondary" onClick={bootstrap}>
            Refresh
          </button>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Visible Events</p>
          <h3>{formatNumber(metrics.total)}</h3>
          <span>Filtered event rows</span>
        </article>
        <article className="summary-card">
          <p>Actors</p>
          <h3>{formatNumber(metrics.uniqueActors)}</h3>
          <span>Unique staff/system actors</span>
        </article>
        <article className="summary-card">
          <p>Actions</p>
          <h3>{formatNumber(metrics.uniqueActions)}</h3>
          <span>Unique action names</span>
        </article>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <form className="form-grid wide" onSubmit={onSubmit}>
          <label className="field">
            <span>Actor ID</span>
            <input
              value={filters.actorId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  actorId: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Action</span>
            <input
              value={filters.action}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  action: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Resource Type</span>
            <input
              value={filters.resourceType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  resourceType: event.target.value
                }))
              }
            />
          </label>
          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min="1"
              max="200"
              value={filters.limit}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  limit: event.target.value
                }))
              }
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Apply Filters
            </button>
          </div>
        </form>
      </section>

      {logs.length === 0 ? (
        <EmptyBlock
          title="No audit log entries matched the selected filters."
          description="Broaden the filters or refresh after performing admin actions."
        />
      ) : null}

      {logs.length > 0 ? (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Resource</th>
                  <th>Metadata</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.action}</strong>
                      <p className="row-sub">{log.id}</p>
                    </td>
                    <td>
                      <strong>{log.actorId || "system"}</strong>
                      <p className="row-sub">{log.actorRole || "system"}</p>
                    </td>
                    <td>
                      <strong>{log.resourceType || "system"}</strong>
                      <p className="row-sub">{log.resourceId || "n/a"}</p>
                    </td>
                    <td>{JSON.stringify(log.metadata || {})}</td>
                    <td>{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {logs.map((log) => (
              <article key={log.id} className="card">
                <div className="card-head">
                  <h4>{log.action}</h4>
                  <strong>{log.actorId || "system"}</strong>
                </div>
                <p className="muted">{log.resourceType || "system"} / {log.resourceId || "n/a"}</p>
                <p className="muted">{JSON.stringify(log.metadata || {})}</p>
                <p className="muted">{formatDateTime(log.createdAt)}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
