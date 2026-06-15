import { useRef, useEffect, useCallback } from "react";

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
  const suppressSync = useRef(false);

  useEffect(() => {
    if (!editorRef.current || suppressSync.current) return;
    if (editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const pushChange = useCallback(() => {
    suppressSync.current = true;
    onChange(editorRef.current?.innerHTML || "");
    suppressSync.current = false;
  }, [onChange]);

  const exec = useCallback((cmd, arg) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg ?? null);
    pushChange();
  }, [pushChange]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
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
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={pushChange}
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
