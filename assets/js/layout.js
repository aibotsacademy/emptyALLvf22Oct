/* =========================================================
   AERO — Shared layout + UI primitives
   Sidebar, top bar, breadcrumbs, role switcher, notification center,
   command search, toast (aria-live), modal, drawer, badges, KPI tiles,
   empty/error/loading states, form validation, file download.
   ========================================================= */
import { NAV, HIDDEN, PAGE, href, link, pageMeta, ROOT } from './router.js';
import { store, ROLES, getRole, setRole, fmt, esc, DEMO_NOTICE, AIRPORTS } from './data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function on(root, evt, selector, handler) {
  root.addEventListener(evt, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

/* ---------- icons (24px stroke) ---------- */
const P = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plane: '<path d="M10.5 21l1.5-1v-5.5l8 2.5v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V10l-8 5v2l8-2.5V20l1.5 1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3.5-3.5 8-8M14.7 6.3L13 4.5a4 4 0 0 0-5.6 5.6L3 14.5 6.5 18l4.4-4.4"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" stroke-dasharray="2 2.5"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-.9-1.7-1.4-3-1.4-1.8 0-3 .9-3 2.1 0 3 6 1.5 6 4.4 0 1.2-1.3 2.1-3 2.1-1.4 0-2.6-.6-3.1-1.6M12 6v1.8M12 16.4V18"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6M20 16V6" />',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  seat: '<path d="M7 3h6a2 2 0 0 1 2 2v7H7z"/><path d="M5 12h14v4H5zM7 16v5M17 16v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  collapse: '<path d="M15 6l-6 6 6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  filter: '<path d="M3 6h18M7 12h10M11 18h2"/>',
  swap: '<path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l9.5 17h-19zM12 10v4M12 17.5v.5"/>',
  doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  home: '<path d="M3 11l9-7 9 7M5 10v10h14V10"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
};
export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

/* ---------- badges ---------- */
const STATUS = {
  available: ['success', 'Available'], flying: ['info', 'Flying'], maintenance: ['warning', 'Maintenance'], aog: ['danger', 'AOG'],
  completed: ['', 'Completed'], 'in-flight': ['info', 'In flight'], confirmed: ['success', 'Confirmed'], scheduled: ['', 'Scheduled'],
  pending: ['warning', 'Pending approval'], cancelled: ['danger', 'Cancelled'], approved: ['success', 'Approved'], declined: ['danger', 'Declined'],
  candidate: ['', 'Candidate'], validated: ['info', 'Validated'], blocked: ['danger', 'Blocked'], published: ['gold', 'Published'], unpublished: ['', 'Unpublished'], converted: ['success', 'Converted'],
  new: ['info', 'New'], qualifying: ['', 'Qualifying'], quoted: ['gold', 'Quoted'], negotiating: ['warning', 'Negotiating'], won: ['success', 'Won'], lost: ['danger', 'Lost'],
  ok: ['success', 'OK'], 'due-soon': ['warning', 'Due soon'], overdue: ['danger', 'Overdue'], 'in-work': ['info', 'In work'], reviewed: ['success', 'Reviewed'], closed: ['', 'Closed'],
  draft: ['', 'Draft'], sent: ['info', 'Sent'], paid: ['success', 'Paid (demo)'],
  requested: ['warning', 'Requested'], acknowledged: ['info', 'Acknowledged'], expired: ['danger', 'Expired'], expiring: ['warning', 'Expiring'], valid: ['success', 'Valid'],
  open: ['warning', 'Open'], submitted: ['info', 'Submitted — awaiting operator'],
  charter: ['gold', 'Charter'], owner: ['info', 'Owner'], reposition: ['', 'Reposition'],
};
export function badge(status, label) {
  const [tone, text] = STATUS[status] || ['', status];
  return `<span class="badge ${tone ? 'badge-' + tone : ''}">${esc(label || text)}</span>`;
}

/* ---------- small renderers ---------- */
export function kpi({ label, value, sub = '', tone = '', spark = '', id = '' }) {
  return `<article class="kpi ${tone ? 'kpi-' + tone : ''}" ${id ? `id="${id}"` : ''}>
    <p class="kpi-label">${esc(label)}</p>
    <p class="kpi-value num">${value}</p>
    ${sub ? `<p class="kpi-sub">${sub}</p>` : ''}
    ${spark ? `<div class="kpi-spark">${spark}</div>` : ''}
  </article>`;
}

