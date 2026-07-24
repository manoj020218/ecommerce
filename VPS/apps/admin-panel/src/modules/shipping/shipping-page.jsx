import { useEffect, useState } from "react";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { PageHeader } from "../../shared/components/page-header";
import { StatusBadge } from "../../shared/components/status-badge";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import { hasPermission } from "../../shared/utils/permissions";
import { useAuthSession } from "../auth/use-auth-session";
import { ShippingClassesTab } from "./shipping-classes-tab";
import {
  createCourier,
  createRateCard,
  createShipment,
  fetchCouriers,
  fetchRateCards,
  fetchShippingQueue,
  fetchShippingSettings,
  updateCourier,
  updateRateCard,
  updateShipmentStatus,
  updateShipmentTracking,
  updateShippingSettings
} from "./shipping.api";

const SHIPPING_METHODS = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "local_pickup", label: "Local Pickup" },
  { value: "self_pickup", label: "Self Pickup" },
  { value: "transport", label: "Transport" },
  { value: "manual_delivery", label: "Manual Delivery" }
];

const SHIPPING_ZONES = [
  { value: "local", label: "Local" },
  { value: "state", label: "State" },
  { value: "north_india", label: "North India" },
  { value: "west_india", label: "West India" },
  { value: "south_india", label: "South India" },
  { value: "north_east_remote", label: "North East / Remote" },
  { value: "all_india", label: "All India" }
];

const SHIPMENT_STATUSES = [
  { value: "pending_packing", label: "Pending Packing" },
  { value: "packed", label: "Packed" },
  { value: "ready_to_dispatch", label: "Ready to Dispatch" },
  { value: "shipped", label: "Shipped" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "delivery_failed", label: "Delivery Failed" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "ready_for_pickup", label: "Ready for Pickup" },
  { value: "picked_up", label: "Picked Up" }
];

const TABS = ["queue", "shipments", "rate-cards", "classes", "settings"];
const TAB_LABELS = {
  queue: "Queue",
  shipments: "Shipments",
  "rate-cards": "Rate Cards",
  classes: "Shipping Classes",
  settings: "Settings"
};

// ─── Queue Tab ────────────────────────────────────────────────────────────────

