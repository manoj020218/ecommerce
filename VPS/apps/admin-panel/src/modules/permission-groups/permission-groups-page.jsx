import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import {
  createPermissionGroup,
  fetchAvailablePermissions,
  fetchPermissionGroups,
  updatePermissionGroup
} from "./permission-groups.api";

const EMPTY_FORM = {
  name: "",
  description: "",
  permissions: []
};

function groupPermissionsByModule(permissions) {
  return permissions.reduce((groups, permission) => {
    const [moduleName] = String(permission || "").split(".");
    const key = moduleName || "other";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(permission);
    return groups;
  }, {});
}

export function PermissionGroupsPage() {
  const { session } = useAuthSession();
  const canManage = hasPermission(session, "staff.edit_permissions");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const permissionSections = useMemo(() => {
    const grouped = groupPermissionsByModule(availablePermissions);
    return Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right));
  }, [availablePermissions]);

  const metrics = useMemo(() => {
    const systemCount = permissionGroups.filter((group) => group.isSystem).length;
    return {
      total: permissionGroups.length,
      systemCount,
      customCount: permissionGroups.length - systemCount,
      availableCount: availablePermissions.length
    };
  }, [availablePermissions.length, permissionGroups]);

  const loadAll = async () => {
    setError("");
    const [groupsData, permissionsData] = await Promise.all([
      fetchPermissionGroups(),
      fetchAvailablePermissions()
    ]);
    setPermissionGroups(Array.isArray(groupsData) ? groupsData : []);
    setAvailablePermissions(
      Array.isArray(permissionsData?.permissions) ? permissionsData.permissions : []
    );
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "Failed to load permission groups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedGroup(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
    setNotice("");
    setError("");
  };

  const openViewModal = (group) => {
    setSelectedGroup(group);
    setForm({
      name: group.name || "",
      description: group.description || "",
      permissions: Array.isArray(group.permissions) ? group.permissions : []
    });
    setModalOpen(true);
    setNotice("");
    setError("");
  };

  const togglePermission = (permission) => {
    setForm((current) => {
      const exists = current.permissions.includes(permission);
      return {
        ...current,
        permissions: exists
          ? current.permissions.filter((item) => item !== permission)
          : [...current.permissions, permission]
      };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (selectedGroup) {
        await updatePermissionGroup(selectedGroup.id, form);
        setNotice(`Permission group updated: ${form.name}`);
      } else {
        await createPermissionGroup(form);
        setNotice(`Permission group created: ${form.name}`);
      }
      await loadAll();
      setModalOpen(false);
      resetForm();
    } catch (requestError) {
      setError(requestError.message || "Failed to save permission group.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading permission groups..." />;
  }

  if (error && permissionGroups.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Permission Groups"
        description="Create reusable permission bundles for staff accounts and audit who can access what."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={bootstrap}>
              Refresh
            </button>
            {canManage ? (
              <button type="button" className="btn btn-primary" onClick={openCreateModal}>
                New Group
              </button>
            ) : null}
          </>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total Groups</p>
          <h3>{formatNumber(metrics.total)}</h3>
          <span>All configured permission bundles</span>
        </article>
        <article className="summary-card">
          <p>System Groups</p>
          <h3>{formatNumber(metrics.systemCount)}</h3>
          <span>Seeded and protected entries</span>
        </article>
        <article className="summary-card">
          <p>Custom Groups</p>
          <h3>{formatNumber(metrics.customCount)}</h3>
          <span>Editable admin-created groups</span>
        </article>
        <article className="summary-card">
          <p>Available Permissions</p>
          <h3>{formatNumber(metrics.availableCount)}</h3>
          <span>Permission keys exposed by backend modules</span>
        </article>
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-card">
        <div className="section-head">
          <div>
            <h3 className="subsection-title">Permission Catalogue</h3>
            <p className="muted">
              Reference list of permission keys grouped by module.
            </p>
          </div>
        </div>
        <div className="summary-grid">
          {permissionSections.map(([moduleName, permissions]) => (
            <article key={moduleName} className="summary-card">
              <p>{moduleName}</p>
              <h3>{formatNumber(permissions.length)}</h3>
              <span>{permissions.join(", ")}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Permissions</th>
              <th>Type</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {permissionGroups.map((group) => (
              <tr key={group.id}>
                <td>
                  <strong>{group.name}</strong>
                  <p className="row-sub">{group.description || "No description"}</p>
                </td>
                <td>
                  <strong>{formatNumber(group.permissions?.length || 0)}</strong>
                  <p className="row-sub">{(group.permissions || []).slice(0, 4).join(", ")}</p>
                </td>
                <td>
                  <StatusBadge value={group.isSystem ? "system" : "custom"} />
                </td>
                <td>{formatDateTime(group.updatedAt || group.createdAt)}</td>
                <td className="row-actions">
                  <button type="button" className="btn-link" onClick={() => openViewModal(group)}>
                    {group.isSystem || !canManage ? "View" : "Open"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {permissionGroups.map((group) => (
          <article key={group.id} className="card">
            <div className="card-head">
              <h4>{group.name}</h4>
              <StatusBadge value={group.isSystem ? "system" : "custom"} />
            </div>
            <p className="muted">{group.description || "No description"}</p>
            <p className="muted">
              Permissions: {formatNumber(group.permissions?.length || 0)}
            </p>
            <div className="card-actions">
              <button type="button" className="btn btn-secondary" onClick={() => openViewModal(group)}>
                {group.isSystem || !canManage ? "View Group" : "Edit Group"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal
        title={
          selectedGroup
            ? `${selectedGroup.isSystem ? "View" : "Edit"} Permission Group`
            : "Create Permission Group"
        }
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        width="960px"
      >
        <form className="stack" onSubmit={onSubmit}>
          <div className="form-grid wide">
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                disabled={Boolean(selectedGroup?.isSystem) || !canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="field field-full">
              <span>Description</span>
              <textarea
                rows="3"
                value={form.description}
                disabled={Boolean(selectedGroup?.isSystem) || !canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <section className="summary-card">
            <div className="section-head">
              <div>
                <h3 className="subsection-title">Permissions</h3>
                <p className="muted">
                  Select the module actions that belong to this group.
                </p>
              </div>
            </div>
            <div className="summary-grid">
              {permissionSections.map(([moduleName, permissions]) => (
                <article key={moduleName} className="summary-card">
                  <p>{moduleName}</p>
                  <h3>{formatNumber(permissions.length)}</h3>
                  <div className="stack">
                    {permissions.map((permission) => (
                      <label key={permission} className="inline-check">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission)}
                          disabled={Boolean(selectedGroup?.isSystem) || !canManage}
                          onChange={() => togglePermission(permission)}
                        />
                        <span>{permission}</span>
                      </label>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {selectedGroup?.isSystem ? (
            <p className="alert-info">
              System permission groups are read-only and cannot be edited.
            </p>
          ) : null}

          {canManage && !selectedGroup?.isSystem ? (
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving
                  ? "Saving..."
                  : selectedGroup
                    ? "Save Group"
                    : "Create Group"}
              </button>
            </div>
          ) : null}
        </form>
      </Modal>
    </section>
  );
}