export function emptyState(text, action = '') {
  return `<div class="state state-empty" role="status">${icon('route', 28)}<p>${text}</p>${action}</div>`;
}
export function errorState(text) {
  return `<div class="state state-error" role="alert">${icon('alert', 28)}<p>${text}</p></div>`;
}
export function loadingState(rows = 3) {
  return `<div class="state-loading" aria-busy="true" aria-label="Loading">${'<div class="skeleton"></div>'.repeat(rows)}</div>`;
}

export function route(from, to) {
  return `<span class="route-pair"><b>${esc(from)}</b><span class="route-arrow" aria-hidden="true">→</span><b>${esc(to)}</b><span class="sr-only"> to </span></span>`;
}

/* ---------- toast (aria-live) ---------- */
export function toast(msg, tone = '') {
  let region = $('#toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    document.body.appendChild(region);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (tone ? 'toast-' + tone : '');
  t.textContent = msg;
  region.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}

/* ---------- overlays: modal + drawer ---------- */
let lastFocus = null;
function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container).filter((el) => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function overlay(kind, { title, body, footer = '', wide = false, onClose }) {
  closeOverlay();
  lastFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = `overlay overlay-${kind}`;
  wrap.innerHTML = `
    <div class="overlay-backdrop" data-close></div>
    <section class="${kind} ${wide ? kind + '-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="ov-title">
      <header class="${kind}-head">
        <h2 id="ov-title" class="${kind}-title">${title}</h2>
        <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('close')}</button>
      </header>
      <div class="${kind}-body">${body}</div>
      ${footer ? `<footer class="${kind}-foot">${footer}</footer>` : ''}
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const panel = wrap.querySelector('[role="dialog"]');
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOverlay(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); trapFocus(panel, e); });
  wrap._onClose = onClose;
  requestAnimationFrame(() => {
    wrap.classList.add('open');
    const focusable = panel.querySelector('input, select, textarea, button:not([data-close])') || panel.querySelector('button');
    focusable && focusable.focus();
  });
  return panel;
}
export const openModal = (o) => overlay('modal', o);
export const openDrawer = (o) => overlay('drawer', o);
export function closeOverlay() {
  $$('.overlay').forEach((o) => { o._onClose && o._onClose(); o.remove(); });
  document.body.classList.remove('no-scroll');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

/* ---------- forms ---------- */
export function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
  return out;
}
/** Native constraint validation + inline messages; returns true when valid. */
export function validate(form, extra = () => ({})) {
  let ok = true;
  $$('.field-error', form).forEach((n) => n.remove());
  $$('[aria-invalid]', form).forEach((n) => n.removeAttribute('aria-invalid'));
  const custom = extra(formValues(form)) || {};
  $$('input, select, textarea', form).forEach((el) => {
    if (!el.name) return;
    const msg = custom[el.name] || (!el.checkValidity() ? el.validationMessage : '');
    if (msg) {
      ok = false;
      el.setAttribute('aria-invalid', 'true');
      const id = 'err-' + el.name + '-' + Math.random().toString(36).slice(2, 6);
      const p = document.createElement('p');
      p.className = 'field-error'; p.id = id; p.textContent = msg;
      el.setAttribute('aria-describedby', id);
      (el.closest('.field') || el.parentElement).appendChild(p);
    }
  });
  if (!ok) { const first = $('[aria-invalid="true"]', form); first && first.focus(); }
  return ok;
}

export function download(name, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
export function toCSV(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function aircraftOptions(selected = '', filter = () => true) {
  return store.state.aircraft.filter(filter).map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.tail} · ${esc(a.model)}</option>`).join('');
}
export function airportOptions(selected = '') {
  return AIRPORTS.map((a) => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} — ${esc(a.city)}</option>`).join('');
}

/* ---------- platform shell ---------- */
function sidebarHTML() {
  const activeId = HIDDEN[PAGE] ? HIDDEN[PAGE].parent : PAGE;
  const groups = NAV.map((g) => `
    <div class="sb-group">
      <p class="sb-group-label">${g.group}</p>
      <ul role="list">
        ${g.items.map((it) => `
          <li><a class="sb-link ${it.id === activeId ? 'active' : ''}" href="${href(it.href)}" ${it.id === activeId ? 'aria-current="page"' : ''} data-tip="${it.label}">
            ${icon(it.icon)}<span class="sb-text">${it.label}</span></a></li>`).join('')}
      </ul>
    </div>`).join('');
  return `
    <div class="sb-top">
      <a class="sb-brand" href="${href('index.html')}" aria-label="AERO public site"><span class="sb-mark" aria-hidden="true">✦</span><span class="sb-text">AERO</span></a>
      <button class="sb-collapse btn btn-ghost btn-icon btn-sm" id="sb-collapse" aria-label="Collapse sidebar" aria-expanded="true">${icon('collapse')}</button>
    </div>
    <nav class="sb-nav" aria-label="Platform modules">${groups}</nav>
    <div class="sb-foot"><span class="demo-pill">Demo mode</span><p class="sb-text sb-note">Synthetic data only</p></div>`;
}

function topbarHTML() {
  const meta = pageMeta();
  const hidden = HIDDEN[PAGE];
  const parent = hidden ? pageMeta(hidden.parent) : null;
  const role = getRole();
  const unread = store.state.notifications.filter((n) => !n.read).length;
  return `
    <button class="btn btn-ghost btn-icon tb-menu" id="tb-menu" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="${href('platform/dashboard.html')}">AERO</a></li>
        ${parent ? `<li><a href="${href(parent.href)}">${parent.label}</a></li>` : ''}
        <li aria-current="page">${meta.label}</li>
      </ol>
    </nav>
    <div class="tb-actions">
      <button class="tb-search" id="tb-search" aria-label="Search (Ctrl+K)">${icon('search', 16)}<span>Search</span><kbd>⌘K</kbd></button>
      <label class="tb-role"><span class="sr-only">Demo role</span>
        <select id="role-switch" aria-label="Switch demo role">
          ${ROLES.map((r) => `<option value="${r.id}" ${r.id === role.id ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </label>
      <div class="tb-notif-wrap">
        <button class="btn btn-ghost btn-icon tb-bell" id="tb-bell" aria-label="Notifications, ${unread} unread" aria-haspopup="true" aria-expanded="false">${icon('bell')}${unread ? `<span class="dot num">${unread}</span>` : ''}</button>
        <div class="notif-pop" id="notif-pop" hidden></div>
      </div>
    </div>`;
}

function notifHTML() {
  const list = store.state.notifications.slice(0, 12);
  return `<div class="notif-head"><p><b>Notifications</b></p><button class="btn btn-ghost btn-sm" id="notif-read">Mark all read</button></div>
    <ul class="notif-list" role="list">${list.length ? list.map((n) => `
      <li><a href="${link(n.href)}" class="notif ${n.read ? '' : 'unread'}" data-nid="${n.id}">
        <span class="notif-title">${esc(n.title)}</span><span class="notif-body">${esc(n.body)}</span><span class="notif-time">${fmt.dateTime(n.at)}</span></a></li>`).join('')
      : '<li class="muted" style="padding:16px">No notifications</li>'}</ul>`;
}

export function renderShell() {
  const sb = $('#sidebar');
  const tb = $('#topbar');
  if (!sb || !tb) return;
  sb.innerHTML = sidebarHTML();
  tb.innerHTML = topbarHTML();
  const banner = $('#demo-banner');
  if (banner) banner.innerHTML = `<span class="demo-pill">Demo</span><span>${DEMO_NOTICE} Role: <b>${esc(getRole().label)}</b> (simulated — no authentication).</span><a href="${href('platform/settings.html')}#reset">Reset data</a>`;

  // collapse state
  let collapsed = false;
  try { collapsed = localStorage.getItem('aero-sb') === '1'; } catch { /* noop */ }
  const app = $('#app');
  app.classList.toggle('sb-collapsed', collapsed);
  const collapseBtn = $('#sb-collapse');
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  collapseBtn.addEventListener('click', () => {
    const c = !app.classList.contains('sb-collapsed');
    app.classList.toggle('sb-collapsed', c);
    collapseBtn.setAttribute('aria-expanded', String(!c));
    collapseBtn.setAttribute('aria-label', c ? 'Expand sidebar' : 'Collapse sidebar');
    try { localStorage.setItem('aero-sb', c ? '1' : '0'); } catch { /* noop */ }
  });

  // mobile off-canvas
  const menuBtn = $('#tb-menu');
  const scrim = document.createElement('div');
  scrim.className = 'sb-scrim';
  app.appendChild(scrim);
  const setOpen = (o) => { app.classList.toggle('sb-open', o); menuBtn.setAttribute('aria-expanded', String(o)); if (o) $('.sb-link', sb)?.focus(); };
  menuBtn.addEventListener('click', () => setOpen(!app.classList.contains('sb-open')));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.classList.contains('sb-open')) { setOpen(false); menuBtn.focus(); } });

  // role switch
  $('#role-switch').addEventListener('change', (e) => {
    const r = ROLES.find((x) => x.id === e.target.value);
    setRole(r.id);
    store.audit('Switched demo role', r.label);
    store.save(false);
    location.reload();
  });

  // notifications
  const bell = $('#tb-bell'), pop = $('#notif-pop');
  const closePop = () => { pop.hidden = true; bell.setAttribute('aria-expanded', 'false'); };
  const drawPop = () => {
    pop.innerHTML = notifHTML();
    $('#notif-read', pop).addEventListener('click', (ev) => {
      ev.stopPropagation();
      store.state.notifications.forEach((n) => (n.read = true));
      store.save();
      bell.querySelector('.dot')?.remove();
      bell.setAttribute('aria-label', 'Notifications, 0 unread');
      drawPop();
      toast('All notifications marked as read');
    });
    $$('.notif', pop).forEach((a) => a.addEventListener('click', () => { const n = store.find('notifications', a.dataset.nid); if (n) { n.read = true; store.save(false); } }));
  };
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = pop.hidden;
    if (open) drawPop();
    pop.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.tb-notif-wrap')) closePop(); });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); bell.focus(); } });

  // command search
  $('#tb-search').addEventListener('click', openCommand);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommand(); }
    else if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !$('.overlay')) { e.preventDefault(); openCommand(); }
  });
}