function QueueTab({ canCreate, couriers }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [shipForm, setShipForm] = useState({
    courierProfileId: "",
    packageCount: 1,
    adminNotes: ""
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchShippingQueue({ limit: 100 });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load shipping queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onOpenCreate = (order) => {
    setSelectedOrder(order);
    setShipForm({ courierProfileId: "", packageCount: 1, adminNotes: "" });
    setCreateModal(true);
  };

  const onSubmitCreate = async (event) => {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await createShipment({
        orderId: selectedOrder.id,
        courierProfileId: shipForm.courierProfileId || null,
        packageCount: Number(shipForm.packageCount) || 1,
        adminNotes: shipForm.adminNotes
      });
      setCreateModal(false);
      setNotice(`Shipment created for order ${selectedOrder.orderNo}.`);
      await load();
    } catch (err) {
      setError(err.message || "Failed to create shipment.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading shipping queue..." />;
  }

  return (
    <div className="stack">
      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="state-panel">
          <p>No orders are currently awaiting shipment.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Shipping Method</th>
                  <th>Placed</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.orderNo}</strong>
                    </td>
                    <td>{row.customerName || row.billingName || "—"}</td>
                    <td>{row.itemCount ?? row.lineItemCount ?? "—"}</td>
                    <td>{formatCurrencyInr(row.grandTotal ?? row.total)}</td>
                    <td>{row.shippingMethod || "—"}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      {canCreate ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => onOpenCreate(row)}
                        >
                          Create Shipment
                        </button>
                      ) : (
                        <span className="muted">No permission</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {rows.map((row) => (
              <article key={row.id} className="card">
                <div className="card-head">
                  <h4>{row.orderNo}</h4>
                  <StatusBadge value={row.status || "pending"} />
                </div>
                <p className="muted">{row.customerName || row.billingName || "—"}</p>
                <p className="muted">
                  Items: {row.itemCount ?? row.lineItemCount ?? "—"} &nbsp;|&nbsp; Total:{" "}
                  {formatCurrencyInr(row.grandTotal ?? row.total)}
                </p>
                <p className="muted">Method: {row.shippingMethod || "—"}</p>
                <div className="card-actions">
                  {canCreate ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => onOpenCreate(row)}
                    >
                      Create Shipment
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal
        title={`Create Shipment${selectedOrder ? ` — ${selectedOrder.orderNo}` : ""}`}
        open={createModal}
        onClose={() => setCreateModal(false)}
      >
        <form className="form-grid" onSubmit={onSubmitCreate}>
          <label className="field field-full">
            <span>Courier (optional)</span>
            <select
              value={shipForm.courierProfileId}
              onChange={(event) =>
                setShipForm((prev) => ({ ...prev, courierProfileId: event.target.value }))
              }
            >
              <option value="">— Unassigned —</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courierName} ({c.courierCode})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Package Count</span>
            <input
              type="number"
              min="1"
              max="500"
              value={shipForm.packageCount}
              onChange={(event) =>
                setShipForm((prev) => ({ ...prev, packageCount: event.target.value }))
              }
            />
          </label>

          <label className="field field-full">
            <span>Admin Notes</span>
            <textarea
              rows="3"
              value={shipForm.adminNotes}
              onChange={(event) =>
                setShipForm((prev) => ({ ...prev, adminNotes: event.target.value }))
              }
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Creating..." : "Create Shipment"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Shipments Tab ────────────────────────────────────────────────────────────

function ShipmentsTab({ canUpdateTracking, canMarkDelivered, couriers }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [trackingModal, setTrackingModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [trackingForm, setTrackingForm] = useState({
    courierProfileId: "",
    trackingId: "",
    dispatchDate: "",
    expectedDeliveryDate: ""
  });
  const [statusForm, setStatusForm] = useState({
    shipmentStatus: "packed",
    adminNotes: ""
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch shipments that have been created (all statuses)
      const data = await fetchShippingQueue({ limit: 200 });
      // The queue returns all orders with shipments attached — filter those with a shipmentId
      const shipments = Array.isArray(data)
        ? data.filter((row) => row.shipmentId || row.shipmentStatus)
        : [];
      setRows(shipments);
    } catch (err) {
      setError(err.message || "Failed to load shipments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onOpenTracking = (row) => {
    setSelectedShipment(row);
    setTrackingForm({
      courierProfileId: row.courierProfileId || "",
      trackingId: row.trackingId || "",
      dispatchDate: row.dispatchDate ? row.dispatchDate.slice(0, 10) : "",
      expectedDeliveryDate: row.expectedDeliveryDate
        ? row.expectedDeliveryDate.slice(0, 10)
        : ""
    });
    setTrackingModal(true);
  };

  const onOpenStatus = (row) => {
    setSelectedShipment(row);
    setStatusForm({
      shipmentStatus: row.shipmentStatus || "packed",
      adminNotes: row.adminNotes || ""
    });
    setStatusModal(true);
  };

  const onSubmitTracking = async (event) => {
    event.preventDefault();
    if (!selectedShipment) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const id = selectedShipment.shipmentId || selectedShipment.id;
      await updateShipmentTracking(id, {
        courierProfileId: trackingForm.courierProfileId,
        trackingId: trackingForm.trackingId,
        dispatchDate: trackingForm.dispatchDate,
        expectedDeliveryDate: trackingForm.expectedDeliveryDate
      });
      setTrackingModal(false);
      setNotice(`Tracking updated for shipment ${selectedShipment.orderNo}.`);
      await load();
    } catch (err) {
      setError(err.message || "Failed to update tracking.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitStatus = async (event) => {
    event.preventDefault();
    if (!selectedShipment) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const id = selectedShipment.shipmentId || selectedShipment.id;
      await updateShipmentStatus(id, {
        shipmentStatus: statusForm.shipmentStatus,
        adminNotes: statusForm.adminNotes
      });
      setStatusModal(false);
      setNotice(`Status updated for shipment ${selectedShipment.orderNo}.`);
      await load();
    } catch (err) {
      setError(err.message || "Failed to update status.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading shipments..." />;
  }

  return (
    <div className="stack">
      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="state-panel">
          <p>No shipments found. Create shipments from the Queue tab.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Tracking ID</th>
                  <th>Courier</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                  <th>Expected Delivery</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.shipmentId || row.id}>
                    <td>
                      <strong>{row.orderNo}</strong>
                    </td>
                    <td>{row.trackingId || <span className="muted">Not set</span>}</td>
                    <td>{row.courierName || <span className="muted">Unassigned</span>}</td>
                    <td>
                      <StatusBadge value={row.shipmentStatus || "pending_packing"} />
                    </td>
                    <td>{row.dispatchDate ? formatDateTime(row.dispatchDate) : "—"}</td>
                    <td>
                      {row.expectedDeliveryDate
                        ? formatDateTime(row.expectedDeliveryDate)
                        : "—"}
                    </td>
                    <td>
                      <span className="row-actions">
                        {canUpdateTracking ? (
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => onOpenTracking(row)}
                          >
                            Update Tracking
                          </button>
                        ) : null}
                        {canMarkDelivered ? (
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => onOpenStatus(row)}
                          >
                            Update Status
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {rows.map((row) => (
              <article key={row.shipmentId || row.id} className="card">
                <div className="card-head">
                  <h4>{row.orderNo}</h4>
                  <StatusBadge value={row.shipmentStatus || "pending_packing"} />
                </div>
                <p className="muted">Tracking: {row.trackingId || "Not set"}</p>
                <p className="muted">Courier: {row.courierName || "Unassigned"}</p>
                <p className="muted">
                  Dispatched:{" "}
                  {row.dispatchDate ? formatDateTime(row.dispatchDate) : "—"}
                </p>
                <div className="card-actions">
                  {canUpdateTracking ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => onOpenTracking(row)}
                    >
                      Update Tracking
                    </button>
                  ) : null}
                  {canMarkDelivered ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => onOpenStatus(row)}
                    >
                      Update Status
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Tracking Modal */}
      <Modal
        title={`Update Tracking${selectedShipment ? ` — ${selectedShipment.orderNo}` : ""}`}
        open={trackingModal}
        onClose={() => setTrackingModal(false)}
      >
        <form className="form-grid" onSubmit={onSubmitTracking}>
          <label className="field field-full">
            <span>Courier *</span>
            <select
              value={trackingForm.courierProfileId}
              onChange={(event) =>
                setTrackingForm((prev) => ({
                  ...prev,
                  courierProfileId: event.target.value
                }))
              }
              required
            >
              <option value="">— Select Courier —</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courierName} ({c.courierCode})
                </option>
              ))}
            </select>
          </label>

          <label className="field field-full">
            <span>Tracking ID *</span>
            <input
              value={trackingForm.trackingId}
              onChange={(event) =>
                setTrackingForm((prev) => ({ ...prev, trackingId: event.target.value }))
              }
              required
              placeholder="e.g. 1234567890"
            />
          </label>

          <label className="field">
            <span>Dispatch Date</span>
            <input
              type="date"
              value={trackingForm.dispatchDate}
              onChange={(event) =>
                setTrackingForm((prev) => ({ ...prev, dispatchDate: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Expected Delivery Date</span>
            <input
              type="date"
              value={trackingForm.expectedDeliveryDate}
              onChange={(event) =>
                setTrackingForm((prev) => ({
                  ...prev,
                  expectedDeliveryDate: event.target.value
                }))
              }
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTrackingModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Tracking"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Status Modal */}
      <Modal
        title={`Update Status${selectedShipment ? ` — ${selectedShipment.orderNo}` : ""}`}
        open={statusModal}
        onClose={() => setStatusModal(false)}
        width="480px"
      >
        <form className="form-grid" onSubmit={onSubmitStatus}>
          <label className="field field-full">
            <span>Shipment Status *</span>
            <select
              value={statusForm.shipmentStatus}
              onChange={(event) =>
                setStatusForm((prev) => ({
                  ...prev,
                  shipmentStatus: event.target.value
                }))
              }
              required
            >
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field field-full">
            <span>Admin Notes</span>
            <textarea
              rows="3"
              value={statusForm.adminNotes}
              onChange={(event) =>
                setStatusForm((prev) => ({ ...prev, adminNotes: event.target.value }))
              }
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStatusModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Update Status"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Rate Cards Tab ───────────────────────────────────────────────────────────

function RateCardsTab({ canCreate }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const emptyForm = {
    shippingMethod: "standard",
    zone: "all_india",
    baseCharge: 0,
    perKgCharge: 0,
    isActive: true
  };
  const [addForm, setAddForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ baseCharge: 0, perKgCharge: 0, isActive: true });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRateCards({ includeInactive: true });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load rate cards.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onOpenAdd = () => {
    setAddForm(emptyForm);
    setAddModal(true);
  };

  const onOpenEdit = (card) => {
    setSelectedCard(card);
    setEditForm({
      baseCharge: card.baseCharge,
      perKgCharge: card.perKgCharge,
      isActive: card.isActive
    });
    setEditModal(true);
  };

  const onSubmitAdd = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await createRateCard({
        shippingMethod: addForm.shippingMethod,
        zone: addForm.zone,
        baseCharge: Number(addForm.baseCharge),
        perKgCharge: Number(addForm.perKgCharge),
        isActive: addForm.isActive
      });
      setAddModal(false);
      setNotice("Rate card created.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to create rate card.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitEdit = async (event) => {
    event.preventDefault();
    if (!selectedCard) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await updateRateCard(selectedCard.id, {
        baseCharge: Number(editForm.baseCharge),
        perKgCharge: Number(editForm.perKgCharge),
        isActive: editForm.isActive
      });
      setEditModal(false);
      setNotice("Rate card updated.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to update rate card.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading rate cards..." />;
  }

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <p className="muted">Manage shipping charges by zone and method.</p>
        </div>
        {canCreate ? (
          <button type="button" className="btn btn-primary" onClick={onOpenAdd}>
            + Add Rate Card
          </button>
        ) : null}
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="state-panel">
          <p>No rate cards configured yet.</p>
          {canCreate ? (
            <button type="button" className="btn btn-primary" onClick={onOpenAdd}>
              + Add First Rate Card
            </button>
          ) : null}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Zone</th>
                <th>Base Charge</th>
                <th>Per Kg</th>
                <th>Status</th>
                <th>Updated</th>
                {canCreate ? <th>Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((card) => (
                <tr key={card.id}>
                  <td>{card.shippingMethod}</td>
                  <td>{card.zone}</td>
                  <td>{formatCurrencyInr(card.baseCharge)}</td>
                  <td>{formatCurrencyInr(card.perKgCharge)}</td>
                  <td>
                    <StatusBadge value={card.isActive ? "active" : "inactive"} />
                  </td>
                  <td>{formatDateTime(card.updatedAt)}</td>
                  {canCreate ? (
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => onOpenEdit(card)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Rate Card Modal */}
      <Modal title="Add Rate Card" open={addModal} onClose={() => setAddModal(false)} width="520px">
        <form className="form-grid" onSubmit={onSubmitAdd}>
          <label className="field">
            <span>Shipping Method *</span>
            <select
              value={addForm.shippingMethod}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, shippingMethod: event.target.value }))
              }
              required
            >
              {SHIPPING_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Zone *</span>
            <select
              value={addForm.zone}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, zone: event.target.value }))
              }
              required
            >
              {SHIPPING_ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Base Charge (INR) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={addForm.baseCharge}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, baseCharge: event.target.value }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Per Kg Charge (INR) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={addForm.perKgCharge}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, perKgCharge: event.target.value }))
              }
              required
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={addForm.isActive}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAddModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Create Rate Card"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Rate Card Modal */}
      <Modal
        title={`Edit Rate Card${selectedCard ? ` — ${selectedCard.shippingMethod} / ${selectedCard.zone}` : ""}`}
        open={editModal}
        onClose={() => setEditModal(false)}
        width="480px"
      >
        <form className="form-grid" onSubmit={onSubmitEdit}>
          <label className="field">
            <span>Base Charge (INR) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.baseCharge}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, baseCharge: event.target.value }))
              }
              required
            />
          </label>

          <label className="field">
            <span>Per Kg Charge (INR) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.perKgCharge}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, perKgCharge: event.target.value }))
              }
              required
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ canCreate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    originStateCode: "",
    localPincodePrefixes: "",
    remotePincodePrefixes: ""
  });
  const [enabledMethods, setEnabledMethods] = useState({
    standard: true,
    express: false,
    local_pickup: false,
    self_pickup: false,
    transport: false,
    manual_delivery: false
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchShippingSettings();
      if (data) {
        setForm({
          originStateCode: data.originStateCode || "",
          localPincodePrefixes: Array.isArray(data.localPincodePrefixes)
            ? data.localPincodePrefixes.join(", ")
            : "",
          remotePincodePrefixes: Array.isArray(data.remotePincodePrefixes)
            ? data.remotePincodePrefixes.join(", ")
            : ""
        });
        if (Array.isArray(data.enabledMethods)) {
          const next = {};
          SHIPPING_METHODS.forEach((m) => {
            next[m.value] = data.enabledMethods.includes(m.value);
          });
          setEnabledMethods(next);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load shipping settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const localPincodePrefixes = form.localPincodePrefixes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const remotePincodePrefixes = form.remotePincodePrefixes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await updateShippingSettings({
        originStateCode: form.originStateCode,
        localPincodePrefixes,
        remotePincodePrefixes
      });
      setNotice("Shipping settings saved.");
    } catch (err) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label="Loading settings..." />;
  }

  return (
    <div className="stack">
      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Shipping Configuration</h3>
            <p>Configure origin, pincodes, and enabled shipping methods.</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field field-full">
            <span>Origin State Code</span>
            <input
              value={form.originStateCode}
              placeholder="e.g. MH"
              maxLength="10"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, originStateCode: event.target.value }))
              }
              disabled={!canCreate}
            />
          </label>

          <label className="field field-full">
            <span>Local Pincode Prefixes (comma separated)</span>
            <input
              value={form.localPincodePrefixes}
              placeholder="e.g. 400, 401, 402"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, localPincodePrefixes: event.target.value }))
              }
              disabled={!canCreate}
            />
          </label>

          <label className="field field-full">
            <span>Remote Pincode Prefixes (comma separated)</span>
            <input
              value={form.remotePincodePrefixes}
              placeholder="e.g. 795, 796, 790"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  remotePincodePrefixes: event.target.value
                }))
              }
              disabled={!canCreate}
            />
          </label>

          <div className="field field-full">
            <span style={{ fontSize: "12px", color: "#374151", marginBottom: 8 }}>
              Enabled Shipping Methods
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {SHIPPING_METHODS.map((m) => (
                <label key={m.value} className="inline-check">
                  <input
                    type="checkbox"
                    checked={Boolean(enabledMethods[m.value])}
                    onChange={(event) =>
                      setEnabledMethods((prev) => ({
                        ...prev,
                        [m.value]: event.target.checked
                      }))
                    }
                    disabled={!canCreate}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {canCreate ? (
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          ) : null}
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>About Shipping Methods</h3>
            <p>Reference for available shipping method codes used across the system.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {SHIPPING_METHODS.map((m) => (
                <tr key={m.value}>
                  <td>
                    <code>{m.value}</code>
                  </td>
                  <td>{m.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Couriers Inline Panel ────────────────────────────────────────────────────

function CouriersPanel({ canCreate, couriers, onCouriersChanged }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const emptyForm = {
    courierName: "",
    courierCode: "",
    trackingUrlTemplate: "",
    trackingPageUrl: "",
    supportPhone: "",
    supportEmail: "",
    apiEnabled: false,
    isActive: true
  };
  const [addForm, setAddForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({
    courierName: "",
    trackingUrlTemplate: "",
    trackingPageUrl: "",
    supportPhone: "",
    supportEmail: "",
    isActive: true
  });

  const onOpenAdd = () => {
    setAddForm(emptyForm);
    setAddModal(true);
  };

  const onOpenEdit = (courier) => {
    setSelectedCourier(courier);
    setEditForm({
      courierName: courier.courierName,
      trackingUrlTemplate: courier.trackingUrlTemplate,
      trackingPageUrl: courier.trackingPageUrl || "",
      supportPhone: courier.supportPhone || "",
      supportEmail: courier.supportEmail || "",
      isActive: courier.isActive
    });
    setEditModal(true);
  };

  const onSubmitAdd = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await createCourier({
        courierName: addForm.courierName,
        courierCode: addForm.courierCode,
        trackingUrlTemplate: addForm.trackingUrlTemplate,
        trackingPageUrl: addForm.trackingPageUrl,
        supportPhone: addForm.supportPhone,
        supportEmail: addForm.supportEmail,
        apiEnabled: addForm.apiEnabled,
        isActive: addForm.isActive
      });
      setAddModal(false);
      setNotice("Courier created.");
      onCouriersChanged();
    } catch (err) {
      setError(err.message || "Failed to create courier.");
    } finally {
      setSaving(false);
    }
  };

  const onSubmitEdit = async (event) => {
    event.preventDefault();
    if (!selectedCourier) {
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await updateCourier(selectedCourier.id, {
        courierName: editForm.courierName,
        trackingUrlTemplate: editForm.trackingUrlTemplate,
        trackingPageUrl: editForm.trackingPageUrl,
        supportPhone: editForm.supportPhone,
        supportEmail: editForm.supportEmail,
        isActive: editForm.isActive
      });
      setEditModal(false);
      setNotice("Courier updated.");
      onCouriersChanged();
    } catch (err) {
      setError(err.message || "Failed to update courier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <p className="muted">Courier profiles used for shipment tracking.</p>
        </div>
        {canCreate ? (
          <button type="button" className="btn btn-secondary" onClick={onOpenAdd}>
            + Add Courier
          </button>
        ) : null}
      </div>

      {notice ? <p className="alert-info">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {couriers.length === 0 ? (
        <div className="state-panel">
          <p>No couriers configured yet.</p>
          {canCreate ? (
            <button type="button" className="btn btn-primary" onClick={onOpenAdd}>
              + Add Courier
            </button>
          ) : null}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Support Phone</th>
                <th>Support Email</th>
                <th>Status</th>
                {canCreate ? <th>Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.courierName}</strong>
                  </td>
                  <td>
                    <code>{c.courierCode}</code>
                  </td>
                  <td>{c.supportPhone || "—"}</td>
                  <td>{c.supportEmail || "—"}</td>
                  <td>
                    <StatusBadge value={c.isActive ? "active" : "inactive"} />
                  </td>
                  {canCreate ? (
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => onOpenEdit(c)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Courier Modal */}
      <Modal title="Add Courier" open={addModal} onClose={() => setAddModal(false)}>
        <form className="form-grid" onSubmit={onSubmitAdd}>
          <label className="field">
            <span>Courier Name *</span>
            <input
              value={addForm.courierName}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, courierName: event.target.value }))
              }
              required
              minLength="2"
              placeholder="e.g. Blue Dart"
            />
          </label>

          <label className="field">
            <span>Courier Code *</span>
            <input
              value={addForm.courierCode}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, courierCode: event.target.value }))
              }
              required
              minLength="2"
              placeholder="e.g. BD"
            />
          </label>

          <label className="field field-full">
            <span>Tracking URL Template *</span>
            <input
              value={addForm.trackingUrlTemplate}
              onChange={(event) =>
                setAddForm((prev) => ({
                  ...prev,
                  trackingUrlTemplate: event.target.value
                }))
              }
              required
              minLength="4"
              placeholder="e.g. https://tracking.bluedart.com/tracking/{trackingId}"
            />
          </label>

          <label className="field field-full">
            <span>Tracking Page URL</span>
            <input
              value={addForm.trackingPageUrl}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, trackingPageUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </label>

          <label className="field">
            <span>Support Phone</span>
            <input
              value={addForm.supportPhone}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, supportPhone: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Support Email</span>
            <input
              type="email"
              value={addForm.supportEmail}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, supportEmail: event.target.value }))
              }
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={addForm.isActive}
              onChange={(event) =>
                setAddForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAddModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Create Courier"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Courier Modal */}
      <Modal
        title={`Edit Courier${selectedCourier ? ` — ${selectedCourier.courierName}` : ""}`}
        open={editModal}
        onClose={() => setEditModal(false)}
      >
        <form className="form-grid" onSubmit={onSubmitEdit}>
          <label className="field field-full">
            <span>Courier Name *</span>
            <input
              value={editForm.courierName}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, courierName: event.target.value }))
              }
              required
              minLength="2"
            />
          </label>

          <label className="field field-full">
            <span>Tracking URL Template *</span>
            <input
              value={editForm.trackingUrlTemplate}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  trackingUrlTemplate: event.target.value
                }))
              }
              required
              minLength="4"
            />
          </label>

          <label className="field field-full">
            <span>Tracking Page URL</span>
            <input
              value={editForm.trackingPageUrl}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, trackingPageUrl: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Support Phone</span>
            <input
              value={editForm.supportPhone}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, supportPhone: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Support Email</span>
            <input
              type="email"
              value={editForm.supportEmail}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, supportEmail: event.target.value }))
              }
            />
          </label>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ShippingPage() {
  const { session } = useAuthSession();
  const canView = hasPermission(session, "shipping.view");
  const canCreate = hasPermission(session, "shipping.create");
  const canUpdateTracking = hasPermission(session, "shipping.update_tracking");
  const canMarkDelivered = hasPermission(session, "shipping.mark_delivered");

  const [activeTab, setActiveTab] = useState("queue");
  const [couriers, setCouriers] = useState([]);
  const [couriersLoaded, setCouriersLoaded] = useState(false);

  const loadCouriers = async () => {
    try {
      const data = await fetchCouriers({ includeInactive: false });
      setCouriers(Array.isArray(data) ? data : []);
    } catch (_err) {
      // non-fatal; couriers list may be empty
      setCouriers([]);
    } finally {
      setCouriersLoaded(true);
    }
  };

  useEffect(() => {
    if (canView) {
      loadCouriers();
    }
  }, [canView]);

  if (!canView) {
    return (
      <section className="stack">
        <PageHeader title="Shipping" description="Manage shipments, couriers, and rate cards." />
        <div className="state-panel error">
          <p>You do not have permission to view shipping.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title="Shipping"
        description="Manage shipments, courier profiles, rate cards, and shipping settings."
      />

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "6px",
          flexWrap: "wrap"
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: "pointer",
              background: activeTab === tab ? "var(--brand)" : "transparent",
              color: activeTab === tab ? "#fff" : "var(--text)",
              transition: "0.15s ease"
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "queue" ? (
        <QueueTab canCreate={canCreate} couriers={couriers} />
      ) : null}

      {activeTab === "shipments" ? (
        <div className="stack">
          <ShipmentsTab
            canUpdateTracking={canUpdateTracking}
            canMarkDelivered={canMarkDelivered}
            couriers={couriers}
          />
        </div>
      ) : null}

      {activeTab === "rate-cards" ? (
        <div className="stack">
          <RateCardsTab canCreate={canCreate} />
          <div className="settings-card">
            <div className="settings-card-head">
              <h3>Courier Profiles</h3>
            </div>
            {couriersLoaded ? (
              <CouriersPanel
                canCreate={canCreate}
                couriers={couriers}
                onCouriersChanged={loadCouriers}
              />
            ) : (
              <LoadingBlock label="Loading couriers..." />
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "classes" ? (
        <div className="stack">
          <ShippingClassesTab canCreate={canCreate} />
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <SettingsTab canCreate={canCreate} />
      ) : null}
    </section>
  );
}
