import { useEffect, useRef, useState } from "react";
import { connectWhatsapp, disconnectWhatsapp, fetchWhatsappStatus } from "./whatsapp.api";

export function WhatsAppConnectCard({ canManage }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const refresh = async () => {
    try {
      const data = await fetchWhatsappStatus();
      setStatus(data);
      if (data.status === "qr" || data.status === "connecting") {
        if (!pollRef.current) pollRef.current = setInterval(refresh, 2000);
      } else {
        stopPolling();
      }
    } catch (err) {
      setError(err.message || "Failed to load WhatsApp status.");
      stopPolling();
    }
  };

  useEffect(() => {
    if (canManage) refresh();
    return stopPolling;
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await connectWhatsapp();
      setStatus(data);
      pollRef.current = setInterval(refresh, 2000);
    } catch (err) {
      setError(err.message || "Failed to start WhatsApp connection.");
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!window.confirm("Disconnect this WhatsApp number? You'll need to scan a QR code again to reconnect.")) return;
    setBusy(true);
    setError("");
    try {
      const data = await disconnectWhatsapp();
      setStatus(data);
      stopPolling();
    } catch (err) {
      setError(err.message || "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3>WhatsApp Connection</h3>
            <p>Link a dedicated WhatsApp number for this store's communications.</p>
          </div>
          <span className="status-pill amber">Super Admin only</span>
        </div>
      </article>
    );
  }

  const s = status?.status || "idle";

  return (
    <article className="settings-card">
      <div className="settings-card-head">
        <div>
          <h3>WhatsApp Connection</h3>
          <p>Link a WhatsApp number dedicated to Jenix India — separate from any other project.</p>
        </div>
        {s === "connected" ? <span className="status-pill green">Connected</span> : null}
        {s === "qr" ? <span className="status-pill amber">Scan QR</span> : null}
        {s === "connecting" ? <span className="status-pill amber">Connecting…</span> : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {status?.lastError ? <p className="form-error">{status.lastError}</p> : null}

      <div className="form-grid wide">
        {s === "idle" || s === "error" ? (
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={onConnect} disabled={busy}>
              {busy ? "Starting…" : "Connect WhatsApp Number"}
            </button>
          </div>
        ) : null}

        {s === "connecting" ? <p>Starting connection… QR code will appear shortly.</p> : null}

        {s === "qr" && status?.qr ? (
          <div className="field field-full" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <p>
              Open WhatsApp on the phone you want to link → <strong>Settings → Linked Devices → Link a Device</strong>, then scan this code.
            </p>
            <img
              src={status.qr}
              alt="WhatsApp QR code"
              style={{ width: 220, height: 220, border: "1px solid #e5e7eb", borderRadius: 8 }}
            />
            <button type="button" className="btn" onClick={onDisconnect} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : null}

        {s === "connected" ? (
          <>
            <p>
              Connected number: <strong>+{status.connectedNumber}</strong>
            </p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={onDisconnect} disabled={busy}>
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
