import { useEffect, useMemo, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatDateTime, formatNumber } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { fetchPermissionGroups } from "../permission-groups/permission-groups.api";
import {
  createStaffUser,
  fetchStaffUsers,
  updateStaffPassword,
  updateStaffUser
} from "./staff.api";

const EMPTY_STAFF_FORM = {
  name: "",
  email: "",
  mobile: "",
  permissionGroupId: "",
  isActive: true,
  password: ""
};

const EMPTY_PASSWORD_FORM = {
  newPassword: ""
};

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function StaffPage() {
  const { session } = useAuthSession();
  const canCreate = hasPermission(session, "staff.create");
  const canManage = hasPermission(session, "staff.edit_permissions");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [staffUsers, setStaffUsers] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [filters, setFilters] = useState({
    q: "",
    groupId: "",
    state: ""
  });
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);

  const assignableGroups = useMemo(() => {
    return permissionGroups
      .filter((group) => group.id !== "group_super_admin")
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [permissionGroups]);

  const metrics = useMemo(() => {
    const activeCount = staffUsers.filter((user) => user.isActive).length;
    const recentLogins = staffUsers.filter((user) => {
      if (!user.lastLoginAt) {
        return false;
      }

      const loginTime = new Date(user.lastLoginAt).getTime();
      if (Number.isNaN(loginTime)) {
        return false;
      }

      return loginTime >= Date.now() - 1000 * 60 * 60 * 24 * 30;
    }).length;

    return {
      total: staffUsers.length,
      activeCount,
      inactiveCount: staffUsers.length - activeCount,
      groupsInUse: new Set(
        staffUsers.map((user) => user.permissionGroup?.id || user.permissionGroupId).filter(Boolean)
      ).size,
      recentLogins
    };
  }, [staffUsers]);

  const filteredStaffUsers = useMemo(() => {
    const query = normalizeSearch(filters.q);

    return staffUsers.filter((user) => {
      if (filters.groupId) {
        const groupId = user.permissionGroup?.id || user.permissionGroupId || "";
        if (groupId !== filters.groupId) {
          return false;
        }
      }

      if (filters.state === "active" && !user.isActive) {
        return false;
      }

      if (filters.state === "inactive" && user.isActive) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        user.name,
        user.email,
        user.mobile,
        user.permissionGroup?.name,
        user.role
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [filters.groupId, filters.q, filters.state, staffUsers]);

  const loadAll = async () => {
    setError("");
    const [staffData, groupsData] = await Promise.all([
      fetchStaffUsers(),
      fetchPermissionGroups()
    ]);
    setStaffUsers(Array.isArray(staffData) ? staffData : []);
    setPermissionGroups(Array.isArray(groupsData) ? groupsData : []);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");

    try {
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "Failed to load staff workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const resetStaffForm = (groupId = "") => {
    setStaffForm({
      ...EMPTY_STAFF_FORM,
      permissionGroupId: groupId
    });
    setEditingStaff(null);
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    resetStaffForm(assignableGroups[0]?.id || "");
    setSaving(false);
  };

  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setPasswordTarget(null);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordSaving(false);
  };

  const openCreateModal = () => {
    resetStaffForm(assignableGroups[0]?.id || "");
    setStaffModalOpen(true);
    setNotice("");
    setError("");
  };

  const openStaffModal = (staffUser) => {
    setEditingStaff(staffUser);
    setStaffForm({
      name: staffUser.name || "",
      email: staffUser.email || "",
      mobile: staffUser.mobile || "",
      permissionGroupId:
        staffUser.permissionGroup?.id ||
        staffUser.permissionGroupId ||
        assignableGroups[0]?.id ||
        "",
      isActive: Boolean(staffUser.isActive),
      password: ""
    });
    setStaffModalOpen(true);
    setNotice("");
    setError("");
  };

  const openPasswordModal = (staffUser) => {
    setPasswordTarget(staffUser);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordModalOpen(true);
    setNotice("");
    setError("");
  };

  const onSubmitStaff = async (event) => {
    event.preventDefault();
    if (!canManage && editingStaff) {
      return;
    }
    if (!canCreate && !editingStaff) {
      return;
    }

    if (!staffForm.permissionGroupId) {
      setError("Select a permission group before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingStaff) {
        await updateStaffUser(editingStaff.id, {
          name: staffForm.name,
          mobile: staffForm.mobile,
          permissionGroupId: staffForm.permissionGroupId,
          isActive: staffForm.isActive
        });
        setNotice(`Staff account updated: ${staffForm.name}`);
      } else {
        await createStaffUser({
          name: staffForm.name,
          email: staffForm.email,
          mobile: staffForm.mobile,
          password: staffForm.password,
          permissionGroupId: staffForm.permissionGroupId,
          isActive: staffForm.isActive
        });
        setNotice(`Staff account created: ${staffForm.name}`);
      }

      await loadAll();
      closeStaffModal();
    } catch (requestError) {
      setError(requestError.message || "Failed to save staff account.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitPassword = async (event) => {
    event.preventDefault();
    if (!passwordTarget || !canManage) {
      return;
    }

    setPasswordSaving(true);
    setError("");
    setNotice("");

    try {
      await updateStaffPassword(passwordTarget.id, passwordForm.newPassword);
      setNotice(`Password updated for ${passwordTarget.name}`);
      closePasswordModal();
    } catch (requestError) {
      setError(requestError.message || "Failed to update staff password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading staff workspace..." />;
  }

  if (error && staffUsers.length === 0) {
    return <ErrorBlock message={error} onRetry={bootstrap} />;
  }

  return (
    <section className="stack">
      <PageHeader
        title="Staff"
        description="Manage back-office user accounts, group assignments, activation, and password resets."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={bootstrap}>
              Refresh
            </button>
            {canCreate ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreateModal}
                disabled={assignableGroups.length === 0}
              >
                New Staff
              </button>
            ) : null}
          </>
        }
      />

      <div className="summary-grid">
        <article className="summary-card">
          <p>Total Staff</p>
          <h3>{formatNumber(metrics.total)}</h3>
          <span>All staff accounts excluding super admin</span>
        </article>
        <article className="summary-card">
          <p>Active</p>
          <h3>{formatNumber(metrics.activeCount)}</h3>
          <span>Accounts that can sign in right now</span>
        </article>
        <article className="summary-card">
          <p>Groups In Use</p>
          <h3>{formatNumber(metrics.groupsInUse)}</h3>
          <span>Permission bundles assigned to staff accounts</span>
        </article>
        <article className="summary-card">
          <p>Recent Logins</p>
          <h3>{formatNumber(metrics.recentLogins)}</h3>
          <span>Logged in during the last 30 days</span>
        </article>
        <article className="summary-card">
          <p>Inactive</p>
          <h3>{formatNumber(metrics.inactiveCount)}</h3>
          <span>Disabled accounts kept for audit history</span>
        </article>
      </div>

      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          placeholder="Search by name, email, mobile, role, or permission group"
          value={filters.q}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.target.value
            }))
          }
        />
        <select
          value={filters.groupId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              groupId: event.target.value
            }))
          }
        >
          <option value="">All groups</option>
          {assignableGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select
          value={filters.state}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              state: event.target.value
            }))
          }
        >
          <option value="">All states</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </form>

      {assignableGroups.length === 0 ? (
        <p className="alert-info">
          No assignable permission groups are available yet. Create a custom group first.
        </p>
      ) : null}
      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              <th>Staff</th>
              <th>Access</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaffUsers.map((staffUser) => (
              <tr key={staffUser.id}>
                <td>
                  <strong>{staffUser.name}</strong>
                  <p className="row-sub">{staffUser.email}</p>
                  <p className="row-sub">{staffUser.mobile || "No mobile"}</p>
                </td>
                <td>
                  <strong>{staffUser.permissionGroup?.name || "No group"}</strong>
                  <p className="row-sub">{String(staffUser.role || "staff").replace(/_/g, " ")}</p>
                  <p className="row-sub">{staffUser.permissionGroup?.slug || staffUser.permissionGroupId}</p>
                </td>
                <td>
                  <StatusBadge value={staffUser.isActive ? "active" : "inactive"} />
                </td>
                <td>{staffUser.lastLoginAt ? formatDateTime(staffUser.lastLoginAt) : "Never"}</td>
                <td>{formatDateTime(staffUser.updatedAt || staffUser.createdAt)}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => openStaffModal(staffUser)}
                  >
                    {canManage ? "Edit" : "View"}
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openPasswordModal(staffUser)}
                    >
                      Reset Password
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {filteredStaffUsers.map((staffUser) => (
          <article key={staffUser.id} className="card">
            <div className="card-head">
              <h4>{staffUser.name}</h4>
              <StatusBadge value={staffUser.isActive ? "active" : "inactive"} />
            </div>
            <p className="muted">{staffUser.email}</p>
            <p className="muted">{staffUser.mobile || "No mobile"}</p>
            <p className="muted">
              Group: {staffUser.permissionGroup?.name || "No group assigned"}
            </p>
            <p className="muted">
              Last login: {staffUser.lastLoginAt ? formatDateTime(staffUser.lastLoginAt) : "Never"}
            </p>
            <p className="muted">
              Updated: {formatDateTime(staffUser.updatedAt || staffUser.createdAt)}
            </p>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openStaffModal(staffUser)}
              >
                {canManage ? "Edit Staff" : "View Staff"}
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openPasswordModal(staffUser)}
                >
                  Reset Password
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!filteredStaffUsers.length ? (
        <article className="summary-card">
          <p>No staff accounts match the current filters.</p>
        </article>
      ) : null}

      <Modal
        title={
          editingStaff
            ? `${canManage ? "Edit" : "View"} Staff Account`
            : "Create Staff Account"
        }
        open={staffModalOpen}
        onClose={closeStaffModal}
        width="760px"
      >
        <form className="stack" onSubmit={onSubmitStaff}>
          <div className="form-grid wide">
            <label className="field">
              <span>Name</span>
              <input
                value={staffForm.name}
                disabled={editingStaff ? !canManage : !canCreate}
                onChange={(event) =>
                  setStaffForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={staffForm.email}
                disabled={Boolean(editingStaff) || !canCreate}
                onChange={(event) =>
                  setStaffForm((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Mobile</span>
              <input
                value={staffForm.mobile}
                disabled={editingStaff ? !canManage : !canCreate}
                onChange={(event) =>
                  setStaffForm((current) => ({
                    ...current,
                    mobile: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Permission Group</span>
              <select
                value={staffForm.permissionGroupId}
                disabled={editingStaff ? !canManage : !canCreate}
                onChange={(event) =>
                  setStaffForm((current) => ({
                    ...current,
                    permissionGroupId: event.target.value
                  }))
                }
                required
              >
                <option value="">Select group</option>
                {assignableGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {!editingStaff ? (
              <label className="field">
                <span>Temporary Password</span>
                <input
                  type="password"
                  minLength="8"
                  value={staffForm.password}
                  disabled={!canCreate}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      password: event.target.value
                    }))
                  }
                  required
                />
              </label>
            ) : null}
            <div className="field field-full">
              <span>Account Status</span>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={staffForm.isActive}
                  disabled={editingStaff ? !canManage : !canCreate}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      isActive: event.target.checked
                    }))
                  }
                />
                <span>Allow this staff account to sign in</span>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeStaffModal}>
              Close
            </button>
            {(editingStaff ? canManage : canCreate) ? (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving
                  ? "Saving..."
                  : editingStaff
                    ? "Save Staff"
                    : "Create Staff"}
              </button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        title={passwordTarget ? `Reset Password - ${passwordTarget.name}` : "Reset Password"}
        open={passwordModalOpen}
        onClose={closePasswordModal}
        width="560px"
      >
        <form className="stack" onSubmit={onSubmitPassword}>
          <label className="field">
            <span>New Password</span>
            <input
              type="password"
              minLength="8"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm({
                  newPassword: event.target.value
                })
              }
              required
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closePasswordModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
              {passwordSaving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
