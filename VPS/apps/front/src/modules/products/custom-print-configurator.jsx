import { useEffect, useRef, useState } from "react";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { StorefrontButton } from "../../shared/storefront/storefront-ui";
import { addCartItem, updateCartItem } from "./products.api";
import { uploadPrintDesign, updateUploadCrop } from "./print-uploads.api";
import { buildCartContext, notifyStorefrontCartUpdated } from "../cart/cart.utils";

const DEFAULT_CROP = { panX: 0.5, panY: 0.5, zoom: 1 };

function resolveDefaultSelections(customOptions) {
  const selections = {};
  (customOptions || []).forEach((group) => {
    const def = group.choices.find((c) => c.default) || group.choices[0];
    if (def) selections[group.id] = def.id;
  });
  return selections;
}

function computeUnitDelta(customOptions, selections) {
  return (customOptions || []).reduce((sum, group) => {
    const choice = group.choices.find((c) => c.id === selections[group.id]);
    return sum + Number(choice?.priceDelta || 0);
  }, 0);
}

function currency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

// A choice can point at a printTemplate (e.g. "2-Screw Fix" needs holes
// drilled through the card) -- resolve whichever template the buyer's
// current selections activate, so the preview can show them exactly where
// to keep their design clear of.
function resolveActiveTemplate(product, selections) {
  const templateId = (product.customOptions || [])
    .map((group) => group.choices.find((c) => c.id === selections[group.id]))
    .find((choice) => choice?.safeZoneTemplateId)?.safeZoneTemplateId;
  if (!templateId) return null;
  return (product.printTemplates || []).find((t) => t.id === templateId) || null;
}