/* ---------- command search ---------- */
function commandIndex() {
  const s = store.state;
  const pages = NAV.flatMap((g) => g.items).map((p) => ({ kind: 'Page', label: p.label, href: href(p.href), hint: '' }));
  const aircraft = s.aircraft.map((a) => ({ kind: 'Aircraft', label: `${a.tail} · ${a.model}`, href: href('platform/aircraft-detail.html?id=' + a.id), hint: a.base }));
  const trips = s.trips.filter((t) => t.status !== 'completed').slice(0, 60).map((t) => ({ kind: 'Trip', label: `${t.id} ${t.from} → ${t.to}`, href: href('platform/operations.html?trip=' + t.id), hint: fmt.date(t.depart) }));
  const customers = s.customers.map((c) => ({ kind: 'Customer', label: c.name, href: href('platform/charter-crm.html?customer=' + c.id), hint: c.type }));
  const crew = s.crew.map((c) => ({ kind: 'Crew', label: c.name, href: href('platform/crew.html?crew=' + c.id), hint: c.role }));
  return pages.concat(aircraft, trips, customers, crew);
}
function openCommand() {
  const idx = commandIndex();
  const panel = openModal({
    title: 'Search AERO',
    body: `<div class="cmd">
      <label class="field"><span class="sr-only">Search pages, aircraft, trips, customers, crew</span>
        <input type="search" id="cmd-input" placeholder="Pages, tail numbers, trip IDs, customers, crew…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmd-list" /></label>
      <ul id="cmd-list" class="cmd-list" role="listbox"></ul>
      <p class="muted cmd-hint">↑ ↓ to move · Enter to open · Esc to close</p></div>`,
  });
  const input = $('#cmd-input', panel), list = $('#cmd-list', panel);
  let active = 0, results = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    results = (q ? idx.filter((r) => (r.label + ' ' + r.hint + ' ' + r.kind).toLowerCase().includes(q)) : idx.slice(0, 14)).slice(0, 30);
    active = Math.min(active, Math.max(0, results.length - 1));
    list.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === active}"><a href="${r.href}" class="cmd-item ${i === active ? 'active' : ''}"><span class="cmd-kind">${r.kind}</span><span>${esc(r.label)}</span><span class="muted">${esc(r.hint)}</span></a></li>`).join('') : '<li class="muted" style="padding:12px">No matches</li>';
    input.setAttribute('aria-activedescendant', results.length ? 'cmd-' + active : '');
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    if (e.key === 'Enter' && results[active]) { location.href = results[active].href; }
  });
  draw();
}

export { ROOT };
