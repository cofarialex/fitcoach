// Felületi segédfüggvények: escape, ikonok, értesítések, modális ablak, formázás

// FONTOS: minden felhasználói adatot esc()-pel írunk HTML-be (XSS védelem)
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  notebook: '<path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z"/><path d="M9 3v18M12.5 8H16M12.5 12H16"/>',
  meal: '<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v8a3 3 0 0 1-3 3M17 21V3c-2.2 1-3.5 3.5-3.5 7 0 2 1.2 3 3.5 3"/>',
  basket: '<path d="M3 9h18l-1.6 9.2A2 2 0 0 1 17.4 20H6.6a2 2 0 0 1-2-1.8z"/><path d="M8 9l4-6 4 6M9.5 13v3M14.5 13v3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  coach: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12.5 11h.01M16 11h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.3L3 9M4 13a8 8 0 0 0 14.7 4.3L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  flame: '<path d="M12 21a7 7 0 0 0 7-7c0-4-3-6.5-4-10-2 2-3 4-3 6-1-1-2-2-2.5-3.5C7 9 5 11.5 5 14a7 7 0 0 0 7 7z"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9a5 5 0 0 1 8 0l-3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.6L21 8H6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ── Értesítés ──────────────────────────────────────────────────────────
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}

export const toastError = (e) => toast(e && e.message ? e.message : String(e), 'error');

// ── Modális ablak ─────────────────────────────────────────────────────
// open({ title, body, foot, wide }) -> { el, close }
export function modal({ title, body, foot = '', wide = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Bezárás">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const first = back.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return { el: back, close };
}

export function confirmDialog(message, { okText = 'Igen', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title: 'Megerősítés',
      body: `<p>${esc(message)}</p>`,
      foot: `<button class="btn" data-close>Mégse</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`,
      onClose: () => !answered && resolve(false),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      m.close();
      resolve(true);
    });
  });
}

// Gomb "töltés" állapota hosszabb műveleteknél (pl. AI generálás)
export async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Formázás ──────────────────────────────────────────────────────────
export const fmt = (n, d = 0) => (n == null || Number.isNaN(+n) ? '–' : (+n).toLocaleString('hu-HU', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const ft = (n) => (n == null ? '–' : `${fmt(Math.round(n / 10) * 10)} Ft`);

const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dateStr(new Date());
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateStr(dt);
}
export function weekStart(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dateStr(dt);
}
const DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
export function huDate(s, { weekday = false } = {}) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${MONTHS[m - 1]} ${d}.${weekday ? ` ${DAYS[dt.getDay()]}` : ''}`;
}
export function relDay(s) {
  const t = today();
  if (s === t) return 'Ma';
  if (s === addDays(t, -1)) return 'Tegnap';
  if (s === addDays(t, 1)) return 'Holnap';
  return huDate(s, { weekday: true });
}

// Kör alakú haladásjelző (SVG)
export function ring(value, max, { color = 'var(--accent)', label = '', sub = '' } = {}) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.05;
  return `<div class="ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--bg-soft)" stroke-width="12"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="${over ? 'var(--orange)' : color}" stroke-width="12" stroke-linecap="round"
    stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" style="transition:stroke-dashoffset .6s"/></svg>
    <div class="ring-center"><b>${esc(label)}</b><span>${esc(sub)}</span></div></div>`;
}

export function macroBar(name, value, target, color) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return `<div class="macro"><div class="macro-top"><span>${esc(name)}</span><span>${fmt(value)} / ${fmt(target)} g</span></div>
    <div class="bar"><i style="width:${pct}%;background:${color}"></i></div></div>`;
}

// Nagyon egyszerű, biztonságos Markdown -> HTML (a chat válaszokhoz): **félkövér**, *dőlt*, listák, bekezdések
export function miniMarkdown(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/_(.+?)_/g, '<i>$1</i>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        if (list) html += `</${list}>`;
        html += `<${type}>`;
        list = type;
      }
      html += `<li>${inline((ul || ol)[1])}</li>`;
      continue;
    }
    if (list) {
      html += `</${list}>`;
      list = null;
    }
    if (line.trim() === '') continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    html += h ? `<p><b>${inline(h[1])}</b></p>` : `<p>${inline(line)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

// Űrlap mezőinek kiolvasása objektumba (checkbox csoportok tömbként)
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.single !== undefined) out[el.name] = el.checked;
      else {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      }
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type !== 'file') {
      out[el.name] = el.value;
    }
  }
  return out;
}

export function emptyState(iconName, title, text = '', action = '') {
  return `<div class="empty">${icon(iconName)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
