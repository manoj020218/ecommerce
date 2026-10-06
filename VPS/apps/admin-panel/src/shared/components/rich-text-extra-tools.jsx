import { useEffect, useRef, useState } from "react";

// Extra RichTextEditor tools (2026-10-06): Link / Unlink, Text colour,
// Highlight, Size, Spacing and eye-catcher Effects. Only produces markup the
// backend sanitizer (common/html-sanitizer.js RICH_TEXT_OPTIONS) keeps:
// <a href>, <span style="color|background-color|font-size|letter-spacing">,
// <span class="jx-fx-*">. Effects are animated by storefront styles.css.

const TEXT_COLORS = [
  ["#E8231A", "Jenix red"], ["#111827", "Black"], ["#15803d", "Green"], ["#1d4ed8", "Blue"],
  ["#ea580c", "Orange"], ["#7c3aed", "Purple"], ["#6b7280", "Grey"]
];
const HIGHLIGHTS = [
  ["#fff59d", "Yellow"], ["#fee2e2", "Light red"], ["#dcfce7", "Light green"],
  ["#dbeafe", "Light blue"], ["#ffedd5", "Light orange"]
];
const SIZES = [["0.85em", "Small"], ["1.15em", "Large"], ["1.35em", "Bigger"], ["1.6em", "Huge"]];
const SPACINGS = [["0.05em", "Wide"], ["0.1em", "Wider"], ["0.2em", "W I D E S T"]];
export const EFFECTS = [
  ["jx-fx-pulse", "Pulse (gently grows)"],
  ["jx-fx-blink", "Blink (soft fade)"],
  ["jx-fx-shine", "Shine (light sweep)"],
  ["jx-fx-badge", "Badge (red pill)"],
  ["jx-fx-underline", "Marker underline"],
  ["jx-fx-shake", "Shake (every few sec)"]
];

const btn = {
  padding: "2px 7px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)",
  background: "#fff", cursor: "pointer", lineHeight: 1.6, fontFamily: "inherit"
};
const pop = {
  position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 4, padding: 8,
  background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,.12)", display: "flex", gap: 6, flexWrap: "wrap", minWidth: 180
};

function normalizeUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`;
  if (/^\+?[\d\s-]{8,}$/.test(v)) return `tel:${v.replace(/[\s-]/g, "")}`;
  return `https://${v.replace(/^\/+/, "")}`;
}

// A single pasted web address → clickable link (used by the editor's onPaste).
export function pastedTextAsUrl(text) {
  const v = String(text || "").trim();
  if (!v || /\s/.test(v)) return "";
  if (/^https?:\/\/[^\s]+\.[^\s]+/i.test(v) || /^www\.[^\s]+\.[a-z]{2,}/i.test(v)) return normalizeUrl(v);
  return "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function linkHtml(url, text) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text || url)}</a>`;
}

