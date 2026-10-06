// Makes plain-text web addresses inside admin-written description HTML
// clickable (2026-10-06). Many existing descriptions have URLs typed/pasted
// as text, which used to be stripped of any link. Walks text nodes only —
// existing <a> tags are left alone — and adds target=_blank rel=noopener.
// Browser-only (DOMParser); returns the input unchanged anywhere else.

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

export function linkifyHtml(html) {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  if (!/(https?:\/\/|www\.)/i.test(html)) return html;
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstChild;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest("a")) continue;
      URL_RE.lastIndex = 0;
      if (URL_RE.test(node.nodeValue)) targets.push(node);
    }
    for (const node of targets) {
      const text = node.nodeValue;
      const frag = doc.createDocumentFragment();
      let last = 0;
      URL_RE.lastIndex = 0;
      let m;
      while ((m = URL_RE.exec(text))) {
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        const a = doc.createElement("a");
        a.href = /^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = m[1];
        frag.appendChild(a);
        last = m.index + m[1].length;
      }
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
    return root.innerHTML;
  } catch {
    return html;
  }
}
