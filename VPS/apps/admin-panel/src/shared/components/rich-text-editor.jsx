import { useRef, useEffect, useCallback } from "react";
import { RichTextExtraTools, pastedTextAsUrl, linkHtml } from "./rich-text-extra-tools";
import { RICH_TEXT_FX_CSS } from "./rich-text-fx-css";

const TOOLS = [
  { cmd: "bold",                label: "B",    title: "Bold",           style: { fontWeight: 700 } },
  { cmd: "italic",              label: "I",    title: "Italic",         style: { fontStyle: "italic" } },
  { cmd: "underline",           label: "U",    title: "Underline",      style: { textDecoration: "underline" } },
  { cmd: "insertUnorderedList", label: "• •",  title: "Bullet List" },
  { cmd: "insertOrderedList",   label: "1.",   title: "Numbered List" },
  { cmd: "formatBlock",         arg: "h2",     label: "H2",             title: "Heading 2" },
  { cmd: "formatBlock",         arg: "h3",     label: "H3",             title: "Heading 3" },
  { cmd: "formatBlock",         arg: "p",      label: "¶",              title: "Paragraph" },
  { cmd: "removeFormat",        label: "✕fmt", title: "Clear Formatting" }
];

export function RichTextEditor({ value, onChange, minRows = 5, placeholder }) {
  const editorRef = useRef(null);
  // Tracks the last HTML value we pushed out via onChange.
  // useEffect skips DOM reset when the incoming value matches what we just emitted,
  // preventing the cursor from jumping on every keystroke.
  // null sentinel: ensures first useEffect run always populates the DOM
  const lastEmitted = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const incoming = value || "";
    // Skip: this value was just emitted by us — no need to touch the DOM.
    if (lastEmitted.current === incoming) return;
    // External change (e.g. parent loaded data) — update the DOM.
    if (editorRef.current.innerHTML !== incoming) {
      lastEmitted.current = incoming;
      editorRef.current.innerHTML = incoming;
    }
  }, [value]);

  const pushChange = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback((cmd, arg) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg ?? null);
    pushChange();
  }, [pushChange]);

  // 2026-10-06: pasting a bare web address makes it a clickable link
  // (it used to stay plain text). Selected words + pasted URL → those words
  // become the link. Anything else pastes as before.
  const handlePaste = useCallback((e) => {
    const url = pastedTextAsUrl(e.clipboardData?.getData("text/plain"));
    if (!url) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
      document.execCommand("createLink", false, url);
    } else {
      document.execCommand("insertHTML", false, linkHtml(url, e.clipboardData.getData("text/plain").trim()) + "&nbsp;");
    }
    pushChange();
  }, [pushChange]);

  return (
    // stopPropagation prevents the parent <label> (Field component) from forwarding
    // the click to the first <button> (Bold) instead of the contentEditable div.
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}
    >
      <div style={{
        display: "flex", gap: 3, padding: "5px 8px",
        background: "#f9fafb", borderBottom: "1px solid var(--border)", flexWrap: "wrap"
      }}>
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.title}
            onMouseDown={(e) => { e.preventDefault(); exec(t.cmd, t.arg); }}
            style={{
              ...(t.style || {}),
              padding: "2px 7px", fontSize: 12, borderRadius: 4,
              border: "1px solid var(--border)", background: "#fff",
              cursor: "pointer", lineHeight: 1.6, fontFamily: "inherit"
            }}
          >
            {t.label}
          </button>
        ))}
        <RichTextExtraTools editorRef={editorRef} onChanged={pushChange} />
      </div>
      <style>{RICH_TEXT_FX_CSS}</style>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={pushChange}
        onPaste={handlePaste}
        className="jx-rte-body"
        data-placeholder={placeholder || ""}
        style={{
          minHeight: `${minRows * 26}px`, padding: "10px 12px",
          outline: "none", fontSize: 14, lineHeight: 1.7,
          color: "var(--text)", overflowY: "auto"
        }}
      />
    </div>
  );
}