function SafeZoneOverlay({ printTemplate, uploadSpec }) {
  const cardW = Number(uploadSpec?.cardWidthMm || 0);
  const cardH = Number(uploadSpec?.cardHeightMm || 0);
  if (!printTemplate || !cardW || !cardH) return null;

  return (
    <svg
      viewBox={`0 0 ${cardW} ${cardH}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {printTemplate.holes.map((hole, i) => {
        const cx = hole.edge === "left" ? hole.distanceFromSideMm : cardW - hole.distanceFromSideMm;
        const cy = hole.distanceFromTopMm;
        const r = hole.diameterMm / 2;
        const rMargin = r + (hole.marginMm || 0);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={rMargin} fill="rgba(232,35,26,.18)" />
            <circle cx={cx} cy={cy} r={r} fill="#E8231A" stroke="#fff" strokeWidth={cardW / 200} />
          </g>
        );
      })}
    </svg>
  );
}

function clampPan(panX, panY) {
  return { panX: Math.min(1, Math.max(0, panX)), panY: Math.min(1, Math.max(0, panY)) };
}

// Drag-to-reposition: the photo is almost never the exact same aspect ratio
// as the card, so something always has to give -- rather than silently
// center-cropping (hiding the buyer never gets to see or control which part
// gets cut), the frame is a fixed peephole and the photo underneath can be
// dragged/zoomed until the buyer is happy with what shows through it. `crop`
// (panX/panY 0..1, zoom >=1) is resolution-independent on purpose so it
// keeps working correctly however large the frame renders on screen.
function DesignPreview({ design, uploadSpec, printTemplate, onCropChange }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const crop = design.crop || DEFAULT_CROP;

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFrameSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aspectRatio =
    uploadSpec?.cardWidthMm && uploadSpec?.cardHeightMm
      ? `${uploadSpec.cardWidthMm} / ${uploadSpec.cardHeightMm}`
      : "856 / 540";

  const canPan = frameSize.w > 0 && frameSize.h > 0 && naturalSize.w > 0 && naturalSize.h > 0;

  let imgStyle = { width: "100%", height: "100%", objectFit: "cover" };
  let minLeft = 0;
  let minTop = 0;
  if (canPan) {
    const baseScale = Math.max(frameSize.w / naturalSize.w, frameSize.h / naturalSize.h);
    const displayW = naturalSize.w * baseScale * crop.zoom;
    const displayH = naturalSize.h * baseScale * crop.zoom;
    minLeft = frameSize.w - displayW;
    minTop = frameSize.h - displayH;
    imgStyle = {
      position: "absolute",
      width: displayW,
      height: displayH,
      left: minLeft * crop.panX,
      top: minTop * crop.panY,
      maxWidth: "none"
    };
  }

  function handlePointerDown(e) {
    if (!canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: minLeft * crop.panX,
      startTop: minTop * crop.panY
    };
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startClientX;
    const dy = e.clientY - dragRef.current.startClientY;
    const nextLeft = dragRef.current.startLeft + dx;
    const nextTop = dragRef.current.startTop + dy;
    const next = clampPan(minLeft !== 0 ? nextLeft / minLeft : 0, minTop !== 0 ? nextTop / minTop : 0);
    onCropChange(design, { ...crop, ...next }, false);
  }

  function handlePointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onCropChange(design, crop, true);
  }

  function adjustZoom(delta) {
    const nextZoom = Math.min(4, Math.max(1, Number((crop.zoom + delta).toFixed(2))));
    onCropChange(design, { ...crop, zoom: nextZoom }, true);
  }

  return (
    <div className="proto-custom-print-design-preview">
      <div
        ref={frameRef}
        className="proto-custom-print-design-preview-box"
        style={{ aspectRatio, cursor: canPan ? "grab" : "default", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={design.previewUrl}
          alt="Your uploaded design"
          draggable={false}
          onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={imgStyle}
        />
        <SafeZoneOverlay printTemplate={printTemplate} uploadSpec={uploadSpec} />
        {canPan ? (
          <div className="proto-custom-print-zoom-controls">
            <button type="button" onClick={() => adjustZoom(-0.25)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => adjustZoom(0.25)} aria-label="Zoom in">+</button>
          </div>
        ) : null}
      </div>
      <small className="proto-custom-print-preview-hint">
        {printTemplate
          ? "Drag to reposition · keep photos/text clear of the red circles, that's where the card will be drilled."
          : "Drag to reposition, use +/− to zoom — this is exactly how your design will be printed on the card."}
      </small>
    </div>
  );
}

export function CustomPrintConfigurator({ product }) {
  const { isAuthenticated } = useCustomerSession();
  const [selections, setSelections] = useState(() => resolveDefaultSelections(product.customOptions));
  const [designs, setDesigns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isBatchMode = product.uploadMode === "unique_batch";
  const activeTemplate = resolveActiveTemplate(product, selections);
  const unitDelta = computeUnitDelta(product.customOptions, selections);
  const unitPrice = Number(product.pricing?.visiblePrice ?? product.basePrice ?? 0) + unitDelta;
  const readyDesigns = designs.filter((d) => d.uploadId && !d.error);
  const failedDesigns = designs.filter((d) => d.error);
  // Qty applies per design in both modes now -- in unique_batch mode each
  // design is normally 1 (one card = one upload), but the qty stepper lets
  // a buyer order extra copies of that exact same design, the "rare case"
  // this product type is built around.
  const totalQty = readyDesigns.reduce((sum, d) => sum + d.qty, 0);
  const totalPrice = readyDesigns.reduce((sum, d) => sum + d.qty * unitPrice, 0);

  function selectChoice(groupId, choiceId) {
    setSelections((cur) => ({ ...cur, [groupId]: choiceId }));
  }

  async function handleFilesSelected(fileList) {
    setError("");
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const entries = files.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploadId: "",
      qty: 1,
      uploading: true,
      error: "",
      crop: DEFAULT_CROP
    }));
    setDesigns((cur) => [...cur, ...entries]);

    for (const entry of entries) {
      try {
        const result = await uploadPrintDesign(entry.file, product.id);
        setDesigns((cur) =>
          cur.map((d) => (d.localId === entry.localId ? { ...d, uploadId: result.id, uploading: false } : d))
        );
      } catch (uploadError) {
        setDesigns((cur) =>
          cur.map((d) =>
            d.localId === entry.localId
              ? { ...d, uploading: false, error: uploadError.message || "Upload failed." }
              : d
          )
        );
      }
    }
  }

  // Cheap local updates fire on every drag frame; only the final position
  // (pointerup) or a zoom-button click is worth a network round trip -- so
  // the server always has the buyer's *settled* crop, not a half-drag one.
  async function handleCropChange(design, crop, commit) {
    setDesigns((cur) => cur.map((d) => (d.localId === design.localId ? { ...d, crop } : d)));
    if (!commit || !design.uploadId) return;
    try {
      await updateUploadCrop(design.uploadId, crop);
    } catch (_cropError) {
      // Best-effort -- crop is a print-framing refinement, not something
      // that should block the buyer from continuing to checkout.
    }
  }

  function updateQty(localId, delta) {
    setDesigns((cur) => cur.map((d) => (d.localId === localId ? { ...d, qty: Math.max(1, d.qty + delta) } : d)));
  }

  function removeDesign(localId) {
    setDesigns((cur) => {
      const target = cur.find((d) => d.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((d) => d.localId !== localId);
    });
  }

  async function handleAddToCart() {
    setError("");
    setNotice("");

    if (!readyDesigns.length) {
      setError("Upload at least one design first.");
      return;
    }
    if (designs.some((d) => d.uploading)) {
      setError("Please wait for all uploads to finish.");
      return;
    }

    setBusy(true);
    try {
      const context = buildCartContext(isAuthenticated);
      if (isBatchMode) {
        // The server always creates one line per uploaded design at qty 1
        // (each card is normally unique) -- for any design where the buyer
        // bumped the qty stepper above 1 (wants extra copies of that exact
        // same design), immediately follow up with a per-line qty update
        // using the lineId the server just handed back.
        const cartView = await addCartItem({
          ...context,
          productId: product.id,
          qty: 1,
          customization: selections,
          designUploadIds: readyDesigns.map((d) => d.uploadId)
        });
        const extraQtyDesigns = readyDesigns.filter((d) => d.qty > 1);
        for (const design of extraQtyDesigns) {
          const line = cartView.items.find(
            (row) => row.designUploadIds?.[0] === design.uploadId
          );
          if (line) {
            // eslint-disable-next-line no-await-in-loop
            await updateCartItem(product.id, { qty: design.qty, lineId: line.lineId });
          }
        }
      } else {
        for (const design of readyDesigns) {
          // eslint-disable-next-line no-await-in-loop
          await addCartItem({
            ...context,
            productId: product.id,
            qty: design.qty,
            customization: selections,
            designUploadIds: [design.uploadId]
          });
        }
      }
      notifyStorefrontCartUpdated();
      setNotice(`Added ${readyDesigns.length} design${readyDesigns.length === 1 ? "" : "s"} to cart.`);
      designs.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
      setDesigns([]);
    } catch (cartError) {
      setError(cartError.message || "Unable to add to cart.");
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="proto-custom-print-login-gate">
        <p>Log in to upload your design and order this product.</p>
        <StorefrontButton to={`/account/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
          Log In / Create Account
        </StorefrontButton>
      </div>
    );
  }

  return (
    <div className="proto-custom-print-configurator">
      {(product.customOptions || []).map((group) => (
        <div key={group.id} className="proto-custom-print-option-group">
          <span className="proto-custom-print-option-label">{group.label}</span>
          <div className="proto-custom-print-chip-row">
            {group.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`proto-custom-print-chip${selections[group.id] === choice.id ? " selected" : ""}`}
                onClick={() => selectChoice(group.id, choice.id)}
              >
                {choice.label}
                {choice.priceDelta ? <small>+{currency(choice.priceDelta)}</small> : <small>included</small>}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="proto-custom-print-upload-zone">
        <label>
          <input
            type="file"
            multiple={isBatchMode}
            accept={(product.uploadSpec?.allowedFormats || ["jpg", "png", "pdf"])
              .map((f) => (f === "pdf" ? "application/pdf" : `image/${f === "jpg" ? "jpeg" : f}`))
              .join(",")}
            onChange={(e) => handleFilesSelected(e.target.files)}
            style={{ display: "none" }}
          />
          <span>
            {isBatchMode
              ? "Drop or select a batch of card designs — one file per card"
              : "Drop or select your design"}
          </span>
          <small>
            {product.uploadSpec?.cardWidthMm ? `${product.uploadSpec.cardWidthMm}mm × ${product.uploadSpec.cardHeightMm}mm · ` : ""}
            {(product.uploadSpec?.allowedFormats || []).join(", ").toUpperCase()} · up to {product.uploadSpec?.maxFileSizeMb || 20}MB each
          </small>
        </label>
      </div>

      {failedDesigns.length > 0 ? (
        <div className="proto-custom-print-error-banner">
          <strong>{failedDesigns.length} upload{failedDesigns.length === 1 ? "" : "s"} failed</strong>
          <ul>
            {failedDesigns.map((d) => (
              <li key={d.localId}>{d.file.name}: {d.error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {designs.length > 0 ? (
        <div className="proto-custom-print-design-list">
          {designs.map((design) => (
            <div key={design.localId} className="proto-custom-print-design-row">
              <DesignPreview
                design={design}
                uploadSpec={product.uploadSpec}
                printTemplate={activeTemplate}
                onCropChange={handleCropChange}
              />
              <div className="proto-custom-print-design-row-footer">
                <div className="proto-custom-print-design-meta">
                  <span>{design.file.name}</span>
                  {design.uploading ? <small>Uploading...</small> : null}
                  {design.error ? <small className="proto-inline-error">{design.error}</small> : null}
                  {design.uploadId ? <small>Print-ready ✓</small> : null}
                </div>
                <div className="proto-custom-print-qty-group">
                  <span className="proto-custom-print-qty-label">Quantity</span>
                  <div className="proto-qty-control">
                    <button type="button" onClick={() => updateQty(design.localId, -1)}>-</button>
                    <strong>{design.qty}</strong>
                    <button type="button" onClick={() => updateQty(design.localId, 1)}>+</button>
                  </div>
                </div>
                <button type="button" className="proto-custom-print-design-remove" onClick={() => removeDesign(design.localId)} aria-label="Remove design">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="proto-custom-print-summary">
        <span>
          {totalQty} card{totalQty === 1 ? "" : "s"} × {currency(unitPrice)}
        </span>
        <strong>{currency(totalPrice)}</strong>
      </div>

      {notice ? <p className="proto-inline-success">{notice}</p> : null}
      {error ? <p className="proto-inline-error">{error}</p> : null}

      <StorefrontButton type="button" onClick={handleAddToCart} disabled={busy || !readyDesigns.length}>
        {busy ? "Adding..." : "Add to Cart"}
      </StorefrontButton>
    </div>
  );
}
