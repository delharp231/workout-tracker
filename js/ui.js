export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    // null/undefined/false leave the attribute off (so `disabled: false` isn't disabled);
    // true becomes a bare boolean attribute. ARIA state must be passed as the strings 'true'/'false'.
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

// A visible <label> tied to its control. Every form field uses this, never placeholder-only labels.
export function field(labelText, id, inputEl) {
  inputEl.id = id;
  return el('div', {}, [el('label', { for: id, class: 'muted small', text: labelText }), inputEl]);
}

export function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Resolves { name, text }, or null if the picker is cancelled.
export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept });
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: reader.result });
      reader.readAsText(f);
    });
    input.click();
  });
}

// One toast at a time, just above the tab bar, announced to screen readers. Optional action (Undo).
let toastNode = null;
let toastTimer = null;

export function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  if (toastNode) { toastNode.remove(); toastNode = null; }
}

export function showToast(text, { actionLabel = null, onAction = null, ms = 5000 } = {}) {
  hideToast();
  const children = [el('span', { text })];
  if (actionLabel && onAction) {
    children.push(el('button', { text: actionLabel, onclick: () => { hideToast(); onAction(); } }));
  }
  toastNode = el('div', { class: 'toast', role: 'status' }, children);
  document.body.append(toastNode);
  toastTimer = setTimeout(hideToast, ms);
}