export function RichTextExtraTools({ editorRef, onChanged }) {
  const [open, setOpen] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef(null);
  const wrapRef = useRef(null);

  // Remember the editor selection so it survives clicks on popovers/inputs.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [editorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(""); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function restore() {
    const r = savedRange.current;
    if (!r || !editorRef.current) return null;
    editorRef.current.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return r;
  }

  function wrap(build) {
    const r = restore();
    if (!r || r.collapsed) {
      alertSelect();
      return;
    }
    const el = build();
    el.appendChild(r.extractContents());
    r.insertNode(el);
    const sel = window.getSelection();
    const nr = document.createRange();
    nr.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(nr);
    savedRange.current = nr.cloneRange();
    setOpen("");
    onChanged();
  }

  function alertSelect() {
    setOpen("hint");
  }

  function styled(prop, value) {
    wrap(() => {
      const s = document.createElement("span");
      s.style.setProperty(prop, value);
      return s;
    });
  }

  function effect(cls) {
    wrap(() => {
      const s = document.createElement("span");
      s.className = cls;
      return s;
    });
  }

  function unwrapClosest(selector) {
    const r = restore();
    if (!r) return;
    let node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const el = node?.closest?.(selector);
    if (!el || !editorRef.current.contains(el)) return;
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    setOpen("");
    onChanged();
  }

  function applyLink() {
    const url = normalizeUrl(linkUrl);
    if (!url) return;
    const r = restore();
    if (!r) return;
    if (r.collapsed) {
      document.execCommand("insertHTML", false, linkHtml(url, linkUrl.trim()));
    } else {
      document.execCommand("createLink", false, url);
    }
    setLinkUrl("");
    setOpen("");
    onChanged();
  }

  const toggle = (name) => (e) => { e.preventDefault(); setOpen(open === name ? "" : name); };
  const keep = (fn) => (e) => { e.preventDefault(); fn(); };

  return (
    <div ref={wrapRef} style={{ display: "contents" }}>
      <span style={{ width: 1, background: "var(--border)", margin: "0 3px" }} />

      <span style={{ position: "relative" }}>
        <button type="button" title="Add website link (select text first, or just type the address)" style={btn} onMouseDown={toggle("link")}>🔗 Link</button>
        {open === "link" ? (
          <div style={{ ...pop, minWidth: 280 }}>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
              placeholder="https://… , email or phone"
              style={{ flex: 1, minWidth: 180, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
            />
            <button type="button" style={{ ...btn, background: "#E8231A", color: "#fff", border: "none" }} onClick={applyLink}>Add</button>
            <div style={{ width: "100%", fontSize: 11, color: "#6b7280" }}>
              Select words first to make them the link, or leave nothing selected to insert the address itself.
              Opens in a new tab.
            </div>
          </div>
        ) : null}
      </span>
      <button type="button" title="Remove link" style={btn} onMouseDown={keep(() => unwrapClosest("a"))}>⛓ Unlink</button>

      <span style={{ position: "relative" }}>
        <button type="button" title="Text colour" style={{ ...btn, color: "#E8231A", fontWeight: 700 }} onMouseDown={toggle("color")}>A▾</button>
        {open === "color" ? (
          <div style={pop}>
            {TEXT_COLORS.map(([c, name]) => (
              <button key={c} type="button" title={name} onMouseDown={keep(() => styled("color", c))}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #d1d5db", background: c, cursor: "pointer" }} />
            ))}
          </div>
        ) : null}
      </span>

      <span style={{ position: "relative" }}>
        <button type="button" title="Highlight (background colour)" style={{ ...btn, background: "#fff59d" }} onMouseDown={toggle("hl")}>🖍 Highlight</button>
        {open === "hl" ? (
          <div style={pop}>
            {HIGHLIGHTS.map(([c, name]) => (
              <button key={c} type="button" title={name} onMouseDown={keep(() => styled("background-color", c))}
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #d1d5db", background: c, cursor: "pointer" }} />
            ))}
          </div>
        ) : null}
      </span>

      <span style={{ position: "relative" }}>
        <button type="button" title="Text size" style={btn} onMouseDown={toggle("size")}>Aa Size</button>
        {open === "size" ? (
          <div style={{ ...pop, flexDirection: "column" }}>
            {SIZES.map(([v, name]) => (
              <button key={v} type="button" style={{ ...btn, fontSize: `calc(12px * ${parseFloat(v)})`, textAlign: "left" }} onMouseDown={keep(() => styled("font-size", v))}>{name}</button>
            ))}
          </div>
        ) : null}
      </span>

      <span style={{ position: "relative" }}>
        <button type="button" title="Letter spacing" style={{ ...btn, letterSpacing: "0.1em" }} onMouseDown={toggle("space")}>↔ Spacing</button>
        {open === "space" ? (
          <div style={{ ...pop, flexDirection: "column" }}>
            {SPACINGS.map(([v, name]) => (
              <button key={v} type="button" style={{ ...btn, letterSpacing: v, textAlign: "left" }} onMouseDown={keep(() => styled("letter-spacing", v))}>{name}</button>
            ))}
          </div>
        ) : null}
      </span>

      <span style={{ position: "relative" }}>
        <button type="button" title="Eye-catcher effect" style={{ ...btn, color: "#7c3aed", fontWeight: 700 }} onMouseDown={toggle("fx")}>✨ Effect</button>
        {open === "fx" ? (
          <div style={{ ...pop, flexDirection: "column", minWidth: 210 }}>
            {EFFECTS.map(([cls, name]) => (
              <button key={cls} type="button" style={{ ...btn, textAlign: "left" }} onMouseDown={keep(() => effect(cls))}>{name}</button>
            ))}
            <button type="button" style={{ ...btn, textAlign: "left", color: "#6b7280" }}
              onMouseDown={keep(() => unwrapClosest('span[class*="jx-fx-"]'))}>✕ Remove effect</button>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Use on a few words only — too many moving words look like spam.</div>
          </div>
        ) : null}
      </span>

      {open === "hint" ? (
        <span style={{ fontSize: 11, color: "#b45309", alignSelf: "center" }}>Select some text first.</span>
      ) : null}
    </div>
  );
}
