// Small UI toolkit: DOM builder, icons, toasts, modals, clipboard.
// Everything user-controlled goes through textContent / setAttribute, never innerHTML,
// so nothing inside your JSON files can inject markup.

export const $ = (selector, root = document) => root.querySelector(selector);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(props || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === 'value') { value = val; continue; }
    if (key === 'class') el.className = val;
    else if (key === 'style' && typeof val === 'object') {
      // Object.assign can't set CSS custom properties (--c, ...); setProperty can.
      for (const [name, v] of Object.entries(val)) {
        if (name.startsWith('--')) el.style.setProperty(name, v);
        else el.style[name] = v;
      }
    }
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (key === 'checked' || key === 'disabled' || key === 'draggable') el[key] = !!val;
    else el.setAttribute(key, val === true ? '' : val);
  }
  add(el, kids);
  if (value !== undefined) el.value = value; // after <option>s exist
  return el;
}

export function add(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------- icons (static, hand-written paths — safe to use innerHTML) ----- //
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 7.5A17 17 0 0 0 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  terminal: '<path d="M4 17l6-5-6-5M12 19h8"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  diff: '<path d="M12 5v14M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  server: '<rect x="2" y="2" width="20" height="6" rx="2"/><rect x="2" y="10" width="20" height="6" rx="2"/><path d="M6 6h.01M6 14h.01"/>',
};

export function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.style.width = svg.style.height = size + 'px'; }
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

export function iconBtn(name, title, onclick, extra = '') {
  return h('button', { class: 'icon-btn ' + extra, title, 'aria-label': title, onclick }, icon(name));
}

// ---------- colour helpers -------------------------------------------------- //
export function hue(text) {
  let n = 0;
  for (const ch of String(text)) n = (n * 31 + ch.charCodeAt(0)) % 360;
  return n;
}

export function avatar(name, large) {
  return h('span', {
    class: 'avatar' + (large ? ' lg' : ''),
    style: { background: `hsl(${hue(name)} 48% 44%)` },
  }, (name || '?')[0]);
}

const ENV_COLORS = { local: '#2f86a6', dev: '#b7791f', development: '#b7791f', staging: '#7c5cbf', stage: '#7c5cbf', qa: '#1f8a7a', uat: '#1f8a7a', prod: '#c43d4b', production: '#c43d4b' };
export const envColor = (name) => ENV_COLORS[name.toLowerCase()] || `hsl(${hue(name)} 45% 42%)`;
export const isProd = (name) => /^prod(uction)?$/i.test(name);

// ---------- toasts ---------------------------------------------------------- //
export function toast(message, kind = 'ok', ms = 2000) {
  const box = $('#toasts');
  const el = h('div', { class: 'toast ' + kind }, kind === 'ok' ? icon('check') : icon('alert'), message);
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

export async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(label);
}

// ---------- modal ----------------------------------------------------------- //
let overlay = null;

export function modalOpen() { return !!overlay; }

export function openModal(content, { size = '', onClose, guard } = {}) {
  closeModal(true);
  const box = h('div', { class: 'modal ' + size, role: 'dialog', 'aria-modal': 'true' }, content);
  overlay = h('div', {
    class: 'overlay',
    onMousedown: (event) => { if (event.target === overlay) closeModal(); },
  }, box);
  overlay._onClose = onClose;
  overlay._guard = guard;
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  const first = box.querySelector('[autofocus]');
  if (first) first.focus();
  return box;
}

export function closeModal(force = false) {
  if (!overlay) return true;
  if (!force && overlay._guard && !overlay._guard()) return false;
  const old = overlay;
  overlay = null;
  old.remove();
  document.body.classList.remove('modal-open');
  if (old._onClose) old._onClose();
  return true; // callers can rely on this: false means the guard kept the dialog open
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => { answered = true; closeModal(true); resolve(value); };
    openModal([
      h('div', { class: 'm-body' },
        h('div', {}, h('b', { style: { fontSize: '16px' } }, title), h('p', { class: 'muted', style: { margin: '6px 0 0' } }, message))),
      h('div', { class: 'm-foot' },
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => answer(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), autofocus: true, onclick: () => answer(true) }, confirmLabel)),
    ], { size: 'narrow', onClose: () => { if (!answered) resolve(false); } });
  });
}

// ---------- dates ----------------------------------------------------------- //
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const nowStr = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function daysBetween(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T00:00:00'), b = new Date(toYmd + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function friendlyDate(value) {
  if (!value) return '';
  const diff = daysBetween(todayStr(), value.slice(0, 10));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Date(value.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(value.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: diff < -300 || diff > 300 ? 'numeric' : undefined });
}

export function ago(iso) {
  if (!iso) return '';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  if (secs < 86400 * 30) return Math.floor(secs / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const emptyState = (emoji, title, text, ...actions) =>
  h('div', { class: 'empty' }, h('span', { class: 'big' }, emoji), h('b', {}, title), h('div', {}, text),
    actions.length ? h('div', { style: { marginTop: '12px' } }, actions) : null);
