/* =========================================================
   AERO — Page modules
   One init function per page (see PAGES map at the bottom).
   All data is synthetic (data.js). Every state change goes through
   `store` so dashboards update across modules and the audit trail
   records who (demo role) did what.
   ========================================================= */
import {
  store, fmt, esc, uid, AIRPORTS, CLASSES, REGIONS, airport, distanceNm, estHours,
  detectRepositioning, recommendPrice, validateLeg, demandScore, findConflicts, can, getRole, ROLES, setRole, T, DEMO_NOTICE,
} from './data.js';
import { href, link, param, INTEGRATIONS, NAV } from './router.js';
import {
  $, $$, on, icon, badge, kpi, emptyState, errorState, loadingState, route, toast, openModal, openDrawer, closeOverlay,
  formValues, validate, download, toCSV, aircraftOptions, airportOptions,
} from './layout.js';
import { mount, lineChart, barChart, hBars, donut, sparkline, funnel, worldMap } from './charts.js';
import { splitTitle, initParticles, reducedMotion } from './motion.js';
import { img, photoForClass } from './media.js';
const acPhoto = (a, w = 800) => img(photoForClass(a.cls, parseInt(a.id.replace(/\D/g, ''), 10) || 0), { cls: 'ac-photo zoom-target', sizes: '(max-width: 700px) 100vw, 360px', w });

const { DAY, HOUR } = T;
const S = () => store.state;
const acBy = (id) => S().aircraft.find((a) => a.id === id);
const custBy = (id) => S().customers.find((c) => c.id === id);
const crewBy = (id) => S().crew.find((c) => c.id === id);
const ownerBy = (id) => S().owners.find((o) => o.id === id);
const city = (code) => (airport(code) || {}).city || code;
const ts = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getTime();
const todayISO = () => new Date().toISOString().slice(0, 10);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const JET = `<svg class="ac-sil" viewBox="0 0 810 210" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M28 132C40 116 78 104 140 100L560 96C610 96 650 100 690 108L744 54C750 48 758 46 766 46L784 46C788 46 790 50 788 54L752 118C746 128 730 134 700 136L150 142C90 142 46 140 28 132Z"/>
  <path fill="currentColor" d="M736 50L800 40L804 48L744 60Z"/>
  <path fill="currentColor" d="M560 78C560 68 572 62 590 62L660 62C676 62 684 68 684 76C684 84 676 90 660 90L590 90C572 90 560 86 560 78Z"/>
  <path fill="currentColor" d="M600 90L620 98L650 98L640 90Z"/>
  <path fill="currentColor" opacity=".72" d="M330 134L470 132L560 190C562 194 558 196 552 196L528 196Z"/>
  <path fill="currentColor" opacity=".72" d="M548 196L566 170L572 172L560 198Z"/>
  <g fill="#0B1626" opacity=".85"><rect x="200" y="106" width="14" height="17" rx="6"/><rect x="238" y="106" width="14" height="17" rx="6"/><rect x="276" y="106" width="14" height="17" rx="6"/><rect x="314" y="105" width="14" height="17" rx="6"/><rect x="352" y="105" width="14" height="17" rx="6"/><rect x="390" y="105" width="14" height="17" rx="6"/><rect x="428" y="104" width="14" height="17" rx="6"/><rect x="466" y="104" width="14" height="17" rx="6"/><path d="M70 116C84 108 104 104 124 104L128 116Z"/></g>
  <path fill="none" stroke="#C9A76A" stroke-width="2" d="M60 128C200 124 500 120 722 113"/></svg>`;

/* ---------- domain helpers ---------- */
function tripsFor(acId) { return S().trips.filter((t) => t.aircraftId === acId && t.status !== 'cancelled'); }

function upcoming(days = 7, filter = () => true) {
  const now = Date.now(), end = now + days * DAY;
  return S().trips.filter((t) => t.status !== 'cancelled' && ts(t.arrive) > now && ts(t.depart) < end && filter(t)).sort((a, b) => ts(a.depart) - ts(b.depart));
}

function hoursFlown(acId, from, to = Date.now()) {
  return S().trips.filter((t) => (!acId || t.aircraftId === acId) && t.status === 'completed' && ts(t.depart) >= from && ts(t.depart) <= to).reduce((s, t) => s + t.hours, 0);
}

/** Estimated trip economics (simulated). Charter billed at rate card; owner trips billed at cost + 15% mgmt fee. */
function econ(t) {
  const ac = acBy(t.aircraftId);
  if (!ac) return { revenue: 0, cost: 0, margin: 0 };
  const fuel = S().settings.fuelPrice;
  const variable = t.hours * (ac.burnGph * fuel + CLASSES[ac.cls].reserve);
  const fees = t.type === 'reposition' ? 250 : 650;
  const crewCost = Math.max(1, Math.ceil(t.hours / 10)) * 1800;
  const cost = Math.round(variable + fees + crewCost);
  let revenue = 0;
  if (t.type === 'charter') revenue = Math.round(t.hours * ac.hourlyRate);
  else if (t.type === 'owner') revenue = Math.round(cost * 1.15);
  const leg = S().emptyLegs.find((l) => l.tripId === t.id && (l.status === 'converted'));
  if (t.type === 'reposition' && leg && leg.listPrice) revenue = leg.listPrice;
  return { revenue, cost, margin: revenue - cost, pct: revenue ? (revenue - cost) / revenue : 0 };
}

function locationOf(acId) {
  const now = Date.now();
  const list = tripsFor(acId).filter((t) => ts(t.depart) <= now).sort((a, b) => ts(b.depart) - ts(a.depart));
  const last = list[0];
  if (!last) return { code: acBy(acId).base, airborne: false };
  if (ts(last.arrive) > now) return { code: last.from, airborne: true, trip: last };
  return { code: last.to, airborne: false };
}

function mxState(m) {
  if (m.state === 'closed') return 'closed';
  if (m.state === 'reviewed') return 'reviewed';
  if (m.state === 'in-work') return 'in-work';
  const ac = acBy(m.aircraftId);
  const days = fmt.daysFromNow(m.dueDate);
  const hrsLeft = m.dueHours - (ac ? ac.totalTime : 0);
  if (days < 0 || hrsLeft <= 0) return 'overdue';
  if (days <= 30 || hrsLeft <= 25) return 'due-soon';
  return 'ok';
}

function expiry(date) {
  const d = fmt.daysFromNow(date);
  return d < 0 ? 'expired' : d <= 30 ? 'expiring' : 'valid';
}

function groundingFlags(acId) {
  const ac = acBy(acId);
  const flags = [];
  if (ac.status === 'aog') flags.push('Aircraft marked AOG');
  if (ac.status === 'maintenance') flags.push('Aircraft in scheduled maintenance');
  S().maintenance.filter((m) => m.aircraftId === acId && m.grounding && ['overdue', 'in-work'].includes(mxState(m))).forEach((m) => flags.push(`${m.item} — ${mxState(m)}`));
  return flags;
}

function conflictTripIds() { return new Set(findConflicts(S()).map((c) => c.tripId)); }

function crewDutyPeriods(crewId) {
  const periods = S().trips.filter((t) => t.crew.includes(crewId) && t.status !== 'cancelled').map((t) => ({ start: ts(t.depart) - HOUR, end: ts(t.arrive) + HOUR / 2, src: t.id }));
  (crewBy(crewId)?.manualDuty || []).forEach((d) => periods.push({ start: ts(d.start), end: ts(d.end), src: 'manual' }));
  return periods.sort((a, b) => a.start - b.start);
}

function trendSpark(acId, weeks = 8) {
  const out = [];
  const now = Date.now();
  for (let w = weeks - 1; w >= 0; w--) out.push(hoursFlown(acId, now - (w + 1) * 7 * DAY, now - w * 7 * DAY));
  return out;
}

function acLabel(ac) { return ac ? `${ac.tail} · ${ac.model}` : '—'; }

function guard(action, msg) {
  if (can(action)) return true;
  toast(msg || `Your demo role (${getRole().label}) can’t do that. Switch role in the top bar.`, 'danger');
  return false;
}

/* ---------- shared trip drawer (dashboard, operations, aircraft, owner) ---------- */
export function openTrip(tripId, onChange = () => {}) {
  const t = S().trips.find((x) => x.id === tripId);
  if (!t) { toast('Trip not found', 'danger'); return; }
  const ac = acBy(t.aircraftId);
  const conflicts = findConflicts(S()).filter((c) => c.tripId === t.id || c.text.includes(t.id));
  const e = econ(t);
  const party = t.customerId ? custBy(t.customerId)?.name : t.ownerId ? ownerBy(t.ownerId)?.name + ' (owner)' : '—';
  const crewRows = t.crew.map((cid) => { const c = crewBy(cid); if (!c) return ''; const rated = c.ratings.includes(ac.model) || c.role === 'Flight Attendant'; return `<li><span class="grow">${esc(c.name)} <span class="meta">· ${c.role}</span></span>${rated ? badge('valid', 'Rated') : badge('expired', 'Not rated on type')} ${expiry(c.medicalExp) === 'expired' ? badge('expired', 'Medical expired') : ''}</li>`; }).join('') || '<li class="meta">No crew assigned</li>';
  const upcomingTrip = ts(t.arrive) > Date.now() && t.status !== 'cancelled';
  const qualified = S().crew.filter((c) => c.ratings.includes(ac.model) || c.role === 'Flight Attendant');
  const alts = S().aircraft.filter((a) => a.id !== ac.id && !['aog', 'maintenance'].includes(a.status) && a.pax >= t.pax && a.rangeNm >= distanceNm(t.from, t.to));

  const body = `
    ${conflicts.length ? `<div class="notice" style="margin-bottom:14px">${icon('alert', 16)}<div>${conflicts.map((c) => esc(c.text)).join('<br>')}</div></div>` : ''}
    <dl class="dl">
      <dt>Route</dt><dd>${route(t.from, t.to)} <span class="muted">${esc(city(t.from))} → ${esc(city(t.to))}</span></dd>
      <dt>Aircraft</dt><dd><a href="${href('platform/aircraft-detail.html?id=' + ac.id)}">${esc(acLabel(ac))}</a> ${badge(ac.status)}</dd>
      <dt>Departs</dt><dd>${fmt.dateLong(t.depart)} · ${fmt.time(t.depart)}</dd>
      <dt>Arrives (est.)</dt><dd>${fmt.time(t.arrive)} · ${fmt.hours(t.hours)} block · ${fmt.dist(distanceNm(t.from, t.to))}</dd>
      <dt>Type</dt><dd>${badge(t.type)} ${t.pax ? plural(t.pax, 'passenger') : 'No passengers'}</dd>
      <dt>Client</dt><dd>${esc(party)}</dd>
      <dt>Trip status</dt><dd>${badge(t.status)} <span class="muted">Operator approval: </span>${badge(t.approval || 'approved')}</dd>
      <dt>Economics <span class="sim">Sim</span></dt><dd>Revenue ${fmt.money(e.revenue)} · Cost ${fmt.money(e.cost)} · Margin <b>${fmt.money(e.margin)}</b></dd>
      <dt>Ground handling</dt><dd>${t.fbo ? `${esc(t.fbo.handler)} at ${t.fbo.station} — ${esc(t.fbo.items.join(', '))} ${badge(t.fbo.status)}` : '<span class="muted">No request</span>'}</dd>
    </dl>
    <h3 class="card-title" style="margin:18px 0 6px">Crew</h3>
    <ul class="list">${crewRows}</ul>
    ${upcomingTrip ? `
      <form id="trip-edit" class="form-grid" style="margin-top:16px">
        <label class="field span-2"><span>Assign crew (qualified on ${esc(ac.model)})</span>
          <select name="crew" multiple size="4">${qualified.map((c) => `<option value="${c.id}" ${t.crew.includes(c.id) ? 'selected' : ''}>${esc(c.name)} — ${c.role}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Reassign aircraft</span>
          <select name="aircraft"><option value="">Keep ${esc(ac.tail)}</option>${alts.map((a) => `<option value="${a.id}">${a.tail} · ${esc(a.model)} (${a.base})</option>`).join('')}</select></label>
      </form>` : ''}
    <p class="notice info" style="margin-top:16px">${icon('alert', 16)}<span>Approvals here record an operator decision in the demo. They are not a dispatch release, and do not verify crew legality, airworthiness or flight feasibility.</span></p>`;

  const footer = upcomingTrip ? `
    ${t.approval === 'pending' ? `<button class="btn btn-danger" data-act="decline">Decline</button><button class="btn btn-primary" data-act="approve">Approve trip</button>` : ''}
    ${t.approval !== 'pending' && t.status === 'scheduled' ? `<button class="btn btn-primary" data-act="confirm">Mark confirmed</button>` : ''}
    <button class="btn" data-act="save">Save changes</button>
    <button class="btn btn-ghost" data-act="cancel">Cancel trip</button>` : '<button class="btn" data-close>Close</button>';

  const panel = openDrawer({ title: `Trip ${t.id}`, body, footer, wide: true });
  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'approve' || act === 'decline' || act === 'confirm' || act === 'cancel') {
      if (!guard('approveTrip')) return;
      const patch = act === 'approve' ? { approval: 'approved', status: 'confirmed' } : act === 'decline' ? { approval: 'declined', status: 'cancelled' } : act === 'confirm' ? { status: 'confirmed' } : { status: 'cancelled' };
      store.update('trips', t.id, patch, `Trip ${act}${act.endsWith('e') ? 'd' : 'ed'}`.replace('canceled', 'cancelled'));
      toast(`Trip ${t.id} ${patch.status}`, act === 'decline' || act === 'cancel' ? 'danger' : 'success');
      closeOverlay(); onChange(); return;
    }
    if (act === 'save') {
      if (!guard('approveTrip')) return;
      const f = $('#trip-edit', panel);
      const crew = Array.from(f.crew.selectedOptions).map((o) => o.value);
      const newAc = f.aircraft.value;
      const patch = { crew };
      if (newAc) {
        const na = acBy(newAc);
        const hours = estHours(na, t.from, t.to);
        Object.assign(patch, { aircraftId: newAc, hours, arrive: new Date(ts(t.depart) + hours * HOUR).toISOString(), crew: crew.filter((cid) => crewBy(cid)?.ratings.includes(na.model) || crewBy(cid)?.role === 'Flight Attendant') });
      }
      store.update('trips', t.id, patch, newAc ? `Trip reassigned to ${acBy(newAc).tail}` : 'Trip crew updated');
      const after = findConflicts(S()).filter((c) => c.tripId === t.id || c.text.includes(t.id));
      toast(after.length ? `Saved — ${plural(after.length, 'conflict')} remain` : 'Saved — no conflicts on this trip', after.length ? 'danger' : 'success');
      closeOverlay(); onChange();
    }
  });
}

/* ---------- original AERO airport suggest (shared by empty-legs, marketplace, passenger) ---------- */
export function airportSuggest(input, dropdown, onPick) {
  let idx = -1;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const list = AIRPORTS.filter((a) => !q || a.code.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 8);
    dropdown.innerHTML = list.map((a, i) => `<button type="button" class="fp-option" role="option" aria-selected="${i === idx}" data-code="${a.code}"><b>${a.code}</b><span>${esc(a.city)} <span class="muted">· ${esc(a.name)}</span></span></button>`).join('') || '<p class="muted" style="padding:10px 12px">No airports</p>';
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.addEventListener('input', () => { idx = -1; draw(); });
  input.addEventListener('focus', draw);
  input.addEventListener('keydown', (e) => {
    const opts = $$('.fp-option', dropdown);
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(opts.length - 1, idx + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); }
    else if (e.key === 'Enter' && idx >= 0 && opts[idx]) { e.preventDefault(); pick(opts[idx].dataset.code); }
    else if (e.key === 'Escape') { dropdown.hidden = true; }
  });
  const pick = (code) => { input.value = code; input.dataset.code = code; dropdown.hidden = true; input.setAttribute('aria-expanded', 'false'); onPick(code); };
  dropdown.addEventListener('mousedown', (e) => { const b = e.target.closest('.fp-option'); if (b) { e.preventDefault(); pick(b.dataset.code); } });
  input.addEventListener('blur', () => setTimeout(() => {
    dropdown.hidden = true; input.setAttribute('aria-expanded', 'false');
    const v = input.value.trim().toUpperCase();
    const match = AIRPORTS.find((a) => a.code === v || a.city.toUpperCase() === v);
    input.dataset.code = match ? match.code : '';
    if (!v) input.dataset.code = '';
    onPick(input.dataset.code);
  }, 120));
}

function pressGroup(container, attr, onSelect) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest(`[${attr}]`);
    if (!b || !container.contains(b)) return;
    $$(`[${attr}]`, container).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onSelect(b.getAttribute(attr), b);
  });
}

/* =========================================================
   HOME (public marketing site)
   ========================================================= */
export function initHome() {
  // load-in choreography
  requestAnimationFrame(() => document.body.classList.add('is-loaded'));
  splitTitle($('#hero-title'));
  initParticles($('#particle-canvas'));

  // original hero video: keep file.mp4, autoplay muted loop playsinline, graceful fallback
  const video = $('#hero-video');
  const toggle = $('#video-toggle');
  if (video) {
    const ready = () => { video.classList.add('is-ready'); toggle.hidden = false; };
    video.addEventListener('loadeddata', ready);
    if (video.readyState >= 2) ready();
    const sources = $$('source', video);
    const fail = () => { video.remove(); toggle.remove(); };
    sources[sources.length - 1].addEventListener('error', fail);
    // sources may already have failed before this module ran
    if (video.networkState === 3) fail();
    if (reducedMotion()) {
      video.pause();
      toggle.textContent = 'Play video'; toggle.setAttribute('aria-pressed', 'true');
    }
    toggle.addEventListener('click', () => {
      if (video.paused) { video.play().catch(() => {}); toggle.textContent = 'Pause video'; toggle.setAttribute('aria-pressed', 'false'); }
      else { video.pause(); toggle.textContent = 'Play video'; toggle.setAttribute('aria-pressed', 'true'); }
    });
    // pause when hero is off-screen to save battery
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) video.pause();
      else if (toggle.getAttribute('aria-pressed') === 'false' && !reducedMotion()) video.play().catch(() => {});
    }).observe(video);
  }

  // mobile nav
  const navBtn = $('#nav-toggle'), nav = $('#site-nav');
  navBtn.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    navBtn.setAttribute('aria-expanded', String(open));
  });
  $$('a', nav).forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }));

  // light shift hover (cursor-following glow)
  $$('.light-shift').forEach((el) => el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true }));

  // interactive dashboard preview (real synthetic dataset)
  const pv = $('#pv-body');
  const views = {
    fleet() {
      const s = S();
      const avail = s.aircraft.filter((a) => a.status === 'available').length;
      const next7 = upcoming(7).length;
      const legs = s.emptyLegs.filter((l) => ['candidate', 'validated', 'published'].includes(l.status)).length;
      const util = s.aircraft.map((a) => ({ label: a.tail, value: Math.round(hoursFlown(a.id, Date.now() - 90 * DAY)), target: Math.round(a.targetHours * 90 / 365) })).sort((a, b) => b.value - a.value).slice(0, 7);
      return `<div class="pv-grid">
        <div class="pv-kpi"><span>Aircraft</span><b>${s.aircraft.length}</b></div>
        <div class="pv-kpi"><span>Available now</span><b>${avail}</b></div>
        <div class="pv-kpi"><span>Trips · next 7 days</span><b>${next7}</b></div>
        <div class="pv-kpi"><span>Empty-leg opportunities</span><b>${legs}</b></div></div>
        <div class="pv-two"><div class="pv-panel"><h4>Hours flown · last 90 days (bar) vs target pace (tick)</h4>${hBars(util, { format: (v) => v + ' h' })}</div>
        <div class="pv-panel"><h4>Fleet status</h4>${donut({ items: ['available', 'maintenance', 'aog'].map((st, i) => ({ label: { available: 'Available', maintenance: 'Maintenance', aog: 'AOG' }[st], value: s.aircraft.filter((a) => a.status === st).length, color: ['var(--success)', 'var(--warning)', 'var(--danger)'][i] })), center: String(avail), sub: 'AVAILABLE', size: 140 })}</div></div>`;
    },
    revenue() {
      const weeks = [];
      const now = Date.now();
      for (let w = 11; w >= 0; w--) {
        const from = now - (w + 1) * 7 * DAY, to = now - w * 7 * DAY;
        const trips = S().trips.filter((t) => t.status === 'completed' && ts(t.depart) >= from && ts(t.depart) < to);
        weeks.push({ label: fmt.date(new Date(to).toISOString()), rev: trips.reduce((s, t) => s + econ(t).revenue, 0), cost: trips.reduce((s, t) => s + econ(t).cost, 0) });
      }
      const total = weeks.reduce((s, w) => s + w.rev, 0), cost = weeks.reduce((s, w) => s + w.cost, 0);
      return `<div class="pv-grid">
        <div class="pv-kpi"><span>Revenue · 12 weeks <span class="sim">Sim</span></span><b>${fmt.money(total, { compact: true })}</b></div>
        <div class="pv-kpi"><span>Direct cost</span><b>${fmt.money(cost, { compact: true })}</b></div>
        <div class="pv-kpi"><span>Gross margin</span><b>${fmt.pct(total ? (total - cost) / total : 0)}</b></div>
        <div class="pv-kpi"><span>Avg / week</span><b>${fmt.money(total / 12, { compact: true })}</b></div></div>
        <div class="pv-panel"><h4>Weekly revenue vs direct cost</h4><div id="pv-chart" class="chart-box"></div></div>`;
    },
    legs() {
      const legs = S().emptyLegs.filter((l) => l.status !== 'converted').slice(0, 5);
      return `<div class="pv-panel"><h4>Empty-leg engine · detected repositioning</h4><ul class="list">${legs.map((l) => {
        const r = recommendPrice(S(), l); const ac = acBy(l.aircraftId);
        return `<li><span class="grow"><span class="title">${route(l.from, l.to)}</span><span class="meta"> · ${esc(ac.tail)} · ${fmt.dateTime(l.depart)}</span></span><span class="meta">Demand ${r.demand.score}</span><b class="num">${fmt.money(l.listPrice || r.recommended)}</b>${badge(l.status)}</li>`;
      }).join('')}</ul><p class="muted" style="font-size:12px;margin-top:10px">Prices are recommendations with visible assumptions; publishing requires approval.</p></div>`;
    },
  };
  const tabs = $$('.preview-tabs [role="tab"]');
  const show = (view) => {
    tabs.forEach((t) => { const sel = t.dataset.view === view; t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1; if (sel) pv.setAttribute('aria-labelledby', t.id); });
    pv.innerHTML = views[view]();
    if (view === 'revenue') {
      const weeks = [];
      const now = Date.now();
      for (let w = 11; w >= 0; w--) {
        const from = now - (w + 1) * 7 * DAY, to = now - w * 7 * DAY;
        const trips = S().trips.filter((t) => t.status === 'completed' && ts(t.depart) >= from && ts(t.depart) < to);
        weeks.push([fmt.date(new Date(to).toISOString()), trips.reduce((s, t) => s + econ(t).revenue, 0), trips.reduce((s, t) => s + econ(t).cost, 0)]);
      }
      mount($('#pv-chart'), (w) => lineChart({ width: w, height: 220, labels: weeks.map((x) => x[0]), series: [{ name: 'Revenue', values: weeks.map((x) => x[1]) }, { name: 'Direct cost', values: weeks.map((x) => x[2]) }], format: (v) => fmt.money(v, { compact: true }), label: 'Weekly revenue vs cost' }));
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.view));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        n.focus(); show(n.dataset.view);
      }
    });
  });
  show('fleet');

  // persona tabs (vertical, arrow-key navigable)
  const ptabs = $$('.persona-tabs [role="tab"]');
  const selectPersona = (tab) => {
    ptabs.forEach((t) => { const sel = t === tab; t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !sel; });
  };
  ptabs.forEach((t, i) => {
    t.addEventListener('click', () => selectPersona(t));
    t.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const n = ptabs[(i + dir + ptabs.length) % ptabs.length];
        n.focus(); selectPersona(n);
      }
    });
  });

  // demo request form (stored locally; nothing is sent)
  const form = $('#demo-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = validate(form, (v) => (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? { email: 'Enter a valid work email' } : {}));
    if (!ok) return;
    const v = formValues(form);
    S().demoRequests.unshift({ id: uid('dr'), at: new Date().toISOString(), ...v });
    store.audit('Demo request captured (local only)', v.company);
    store.save();
    $('#demo-result').innerHTML = `<div class="form-ok">Thank you, ${esc(v.name.split(' ')[0])}. This is a prototype, so your request for a ${v.meeting === 'Virtual' ? 'virtual walkthrough' : 'meeting at NBAA-BACE'} was saved only in this browser — nothing was sent.</div>`;
    form.reset();
  });
}

/* =========================================================
   DASHBOARD — Operations command center
   ========================================================= */
function dayGantt(dayStart, { onlyActive = false } = {}) {
  const dayEnd = dayStart + DAY;
  const now = Date.now();
  const conflicts = conflictTripIds();
  const pos = (t) => Math.max(0, Math.min(100, ((t - dayStart) / DAY) * 100));
  const rows = S().aircraft.map((ac) => {
    const trips = tripsFor(ac.id).filter((t) => ts(t.arrive) > dayStart && ts(t.depart) < dayEnd);
    if (onlyActive && !trips.length && ac.status === 'available') return '';
    const bars = trips.map((t) => {
      const l = pos(ts(t.depart)), r = pos(ts(t.arrive));
      return `<button class="gantt-bar ${t.type} ${conflicts.has(t.id) ? 'conflict' : ''}" style="left:${l}%;width:${Math.max(2.5, r - l)}%" data-trip="${t.id}" aria-label="${t.id} ${t.from} to ${t.to}, ${fmt.time(t.depart)} to ${fmt.time(t.arrive)}${conflicts.has(t.id) ? ', conflict' : ''}">${t.from}–${t.to}</button>`;
    }).join('');
    const mx = ['maintenance', 'aog'].includes(ac.status) ? '<span class="gantt-mx" title="Maintenance / AOG"></span>' : '';
    const nowLine = now >= dayStart && now < dayEnd ? `<span class="gantt-now" style="left:${pos(now)}%" aria-hidden="true"></span>` : '';
    return `<div class="gantt-row"><a class="gantt-label" href="${href('platform/aircraft-detail.html?id=' + ac.id)}">${ac.tail} <span class="muted">${ac.model.split(' ')[0]}</span></a><div class="gantt-track">${mx}${bars}${nowLine}</div></div>`;
  }).join('');
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${String(h).padStart(2, '0')}</span>`).join('');
  return `<div class="gantt-scroll"><div class="gantt"><div class="gantt-hours"><span></span><div class="ticks">${ticks}</div></div>${rows || emptyState('No aircraft activity')}</div></div>`;
}

function dashboard() {
  const draw = () => {
    const s = S();
    const now = Date.now();
    const avail = s.aircraft.filter((a) => a.status === 'available').length;
    const next7 = upcoming(7);
    const openLegs = s.emptyLegs.filter((l) => ['candidate', 'validated', 'published'].includes(l.status));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const mtd = s.trips.filter((t) => t.status === 'completed' && ts(t.depart) >= monthStart.getTime()).reduce((sum, t) => sum + econ(t).revenue, 0);
    const hrs30 = hoursFlown(null, now - 30 * DAY);
    const pace30 = s.aircraft.reduce((sum, a) => sum + a.targetHours * 30 / 365, 0);
    const weekly = trendSpark(null, 8);

    $('#kpis').innerHTML = [
      kpi({ label: 'Aircraft managed', value: s.aircraft.length, sub: `${s.aircraft.filter((a) => a.status === 'aog').length} AOG · ${s.aircraft.filter((a) => a.status === 'maintenance').length} in maintenance` }),
      kpi({ label: 'Available now', value: `${avail}<small class="muted" style="font-size:1rem">/${s.aircraft.length}</small>`, sub: 'From aircraft status records', tone: avail < s.aircraft.length / 2 ? 'danger' : '' }),
      kpi({ label: 'Flights · next 7 days', value: next7.length, sub: `${next7.filter((t) => t.approval === 'pending').length} awaiting approval` }),
      kpi({ label: 'Empty-leg opportunities', value: openLegs.length, sub: `${openLegs.filter((l) => l.status === 'published').length} published`, tone: 'gold' }),
      kpi({ label: 'Revenue · month to date', value: fmt.money(mtd, { compact: true }) + '<span class="sim">Sim</span>', sub: 'Completed trips, rate card' }),
      kpi({ label: 'Fleet hours · 30 days', value: Math.round(hrs30), sub: `${fmt.pct(hrs30 / pace30)} of target pace`, spark: sparkline(weekly) }),
    ].join('');

    $('#today-label').textContent = fmt.dateLong(new Date().toISOString());
    $('#today-gantt').innerHTML = dayGantt(T.startOfToday().getTime());

    // map: aircraft positions derived from schedule (not live)
    mount($('#fleet-map'), (w) => worldMap({
      width: w, bounds: [-128, 56, 62, 2],
      markers: s.aircraft.map((a) => { const l = locationOf(a.id); return { code: l.code, label: `${a.tail} · ${l.airborne ? 'airborne (scheduled)' : 'on ground'} · ${a.status}`, tone: a.status === 'aog' ? 'danger' : a.status === 'maintenance' ? 'warning' : l.airborne ? 'info' : 'success' }; }),
      routes: upcoming(1).map((t) => ({ from: t.from, to: t.to, title: `${t.id} ${acBy(t.aircraftId).tail}`, tone: t.type === 'reposition' ? 'muted' : 'gold', dashed: t.type === 'reposition' })),
      label: 'Schematic fleet map from scheduled positions',
    }));

    $('#upcoming').innerHTML = next7.length ? `<ul class="list">${next7.slice(0, 8).map((t) => `
      <li><button class="btn btn-ghost btn-sm" data-trip="${t.id}" aria-label="Open trip ${t.id}">${icon('arrow', 14)}</button>
        <span class="grow"><span class="title">${route(t.from, t.to)}</span><span class="meta"> · ${acBy(t.aircraftId).tail} · ${fmt.dateTime(t.depart)}</span></span>
        ${badge(t.type)} ${badge(t.approval === 'pending' ? 'pending' : t.status)}</li>`).join('')}</ul>` : emptyState('No flights in the next 7 days');

    const legs = openLegs.map((l) => ({ l, r: recommendPrice(s, l) })).sort((a, b) => b.r.demand.score - a.r.demand.score).slice(0, 4);
    $('#opps').innerHTML = legs.length ? `<ul class="list">${legs.map(({ l, r }) => `
      <li><span class="grow"><span class="title">${route(l.from, l.to)}</span><span class="meta"> · ${acBy(l.aircraftId).tail} · ${fmt.dateTime(l.depart)}</span></span>
      <span class="meta">Demand ${r.demand.score}</span><b class="num">${fmt.money(l.listPrice || r.recommended)}</b>${badge(l.status)}</li>`).join('')}</ul>` : emptyState('No open repositioning legs', `<a class="btn btn-sm" href="empty-legs.html">Run detection</a>`);

    const alerts = [];
    findConflicts(s).slice(0, 4).forEach((c) => alerts.push({ tone: 'danger', text: c.text, href: 'operations.html?trip=' + c.tripId }));
    s.aircraft.forEach((a) => { const f = groundingFlags(a.id); if (f.length) alerts.push({ tone: a.status === 'aog' ? 'danger' : 'warning', text: `${a.tail}: ${f[0]}`, href: 'maintenance.html' }); });
    s.crew.forEach((c) => { if (expiry(c.medicalExp) === 'expired') alerts.push({ tone: 'danger', text: `${c.name}: medical expired ${fmt.date(c.medicalExp)}`, href: 'crew.html?crew=' + c.id }); });
    s.leads.filter((l) => !['won', 'lost'].includes(l.stage) && fmt.daysFromNow(l.nextFollowUp) < 0).slice(0, 2).forEach((l) => alerts.push({ tone: 'warning', text: `Overdue follow-up: ${custBy(l.customerId)?.name} (${l.from}→${l.to})`, href: 'charter-crm.html' }));
    $('#alerts').innerHTML = alerts.length ? `<ul class="list">${alerts.slice(0, 8).map((a) => `<li><span class="badge badge-${a.tone} no-dot">${icon('alert', 12)}</span><a class="grow" href="${link(a.href)}">${esc(a.text)}</a></li>`).join('')}</ul>` : emptyState('No alerts');

    $('#tasks').innerHTML = `<ul class="list tasks">${s.tasks.map((k) => `
      <li class="task ${k.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-task="${k.id}" ${k.done ? 'checked' : ''}/><span class="task-text">${esc(k.text)}</span></label>
      <span class="spacer"></span><span class="meta ${!k.done && fmt.daysFromNow(k.due) < 0 ? 'overdue' : ''}">${fmt.date(k.due)}</span><a class="btn btn-ghost btn-sm" href="${link(k.link)}" aria-label="Go to related module">${icon('arrow', 14)}</a></li>`).join('')}</ul>
      <form id="task-form" class="row" style="margin-top:10px"><label class="field" style="flex:1"><span class="sr-only">New task</span><input name="text" type="text" placeholder="Add a task…" required maxlength="120"/></label><button class="btn btn-sm" type="submit">${icon('plus', 14)} Add</button></form>`;

    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const from = now - (w + 1) * 7 * DAY, to = now - w * 7 * DAY;
      const trips = s.trips.filter((t) => t.status === 'completed' && ts(t.depart) >= from && ts(t.depart) < to);
      weeks.push([fmt.date(new Date(to).toISOString()), trips.reduce((x, t) => x + econ(t).revenue, 0)]);
    }
    mount($('#revenue-chart'), (w) => lineChart({ width: w, height: 200, labels: weeks.map((x) => x[0]), series: [{ name: 'Revenue', values: weeks.map((x) => x[1]) }], format: (v) => fmt.money(v, { compact: true }), label: 'Weekly revenue, last 8 weeks' }));
  };
  draw();
  const main = $('#main');
  on(main, 'click', '[data-trip]', (e, b) => openTrip(b.dataset.trip, draw));
  on(main, 'change', '[data-task]', (e, cb) => { store.update('tasks', cb.dataset.task, { done: cb.checked }, cb.checked ? 'Task completed' : 'Task reopened'); draw(); });
  main.addEventListener('submit', (e) => {
    if (e.target.id !== 'task-form') return;
    e.preventDefault();
    const v = formValues(e.target);
    if (!v.text) return;
    store.add('tasks', { id: uid('K'), text: v.text, due: todayISO(), done: false, link: 'dashboard.html' }, 'Task added');
    toast('Task added'); draw();
  });
}

/* =========================================================
   FLEET — Aircraft directory
   ========================================================= */
function aircraftCard(a) {
  const h = hoursFlown(a.id, Date.now() - 90 * DAY), pace = a.targetHours * 90 / 365;
  const next = upcoming(30, (t) => t.aircraftId === a.id)[0];
  return `<a class="ac-card" href="${href('platform/aircraft-detail.html?id=' + a.id)}" aria-label="${a.tail} ${esc(a.model)}, ${a.status}">
    <div class="ac-media zoom">${acPhoto(a)}${badge(a.status)}<span class="ac-tail">${a.tail}</span></div>
    <div class="ac-body">
      <div class="row-between"><span class="ac-name">${esc(a.make)} ${esc(a.model)}</span><span class="muted" style="font-size:12px">${CLASSES[a.cls].label}</span></div>
      <div class="ac-specs">${a.cls === 'cargo' ? `<span><b>${Math.round((a.payloadLb || 0) / 1000)}k lb</b>payload</span>` : `<span><b>${a.pax}</b>pax</span>`}<span><b>${fmt.dist(a.rangeNm)}</b>range</span><span><b>${a.base}</b>base</span></div>
      <div><div class="row-between" style="font-size:12px"><span class="muted">Utilization · 90d</span><span class="num">${Math.round(h)} / ${Math.round(pace)} h</span></div><div class="meter" role="img" aria-label="${Math.round((h / pace) * 100)} percent of target pace"><span style="width:${Math.min(100, (h / pace) * 100)}%"></span></div></div>
      <p class="muted" style="font-size:12px">${next ? `Next: ${next.from} → ${next.to} · ${fmt.dateTime(next.depart)}` : 'No trips scheduled in 30 days'}</p>
    </div></a>`;
}

function aircraftForm(a = {}) {
  const v = (k, d = '') => esc(a[k] ?? d);
  return `<form id="ac-form" class="form-grid" novalidate>
    <label class="field"><span>Tail number</span><input name="tail" type="text" required pattern="[A-Za-z0-9-]{3,8}" value="${v('tail')}" placeholder="N123AE" /></label>
    <label class="field"><span>Year</span><input name="year" type="number" min="1980" max="2027" required value="${v('year', 2020)}" /></label>
    <label class="field"><span>Make</span><input name="make" type="text" required value="${v('make')}" /></label>
    <label class="field"><span>Model</span><input name="model" type="text" required value="${v('model')}" /></label>
    <label class="field"><span>Class</span><select name="cls" required>${Object.entries(CLASSES).map(([k, c]) => `<option value="${k}" ${a.cls === k ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
    <label class="field"><span>Status</span><select name="status">${['available', 'maintenance', 'aog'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s === 'aog' ? 'AOG' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
    <label class="field"><span>Base</span><select name="base" required>${airportOptions(a.base || 'TEB')}</select></label>
    <label class="field"><span>Passengers</span><input name="pax" type="number" min="1" max="19" required value="${v('pax', 8)}" /></label>
    <label class="field"><span>Range (nm)</span><input name="rangeNm" type="number" min="500" max="8500" required value="${v('rangeNm', 2500)}" /></label>
    <label class="field"><span>Cruise speed (kt)</span><input name="speedKts" type="number" min="250" max="520" required value="${v('speedKts', 450)}" /></label>
    <label class="field"><span>Hourly rate (USD, rate card)</span><input name="hourlyRate" type="number" min="1000" max="40000" step="50" required value="${v('hourlyRate', 6000)}" /></label>
    <label class="field"><span>Fuel burn (gal/h)</span><input name="burnGph" type="number" min="50" max="900" required value="${v('burnGph', 220)}" /></label>
    <label class="field"><span>Annual target hours</span><input name="targetHours" type="number" min="50" max="1200" required value="${v('targetHours', 450)}" /></label>
    <label class="field"><span>Total time (h)</span><input name="totalTime" type="number" min="0" max="60000" required value="${v('totalTime', 1000)}" /></label>
  </form>`;
}

function editAircraft(id, after) {
  if (!guard('editAircraft')) return;
  const a = id ? acBy(id) : null;
  const panel = openModal({ title: a ? `Edit ${a.tail}` : 'Add aircraft', body: aircraftForm(a || {}), wide: true, footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ac-save">${a ? 'Save changes' : 'Add aircraft'}</button>` });
  $('#ac-save', panel).addEventListener('click', () => {
    const f = $('#ac-form', panel);
    if (!validate(f, (v) => (S().aircraft.some((x) => x.tail.toUpperCase() === v.tail.toUpperCase() && x.id !== id) ? { tail: 'Tail number already exists in this fleet' } : {}))) return;
    const v = formValues(f);
    const num = ['year', 'pax', 'rangeNm', 'speedKts', 'hourlyRate', 'burnGph', 'targetHours', 'totalTime'];
    num.forEach((k) => (v[k] = Number(v[k])));
    v.tail = v.tail.toUpperCase();
    if (a) { store.update('aircraft', id, v, `Aircraft ${v.tail} edited`); toast(`${v.tail} updated`, 'success'); }
    else { store.add('aircraft', { id: uid('a'), ownerId: S().owners[0].id, cycles: Math.round(v.totalTime * 0.7), ...v }, `Aircraft ${v.tail} added`); toast(`${v.tail} added to fleet`, 'success'); }
    closeOverlay(); after();
  });
}

function fleet() {
  const st = { q: '', cls: '', base: '', status: '', view: 'cards', sort: 'tail', dir: 1 };
  const bases = [...new Set(S().aircraft.map((a) => a.base))].sort();
  $('#f-base').innerHTML = '<option value="">All bases</option>' + bases.map((b) => `<option>${b}</option>`).join('');
  $('#f-class').innerHTML = '<option value="">All classes</option>' + Object.entries(CLASSES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');

  const draw = () => {
    const list = S().aircraft.filter((a) =>
      (!st.q || `${a.tail} ${a.make} ${a.model}`.toLowerCase().includes(st.q)) && (!st.cls || a.cls === st.cls) && (!st.base || a.base === st.base) && (!st.status || a.status === st.status));
    const util = (a) => hoursFlown(a.id, Date.now() - 90 * DAY) / (a.targetHours * 90 / 365);
    list.sort((a, b) => {
      const va = st.sort === 'util' ? util(a) : st.sort === 'rate' ? a.hourlyRate : String(a[st.sort]);
      const vb = st.sort === 'util' ? util(b) : st.sort === 'rate' ? b.hourlyRate : String(b[st.sort]);
      return (va > vb ? 1 : va < vb ? -1 : 0) * st.dir;
    });
    $('#f-count').textContent = `${list.length} of ${S().aircraft.length} aircraft`;
    const s = S();
    $('#fleet-kpis').innerHTML = [
      kpi({ label: 'Available', value: s.aircraft.filter((a) => a.status === 'available').length }),
      kpi({ label: 'In maintenance', value: s.aircraft.filter((a) => a.status === 'maintenance').length }),
      kpi({ label: 'AOG', value: s.aircraft.filter((a) => a.status === 'aog').length, tone: s.aircraft.some((a) => a.status === 'aog') ? 'danger' : '' }),
      kpi({ label: 'Avg utilization · 90d', value: fmt.pct(s.aircraft.reduce((x, a) => x + util(a), 0) / s.aircraft.length), sub: 'vs. annual target pace' }),
    ].join('');
    if (!list.length) { $('#fleet-out').innerHTML = emptyState('No aircraft match these filters', '<button class="btn btn-sm" id="f-clear">Clear filters</button>'); return; }
    if (st.view === 'cards') { $('#fleet-out').innerHTML = `<div class="ac-grid">${list.map(aircraftCard).join('')}</div>`; return; }
    const th = (k, l, cls = '') => `<th class="${cls}" aria-sort="${st.sort === k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="sort" data-sort="${k}">${l}</button></th>`;
    $('#fleet-out').innerHTML = `<div class="card card-flush"><div class="table-wrap"><table class="table responsive"><caption class="sr-only">Fleet directory</caption>
      <thead><tr>${th('tail', 'Tail')}${th('model', 'Aircraft')}${th('cls', 'Class')}${th('base', 'Base')}<th>Status</th>${th('util', 'Util. 90d', 'r')}${th('rate', 'Rate / h', 'r')}<th>Next trip</th><th class="r">Actions</th></tr></thead>
      <tbody>${list.map((a) => { const n = upcoming(30, (t) => t.aircraftId === a.id)[0]; return `<tr>
        <td data-label="Tail"><a href="${href('platform/aircraft-detail.html?id=' + a.id)}"><b>${a.tail}</b></a></td>
        <td data-label="Aircraft">${esc(a.make)} ${esc(a.model)}</td><td data-label="Class">${CLASSES[a.cls].label}</td><td data-label="Base">${a.base}</td>
        <td data-label="Status"><label class="sr-only" for="st-${a.id}">Status for ${a.tail}</label><select id="st-${a.id}" data-status="${a.id}" style="min-height:32px;width:auto">${['available', 'maintenance', 'aog'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s === 'aog' ? 'AOG' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></td>
        <td data-label="Util. 90d" class="r">${fmt.pct(util(a))}</td><td data-label="Rate / h" class="r">${fmt.money(a.hourlyRate)}</td>
        <td data-label="Next trip">${n ? `${n.from}→${n.to} <span class="muted">${fmt.date(n.depart)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions"><button class="btn btn-sm" data-edit="${a.id}">Edit</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
  };
  draw();
  $('#f-q').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); });
  $('#f-class').addEventListener('change', (e) => { st.cls = e.target.value; draw(); });
  $('#f-base').addEventListener('change', (e) => { st.base = e.target.value; draw(); });
  $('#f-status').addEventListener('change', (e) => { st.status = e.target.value; draw(); });
  pressGroup($('#f-view'), 'data-view', (v) => { st.view = v; draw(); });
  $('#add-aircraft').addEventListener('click', () => editAircraft(null, draw));
  const out = $('#fleet-out');
  on(out, 'click', '[data-sort]', (e, b) => { st.dir = st.sort === b.dataset.sort ? -st.dir : 1; st.sort = b.dataset.sort; draw(); });
  on(out, 'click', '[data-edit]', (e, b) => editAircraft(b.dataset.edit, draw));
  on(out, 'click', '#f-clear', () => { Object.assign(st, { q: '', cls: '', base: '', status: '' }); ['#f-q', '#f-class', '#f-base', '#f-status'].forEach((s) => ($(s).value = '')); draw(); });
  on(out, 'change', '[data-status]', (e, sel) => {
    if (!can('editAircraft')) { guard('editAircraft'); draw(); return; }
    const a = store.update('aircraft', sel.dataset.status, { status: sel.value }, `Aircraft status set to ${sel.value}`);
    toast(`${a.tail} is now ${sel.value === 'aog' ? 'AOG' : sel.value} — dashboards updated`, sel.value === 'available' ? 'success' : 'danger');
    draw();
  });
}

/* =========================================================
   AIRCRAFT DETAIL — profile
   ========================================================= */
function aircraftDetail() {
  const id = param('id') || 'a1';
  const host = $('#ac-root');
  const draw = () => {
    const a = acBy(id);
    if (!a) { host.innerHTML = errorState(`No aircraft with id “${esc(id)}”. <a href="fleet.html">Back to Fleet</a>`); return; }
    document.title = `${a.tail} — AERO`;
    const crumb = $('.breadcrumbs [aria-current]'); if (crumb) crumb.textContent = a.tail;
    const owner = ownerBy(a.ownerId);
    const hist = tripsFor(a.id).filter((t) => t.status === 'completed').sort((x, y) => ts(y.depart) - ts(x.depart));
    const next = upcoming(30, (t) => t.aircraftId === a.id);
    const mx = S().maintenance.filter((m) => m.aircraftId === a.id).sort((x, y) => ts(x.dueDate) - ts(y.dueDate));
    const docs = S().documents.filter((d) => d.aircraftId === a.id);
    const flags = groundingFlags(a.id);
    const h90 = hoursFlown(a.id, Date.now() - 90 * DAY);

    host.innerHTML = `
      <section class="ac-hero" aria-labelledby="ac-title">
        <div>
          <p class="eyebrow">${CLASSES[a.cls].label} · ${a.base}</p>
          <h1 id="ac-title">${a.tail}</h1>
          <p style="font-size:1.1rem;margin-top:6px">${esc(a.make)} ${esc(a.model)} · ${a.year}</p>
          <p class="muted" style="margin-top:6px">Owner: ${esc(owner?.name || '—')}</p>
          <div class="row" style="margin-top:16px">${badge(a.status)}
            <label class="field" style="width:auto"><span class="sr-only">Change status</span><select id="ac-status" style="width:auto;min-height:34px">${['available', 'maintenance', 'aog'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>Set ${s === 'aog' ? 'AOG' : s}</option>`).join('')}</select></label>
            <button class="btn btn-sm" id="ac-edit">Edit</button></div>
          ${flags.length ? `<p class="notice" style="margin-top:14px">${icon('alert', 16)}<span>Potential grounding indicators: ${flags.map(esc).join('; ')}. Verify with maintenance control.</span></p>` : ''}
        </div>
        <div class="ac-hero-photo">${acPhoto(a, 1600)}</div>
      </section>
      <dl class="spec-grid" aria-label="Specifications">
        <div><dt>Passengers</dt><dd>${a.pax}</dd></div><div><dt>Range</dt><dd>${fmt.dist(a.rangeNm)}</dd></div>
        <div><dt>Cruise</dt><dd>${a.speedKts} kt</dd></div><div><dt>Fuel burn</dt><dd>${fmt.fuel(a.burnGph)}/h</dd></div>
        <div><dt>Total time</dt><dd class="num">${a.totalTime.toLocaleString()} h</dd></div><div><dt>Cycles</dt><dd class="num">${(a.cycles || 0).toLocaleString()}</dd></div>
        <div><dt>Rate card</dt><dd>${fmt.money(a.hourlyRate)}/h</dd></div><div><dt>Hours · 90d</dt><dd>${Math.round(h90)} h</dd></div>
      </dl>
      <div class="cols-main mt">
        <div class="stack">
          <section class="card"><div class="card-head"><h2 class="card-title">Schedule · next 30 days</h2><a class="btn btn-sm" href="operations.html">Operations</a></div>
            ${next.length ? `<ol class="timeline">${next.map((t) => `<li class="${t.status === 'in-flight' ? 'now' : ''}"><p class="t-time">${fmt.dateTime(t.depart)} · ${fmt.hours(t.hours)}</p><p><button class="btn btn-ghost btn-sm" data-trip="${t.id}" style="padding:0">${route(t.from, t.to)}</button> ${badge(t.type)} ${badge(t.approval === 'pending' ? 'pending' : t.status)}</p></li>`).join('')}</ol>` : emptyState('No trips scheduled')}
          </section>
          <section class="card"><div class="card-head"><h2 class="card-title">Costs &amp; revenue · by month <span class="sim">Sim</span></h2></div><div id="ac-costs" class="chart-box"></div></section>
          <section class="card card-flush"><div class="card-head"><h2 class="card-title">Operating history</h2><span class="card-sub">${hist.length} completed trips · ${Math.round(hist.reduce((s, t) => s + t.hours, 0))} h</span></div>
            <div class="table-wrap"><table class="table responsive"><thead><tr><th>Date</th><th>Trip</th><th>Route</th><th>Type</th><th class="r">Block</th><th class="r">Margin</th></tr></thead>
            <tbody>${hist.slice(0, 12).map((t) => `<tr><td data-label="Date">${fmt.date(t.depart)}</td><td data-label="Trip">${t.id}</td><td data-label="Route">${route(t.from, t.to)}</td><td data-label="Type">${badge(t.type)}</td><td data-label="Block" class="r">${fmt.hours(t.hours)}</td><td data-label="Margin" class="r">${fmt.money(econ(t).margin)}</td></tr>`).join('') || '<tr><td colspan="6">No history</td></tr>'}</tbody></table></div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h2 class="card-title">Maintenance snapshot</h2><a class="btn btn-sm" href="maintenance.html">All items</a></div>
            <ul class="list">${mx.map((m) => `<li><span class="grow"><span class="title">${esc(m.item)}</span><span class="meta"> · due ${fmt.date(m.dueDate)} / ${m.dueHours.toLocaleString()} h</span></span>${badge(mxState(m))}</li>`).join('') || '<li class="meta">No items</li>'}</ul>
            <p class="card-foot">Status shown from synthetic tracking data. Airworthiness is determined by qualified maintenance personnel, not AERO.</p></section>
          <section class="card"><div class="card-head"><h2 class="card-title">Documents</h2></div>
            <ul class="list">${docs.map((d) => `<li>${icon('doc', 16)}<span class="grow"><span class="title">${esc(d.name)}</span><span class="meta"> · ${d.expires ? 'expires ' + fmt.date(d.expires) : 'no expiry'}</span></span>${d.expires ? badge(expiry(d.expires)) : ''}</li>`).join('')}</ul>
            <p class="card-foot">Demo placeholders — no files are stored.</p></section>
        </div>
      </div>`;

    const months = [];
    for (let m = 3; m >= 0; m--) {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - m);
      const e = new Date(d); e.setMonth(e.getMonth() + 1);
      const trips = hist.filter((t) => ts(t.depart) >= d.getTime() && ts(t.depart) < e.getTime());
      months.push([d.toLocaleDateString('en-US', { month: 'short' }), trips.reduce((s, t) => s + econ(t).revenue, 0), trips.reduce((s, t) => s + econ(t).cost, 0)]);
    }
    mount($('#ac-costs'), (w) => barChart({ width: w, height: 200, labels: months.map((x) => x[0]), series: [{ name: 'Revenue', values: months.map((x) => x[1]) }, { name: 'Direct cost', values: months.map((x) => x[2]) }], format: (v) => fmt.money(v, { compact: true }), label: 'Monthly revenue and cost' }));

    $('#ac-status').addEventListener('change', (e) => {
      if (!can('editAircraft')) { guard('editAircraft'); e.target.value = a.status; return; }
      store.update('aircraft', a.id, { status: e.target.value }, `Aircraft status set to ${e.target.value}`);
      toast(`${a.tail} status updated — Command Center and Fleet reflect it`, 'success'); draw();
    });
    $('#ac-edit').addEventListener('click', () => editAircraft(a.id, draw));
  };
  draw();
  on(host, 'click', '[data-trip]', (e, b) => openTrip(b.dataset.trip, draw));
}

/* =========================================================
   OPERATIONS — scheduling & dispatch coordination
   ========================================================= */
function operations() {
  const st = { view: 'week', start: T.startOfToday().getTime(), cls: '' };
  // start the week on Monday
  const mon = (t) => { const d = new Date(t); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); d.setHours(0, 0, 0, 0); return d.getTime(); };
  st.start = mon(st.start);
  const focus = param('trip');
  if (focus) { const t = S().trips.find((x) => x.id === focus); if (t) { st.start = mon(ts(t.depart)); st.day = T.startOfToday().getTime(); } }
  st.day = T.startOfToday().getTime();
  $('#o-class').innerHTML = '<option value="">All classes</option>' + Object.entries(CLASSES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');

  const draw = () => {
    const conflicts = findConflicts(S());
    const cIds = new Set(conflicts.map((c) => c.tripId));
    const fleetList = S().aircraft.filter((a) => !st.cls || a.cls === st.cls);
    const today = T.startOfToday().getTime();
    const pending = S().trips.filter((t) => t.approval === 'pending' && ts(t.depart) > Date.now() && t.status !== 'cancelled');

    $('#ops-kpis').innerHTML = [
      kpi({ label: 'Trips · next 7 days', value: upcoming(7).length }),
      kpi({ label: 'Awaiting operator approval', value: pending.length, tone: pending.length ? 'gold' : '' }),
      kpi({ label: 'Conflicts detected', value: conflicts.length, tone: conflicts.length ? 'danger' : '', sub: 'Aircraft, crew and status' }),
      kpi({ label: 'Ground handling open', value: S().trips.filter((t) => t.fbo && t.fbo.status !== 'confirmed' && ts(t.depart) > Date.now()).length }),
    ].join('');

    $('#conflicts').innerHTML = conflicts.length ? `<ul class="list">${conflicts.map((c) => `<li><span class="badge badge-danger no-dot">${c.kind}</span><span class="grow">${esc(c.text)}</span><button class="btn btn-sm" data-trip="${c.tripId}">Resolve</button></li>`).join('')}</ul>` : `<p class="muted">${icon('check', 14)} No conflicts in the schedule.</p>`;
    $('#approvals').innerHTML = pending.length ? `<ul class="list">${pending.slice(0, 8).map((t) => `<li><span class="grow"><span class="title">${t.id} ${route(t.from, t.to)}</span><span class="meta"> · ${acBy(t.aircraftId).tail} · ${fmt.dateTime(t.depart)} · ${t.type}</span></span><button class="btn btn-sm" data-trip="${t.id}">Review</button></li>`).join('')}</ul>` : '<p class="muted">Nothing awaiting approval.</p>';

    if (st.view === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => st.start + i * DAY);
      $('#cal-label').textContent = `${fmt.date(new Date(days[0]).toISOString())} – ${fmt.date(new Date(days[6]).toISOString())}`;
      const head = `<div class="wk-head">Aircraft</div>` + days.map((d) => `<div class="wk-head ${d === today ? 'today' : ''}">${new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>`).join('');
      const rows = fleetList.map((a) => {
        const grounded = ['maintenance', 'aog'].includes(a.status);
        return `<div class="wk-ac"><b><a href="${href('platform/aircraft-detail.html?id=' + a.id)}">${a.tail}</a></b><span class="muted">${esc(a.model)}</span></div>` + days.map((d) => {
          const trips = tripsFor(a.id).filter((t) => ts(t.depart) >= d && ts(t.depart) < d + DAY).sort((x, y) => ts(x.depart) - ts(y.depart));
          return `<div class="wk-cell ${d === today ? 'today' : ''} ${grounded && d >= today && d < today + 6 * DAY ? 'mx' : ''}">${trips.map((t) => `<button class="trip-chip ${t.type} ${cIds.has(t.id) ? 'conflict' : ''} ${t.approval === 'pending' ? 'pending' : ''}" data-trip="${t.id}" aria-label="Trip ${t.id}, ${t.from} to ${t.to} at ${fmt.time(t.depart)}${cIds.has(t.id) ? ', has conflict' : ''}${t.approval === 'pending' ? ', pending approval' : ''}"><b>${fmt.time(t.depart)}</b> ${t.from}→${t.to}${t.status === 'completed' ? ' ✓' : ''}</button>`).join('')}</div>`;
        }).join('');
      }).join('');
      $('#calendar').innerHTML = `<div class="gantt-scroll"><div class="week" role="grid" aria-label="Weekly aircraft schedule">${head}${rows}</div></div>`;
    } else {
      $('#cal-label').textContent = fmt.dateLong(new Date(st.day).toISOString());
      $('#calendar').innerHTML = dayGantt(st.day);
    }

    const fbo = S().trips.filter((t) => t.fbo && ts(t.depart) > Date.now() - DAY).sort((a, b) => ts(a.depart) - ts(b.depart));
    $('#fbo').innerHTML = fbo.length ? `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Trip</th><th>Station</th><th>Handler</th><th>Services</th><th>Arrival</th><th>Status</th><th class="r">Action</th></tr></thead><tbody>
      ${fbo.map((t) => `<tr><td data-label="Trip"><button class="btn btn-ghost btn-sm" data-trip="${t.id}" style="padding:0">${t.id}</button></td><td data-label="Station">${t.fbo.station}</td><td data-label="Handler">${esc(t.fbo.handler)}</td><td data-label="Services">${t.fbo.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</td><td data-label="Arrival">${fmt.dateTime(t.arrive)}</td><td data-label="Status">${badge(t.fbo.status)}</td>
      <td class="actions">${t.fbo.status !== 'confirmed' ? `<button class="btn btn-sm" data-fbo="${t.id}">${t.fbo.status === 'requested' ? 'Mark acknowledged' : 'Mark confirmed'}</button>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="card-foot">Status changes are recorded locally. No message is sent to any FBO or handler (integration stub).</p>` : emptyState('No ground handling requests');
  };

  draw();
  if (focus) openTrip(focus, draw);
  pressGroup($('#o-view'), 'data-view', (v) => { st.view = v; draw(); });
  $('#o-class').addEventListener('change', (e) => { st.cls = e.target.value; draw(); });
  $('#o-prev').addEventListener('click', () => { if (st.view === 'week') st.start -= 7 * DAY; else st.day -= DAY; draw(); });
  $('#o-next').addEventListener('click', () => { if (st.view === 'week') st.start += 7 * DAY; else st.day += DAY; draw(); });
  $('#o-today').addEventListener('click', () => { st.start = mon(Date.now()); st.day = T.startOfToday().getTime(); draw(); });
  const main = $('#main');
  on(main, 'click', '[data-trip]', (e, b) => openTrip(b.dataset.trip, draw));
  on(main, 'click', '[data-fbo]', (e, b) => {
    const t = S().trips.find((x) => x.id === b.dataset.fbo);
    t.fbo.status = t.fbo.status === 'requested' ? 'acknowledged' : 'confirmed';
    store.audit(`Ground handling ${t.fbo.status}`, `${t.id} @ ${t.fbo.station}`); store.save();
    toast(`Handling at ${t.fbo.station} marked ${t.fbo.status} (simulated)`); draw();
  });
  $('#new-trip').addEventListener('click', () => {
    const local = new Date(Date.now() + 2 * DAY); local.setMinutes(0, 0, 0);
    const iso = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const panel = openModal({
      title: 'New trip', wide: true,
      body: `<form id="nt" class="form-grid" novalidate>
        <label class="field"><span>Aircraft</span><select name="aircraftId" required>${aircraftOptions('', (a) => a.status === 'available')}</select></label>
        <label class="field"><span>Trip type</span><select name="type"><option value="charter">Charter</option><option value="owner">Owner</option><option value="reposition">Reposition (empty)</option></select></label>
        <label class="field"><span>From</span><select name="from" required>${airportOptions('TEB')}</select></label>
        <label class="field"><span>To</span><select name="to" required>${airportOptions('PBI')}</select></label>
        <label class="field"><span>Departure (local)</span><input name="depart" type="datetime-local" required value="${iso}"/></label>
        <label class="field"><span>Passengers</span><input name="pax" type="number" min="0" max="19" value="4" required/></label>
        <label class="field span-2"><span>Customer (charter only)</span><select name="customerId"><option value="">—</option>${S().customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <p class="span-2 muted" id="nt-est" aria-live="polite"></p>
      </form>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="nt-save">Create (pending approval)</button>',
    });
    const f = $('#nt', panel);
    const est = () => { const v = formValues(f); const a = acBy(v.aircraftId); if (a && v.from !== v.to) $('#nt-est', panel).textContent = `Estimate: ${fmt.dist(distanceNm(v.from, v.to))}, ${fmt.hours(estHours(a, v.from, v.to))} block (great-circle planning estimate).`; };
    f.addEventListener('change', est); est();
    $('#nt-save', panel).addEventListener('click', () => {
      const ok = validate(f, (v) => {
        const a = acBy(v.aircraftId); const e = {};
        if (v.from === v.to) e.to = 'Destination must differ from origin';
        if (a && distanceNm(v.from, v.to) > a.rangeNm * 0.9) e.to = `Beyond planning range for ${a.model} (${fmt.dist(a.rangeNm)}) — add a fuel stop`;
        if (a && Number(v.pax) > a.pax) e.pax = a.cls === 'cargo' ? `${a.model} is a freighter — set passengers to 0` : `Max ${a.pax} passengers on ${a.model}`;
        if (new Date(v.depart).getTime() < Date.now()) e.depart = 'Departure must be in the future';
        if (v.type === 'charter' && !v.customerId) e.customerId = 'Select a customer for a charter trip';
        return e;
      });
      if (!ok) return;
      const v = formValues(f); const a = acBy(v.aircraftId);
      const hours = estHours(a, v.from, v.to); const dep = new Date(v.depart).toISOString();
      const trip = { id: 'T' + (5000 + S().trips.length), aircraftId: a.id, from: v.from, to: v.to, depart: dep, arrive: new Date(ts(dep) + hours * HOUR).toISOString(), hours, pax: v.type === 'reposition' ? 0 : Number(v.pax), type: v.type, customerId: v.customerId || null, ownerId: v.type === 'owner' ? a.ownerId : null, brokerId: null, crew: [], status: 'scheduled', approval: 'pending', fbo: null, notes: '' };
      S().trips.push(trip); store.audit('Trip created (pending approval)', trip.id); store.save();
      const c = findConflicts(S()).filter((x) => x.tripId === trip.id || x.text.includes(trip.id));
      closeOverlay();
      toast(c.length ? `${trip.id} created — ${plural(c.length, 'conflict')} found` : `${trip.id} created — awaiting approval`, c.length ? 'danger' : 'success');
      st.start = mon(ts(dep)); st.view = 'week';
      $$('#o-view [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === 'week')));
      draw(); openTrip(trip.id, draw);
    });
  });
}

/* =========================================================
   EMPTY LEGS — core AI empty-leg engine
   (preserves the original AERO route/date/class/price/region filters)
   ========================================================= */
export function legCard(l, opts = {}) {
  const s = S(); const ac = acBy(l.aircraftId); const r = recommendPrice(s, l);
  const price = l.listPrice || r.recommended;
  const v = l.validation;
  const checks = v ? `<ul class="checks">${v.checks.map((c) => `<li><span class="${c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'human'}" aria-hidden="true">${c.ok === true ? '✓' : c.ok === false ? '✕' : '!'}</span><span><b>${esc(c.label)}</b> — ${esc(c.detail)}<span class="sr-only">${c.ok === true ? ' (passed)' : c.ok === false ? ' (failed)' : ' (needs human verification)'}</span></span></li>`).join('')}</ul>` : '';
  const openInq = l.inquiries.filter((q) => q.state === 'open').length;
  return `<article class="leg ${l.status === 'published' ? 'is-published' : ''}" aria-labelledby="leg-${l.id}">
    <div class="row-between"><span class="muted" style="font-size:12px">${esc(ac.tail)} · ${esc(ac.model)} · ${CLASSES[ac.cls].label}</span>${badge(l.status === 'candidate' && v ? v.overall : l.status)}</div>
    <div class="leg-route" id="leg-${l.id}"><div><div class="code">${l.from}</div><div class="city">${esc(city(l.from))}</div></div><div class="line" aria-hidden="true"></div><div style="text-align:right"><div class="code">${l.to}</div><div class="city">${esc(city(l.to))}</div></div><span class="sr-only">${city(l.from)} to ${city(l.to)}</span></div>
    <div class="leg-meta"><span><b>${fmt.date(l.depart)}</b>${fmt.time(l.depart)} ± ${l.flexHours} h</span><span><b>${fmt.hours(r.hours)}</b>${fmt.dist(distanceNm(l.from, l.to))}</span><span><b>${ac.pax}</b>seats</span></div>
    <div><div class="row-between" style="font-size:12px"><span class="muted">Demand score</span><b>${r.demand.score}/100</b></div><div class="meter"><span style="width:${r.demand.score}%"></span></div></div>
    <div class="row-between"><p class="price">${fmt.money(price)}<small>${l.listPrice ? 'list price' : 'recommended'}</small></p><p class="muted" style="font-size:12px;text-align:right">Retail ${fmt.money(r.retail)}<br>Floor ${fmt.money(r.floor)}</p></div>
    <details class="assumptions"><summary>Why this price? Assumptions &amp; evidence</summary><ul>${r.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}${r.demand.evidence.map((e) => `<li>Demand: ${esc(e)}</li>`).join('')}<li>Source: ${esc(l.reason)}</li></ul></details>
    ${checks}
    ${opts.readonly ? '' : `<div class="row">
      ${l.status === 'candidate' ? `<button class="btn btn-sm" data-validate="${l.id}">Validate availability</button>` : ''}
      ${l.status === 'candidate' && v && v.overall === 'validated' ? `<button class="btn btn-sm btn-primary" data-publish="${l.id}">Publish</button>` : ''}
      ${l.status === 'published' ? `<button class="btn btn-sm" data-unpublish="${l.id}">Unpublish</button><button class="btn btn-sm" data-price="${l.id}">Edit price</button><button class="btn btn-sm" data-sim="${l.id}">Simulate broker inquiry</button>` : ''}
      ${l.inquiries.length ? `<button class="btn btn-sm ${openInq ? 'btn-primary' : ''}" data-inq="${l.id}">Inquiries (${l.inquiries.length})</button>` : ''}
    </div>`}
  </article>`;
}

export function filterState() {
  return { from: '', to: '', range: 'any', dFrom: '', dTo: '', cls: '', price: '', region: '' };
}

/** Original AERO filter logic, now applied to engine legs (and reused by marketplace). */
export function applyLegFilters(list, f) {
  const now = Date.now();
  return list.filter((l) => {
    const d = ts(l.depart);
    if (f.from && l.from !== f.from) return false;
    if (f.to && l.to !== f.to) return false;
    if (f.range === 'today' && new Date(d).toDateString() !== new Date().toDateString()) return false;
    if (f.range === '7' && d > now + 7 * DAY) return false;
    if (f.range === '30' && d > now + 30 * DAY) return false;
    if (f.range === 'custom') { if (f.dFrom && d < ts(f.dFrom + 'T00:00:00')) return false; if (f.dTo && d > ts(f.dTo + 'T23:59:59')) return false; }
    if (f.cls && l.cls !== f.cls) return false;
    if (f.price) { const p = l.listPrice || recommendPrice(S(), l).recommended; if (p > Number(f.price)) return false; }
    if (f.region && l.region !== f.region) return false;
    return true;
  });
}

function filterCount(f) { return ['from', 'to', 'cls', 'price', 'region'].filter((k) => f[k]).length + (f.range !== 'any' ? 1 : 0); }

/** Wires the original filter panel markup (ids prefixed with `p`). */
export function wireFilterPanel(p, f, onChange, countFn) {
  const panel = $(`#${p}-panel`), trigger = $(`#${p}-trigger`);
  const sync = () => {
    const n = filterCount(f);
    const badgeEl = $(`#${p}-badge`); badgeEl.hidden = !n; badgeEl.textContent = n;
    $(`#${p}-apply-count`).textContent = countFn();
    const tags = [];
    if (f.from) tags.push(['from', `From ${f.from}`]); if (f.to) tags.push(['to', `To ${f.to}`]);
    if (f.range !== 'any') tags.push(['range', { today: 'Today', 7: 'Next 7 days', 30: 'Next 30 days', custom: `${f.dFrom || '…'} → ${f.dTo || '…'}` }[f.range]]);
    if (f.cls) tags.push(['cls', CLASSES[f.cls].label]); if (f.price) tags.push(['price', `Under ${fmt.money(Number(f.price), { compact: true })}`]); if (f.region) tags.push(['region', REGIONS[f.region]]);
    $(`#${p}-tags`).innerHTML = tags.map(([k, t]) => `<span class="active-tag">${esc(t)}<button type="button" data-untag="${k}" aria-label="Remove filter ${esc(t)}">×</button></span>`).join('');
  };
  trigger.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); if (open) $(`#${p}-from`).focus(); });
  airportSuggest($(`#${p}-from`), $(`#${p}-from-dd`), (code) => { f.from = code || ''; onChange(); sync(); });
  airportSuggest($(`#${p}-to`), $(`#${p}-to-dd`), (code) => { f.to = code || ''; onChange(); sync(); });
  $(`#${p}-swap`).addEventListener('click', () => {
    [f.from, f.to] = [f.to, f.from];
    $(`#${p}-from`).value = f.from; $(`#${p}-to`).value = f.to; onChange(); sync();
  });
  pressGroup($(`#${p}-dates`), 'data-range', (v) => { f.range = v; $(`#${p}-custom`).hidden = v !== 'custom'; onChange(); sync(); });
  $(`#${p}-dfrom`).addEventListener('change', (e) => { f.dFrom = e.target.value; onChange(); sync(); });
  $(`#${p}-dto`).addEventListener('change', (e) => { f.dTo = e.target.value; onChange(); sync(); });
  pressGroup($(`#${p}-classes`), 'data-class', (v) => { f.cls = v; onChange(); sync(); });
  pressGroup($(`#${p}-prices`), 'data-price', (v) => { f.price = v; onChange(); sync(); });
  pressGroup($(`#${p}-regions`), 'data-region', (v) => { f.region = v; onChange(); sync(); });
  const reset = (keys) => {
    keys.forEach((k) => { if (k === 'range') { f.range = 'any'; f.dFrom = ''; f.dTo = ''; } else f[k] = ''; });
    $(`#${p}-from`).value = f.from; $(`#${p}-to`).value = f.to;
    const pressFirst = (sel, attr, val) => $$(`[${attr}]`, $(sel)).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)));
    pressFirst(`#${p}-dates`, 'data-range', f.range); pressFirst(`#${p}-classes`, 'data-class', f.cls); pressFirst(`#${p}-prices`, 'data-price', f.price); pressFirst(`#${p}-regions`, 'data-region', f.region);
    $(`#${p}-custom`).hidden = f.range !== 'custom';
    onChange(); sync();
  };
  $(`#${p}-clear`).addEventListener('click', () => reset(['from', 'to', 'range', 'cls', 'price', 'region']));
  $(`#${p}-apply`).addEventListener('click', () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); });
  $(`#${p}-tags`).addEventListener('click', (e) => { const b = e.target.closest('[data-untag]'); if (b) reset([b.dataset.untag]); });
  sync();
  return sync;
}

function emptyLegs() {
  const f = filterState();
  let tab = 'all';
  const statusOf = (l) => (l.status === 'candidate' && l.validation ? l.validation.overall : l.status);
  const filtered = () => applyLegFilters(S().emptyLegs, f).filter((l) => tab === 'all' || statusOf(l) === tab || (tab === 'candidate' && l.status === 'candidate' && !l.validation));
  const draw = () => {
    const s = S();
    const legs = s.emptyLegs;
    const by = (st) => legs.filter((l) => statusOf(l) === st).length;
    $('#el-kpis').innerHTML = [
      kpi({ label: 'Candidates', value: legs.filter((l) => l.status === 'candidate' && !l.validation).length, sub: 'Detected, not yet validated' }),
      kpi({ label: 'Validated', value: by('validated'), sub: `${by('blocked')} blocked by schedule / status` }),
      kpi({ label: 'Published', value: by('published'), tone: 'gold', sub: 'Visible in Marketplace' }),
      kpi({ label: 'Open inquiries', value: legs.reduce((x, l) => x + l.inquiries.filter((q) => q.state === 'open').length, 0) }),
      kpi({ label: 'Converted to leads', value: by('converted') }),
    ].join('');
    const list = filtered().sort((a, b) => ts(a.depart) - ts(b.depart));
    $('#el-summary').textContent = `${plural(list.length, 'leg')} shown · ${plural(legs.length, 'leg')} in engine`;
    $('#el-grid').innerHTML = list.length ? `<div class="leg-grid">${list.map((l) => legCard(l)).join('')}</div>` : emptyState('No legs match. Clear filters or run detection again.', '<button class="btn btn-sm" id="el-run2">Run detection</button>');
  };
  const sync = wireFilterPanel('el', f, draw, () => filtered().length);
  draw();

  $('#el-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]'); if (!b) return;
    $$('#el-tabs [role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    tab = b.dataset.tab; draw(); sync();
  });

  const run = () => {
    const found = detectRepositioning(S());
    S().emptyLegs.push(...found);
    store.audit('Empty-leg detection run', `${found.length} new candidates`); store.save();
    toast(found.length ? `${plural(found.length, 'new repositioning candidate')} detected` : 'No new repositioning legs — schedule already scanned', found.length ? 'success' : '');
    draw(); sync();
  };
  $('#el-run').addEventListener('click', run);
  $('#el-validate-all').addEventListener('click', () => {
    const c = S().emptyLegs.filter((l) => l.status === 'candidate');
    c.forEach((l) => (l.validation = validateLeg(S(), l)));
    store.audit('Bulk availability validation', `${c.length} legs`); store.save();
    toast(`${plural(c.length, 'leg')} checked — ${c.filter((l) => l.validation.overall === 'blocked').length} blocked`); draw(); sync();
  });

  const main = $('#main');
  on(main, 'click', '#el-run2', run);
  on(main, 'click', '[data-validate]', (e, b) => {
    const l = S().emptyLegs.find((x) => x.id === b.dataset.validate);
    l.validation = validateLeg(S(), l);
    store.audit('Leg availability validated', `${l.id}: ${l.validation.overall}`); store.save();
    toast(l.validation.overall === 'validated' ? 'Validated — human checks still required for crew & permits' : 'Blocked — see failed checks', l.validation.overall === 'validated' ? 'success' : 'danger');
    draw(); sync();
  });
  on(main, 'click', '[data-publish]', (e, b) => {
    if (!guard('publishLeg')) return;
    const l = S().emptyLegs.find((x) => x.id === b.dataset.publish);
    const r = recommendPrice(S(), l);
    const panel = openModal({
      title: 'Publish empty leg',
      body: `<p>${route(l.from, l.to)} · ${acLabel(acBy(l.aircraftId))} · ${fmt.dateTime(l.depart)}</p>
        <form id="pub" class="form-grid" style="margin-top:14px" novalidate>
          <label class="field"><span>List price (USD)</span><input name="price" type="number" min="${r.floor}" step="1" required value="${r.recommended}"/></label>
          <label class="field"><span>Departure flexibility (± hours)</span><input name="flex" type="number" min="0" max="24" required value="${l.flexHours}"/></label>
          <label class="check span-2"><input type="checkbox" name="ack" required/> I confirm crew availability and airport/permit feasibility will be verified by a qualified person before accepting a booking.</label>
        </form>
        <p class="muted" style="font-size:12px;margin-top:12px">Recommended ${fmt.money(r.recommended)} · cost floor ${fmt.money(r.floor)}. Prices below the floor are blocked.</p>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="pub-go">Publish to Marketplace</button>',
    });
    $('#pub-go', panel).addEventListener('click', () => {
      const form = $('#pub', panel);
      if (!validate(form)) return;
      const v = formValues(form);
      store.update('emptyLegs', l.id, { status: 'published', listPrice: Number(v.price), flexHours: Number(v.flex), publishedAt: new Date().toISOString() }, `Empty leg published at $${v.price}`);
      closeOverlay(); toast('Published — now listed in Marketplace', 'success'); draw(); sync();
    });
  });
  on(main, 'click', '[data-unpublish]', (e, b) => {
    if (!guard('publishLeg')) return;
    store.update('emptyLegs', b.dataset.unpublish, { status: 'candidate', publishedAt: null }, 'Empty leg unpublished');
    toast('Unpublished — removed from Marketplace'); draw(); sync();
  });
  on(main, 'click', '[data-price]', (e, b) => {
    if (!guard('publishLeg')) return;
    const l = S().emptyLegs.find((x) => x.id === b.dataset.price); const r = recommendPrice(S(), l);
    const panel = openModal({ title: 'Edit list price', body: `<form id="ep" novalidate><label class="field"><span>List price (min ${fmt.money(r.floor)})</span><input name="price" type="number" step="1" min="${r.floor}" required value="${l.listPrice}"/></label></form>`, footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ep-go">Save price</button>' });
    $('#ep-go', panel).addEventListener('click', () => { const form = $('#ep', panel); if (!validate(form)) return; store.update('emptyLegs', l.id, { listPrice: Number(formValues(form).price) }, 'Empty-leg price changed'); closeOverlay(); toast('Price updated'); draw(); });
  });
  on(main, 'click', '[data-sim]', (e, b) => {
    const l = S().emptyLegs.find((x) => x.id === b.dataset.sim);
    const brokers = S().brokers;
    l.inquiries.push({ id: uid('Q'), broker: brokers[l.inquiries.length % brokers.length].name, pax: 2 + (l.inquiries.length % 4), note: 'Simulated inquiry for demo purposes', at: new Date().toISOString(), state: 'open' });
    store.notify('Empty-leg inquiry (simulated)', `${l.from} → ${l.to}`, 'empty-legs.html');
    store.audit('Simulated broker inquiry', l.id); store.save();
    toast('Simulated inquiry added'); draw();
  });
  on(main, 'click', '[data-inq]', (e, b) => {
    const l = S().emptyLegs.find((x) => x.id === b.dataset.inq);
    const panel = openDrawer({
      title: `Inquiries · ${l.from} → ${l.to}`,
      body: `<ul class="list">${l.inquiries.map((q) => `<li><span class="grow"><span class="title">${esc(q.broker)}</span><span class="meta"> · ${q.pax} pax · ${fmt.dateTime(q.at)}</span><br><span class="meta">${esc(q.note)}</span></span>${q.state === 'open' ? `<button class="btn btn-sm btn-primary" data-convert="${q.id}">Convert to lead</button>` : badge('converted')}</li>`).join('')}</ul>
        <p class="notice info" style="margin-top:16px">${icon('alert', 16)}<span>Converting creates a CRM lead. Availability is still pending operator confirmation — nothing is booked.</span></p>`,
    });
    panel.addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-convert]'); if (!c) return;
      const q = l.inquiries.find((x) => x.id === c.dataset.convert);
      let cust = S().customers.find((x) => x.name === q.broker);
      if (!cust) { cust = { id: uid('c'), name: q.broker, type: 'Broker', contact: q.broker, tier: 'New', trips: 0 }; S().customers.push(cust); }
      const lead = { id: 'L' + (300 + S().leads.length), customerId: cust.id, from: l.from, to: l.to, depart: l.depart, pax: q.pax, stage: 'qualifying', value: l.listPrice || recommendPrice(S(), l).recommended, source: 'Empty-leg inquiry', nextFollowUp: todayISO(), owner: 'Sales', quote: null, legId: l.id, activity: [{ at: new Date().toISOString(), text: `Created from empty-leg inquiry ${q.id} on ${l.id}` }] };
      S().leads.unshift(lead);
      q.state = 'converted'; l.status = 'converted';
      store.audit('Inquiry converted to CRM lead', `${q.id} → ${lead.id}`); store.save();
      closeOverlay(); toast(`Lead ${lead.id} created in Charter CRM`, 'success'); draw(); sync();
    });
  });
}

/* =========================================================
   CHARTER CRM — pipeline, customers, quote builder, reminders
   ========================================================= */
const STAGES = ['new', 'qualifying', 'quoted', 'negotiating', 'won', 'lost'];
const STAGE_LABEL = { new: 'New', qualifying: 'Qualifying', quoted: 'Quoted', negotiating: 'Negotiating', won: 'Won', lost: 'Lost' };

function moveLead(id, stage) {
  const l = S().leads.find((x) => x.id === id);
  if (!l || l.stage === stage) return;
  if (!guard('crm')) return;
  const from = l.stage;
  l.stage = stage;
  l.activity.unshift({ at: new Date().toISOString(), text: `Stage ${STAGE_LABEL[from]} → ${STAGE_LABEL[stage]}` });
  store.audit('Lead stage changed', `${id}: ${from} → ${stage}`); store.save();
  toast(`${id} moved to ${STAGE_LABEL[stage]}`);
}

function quoteCalc(v) {
  const a = acBy(v.aircraftId);
  if (!a || !v.from || !v.to || v.from === v.to) return null;
  const legHours = estHours(a, v.from, v.to);
  const tripHours = legHours * (v.round ? 2 : 1);
  const posHours = v.positioning ? (a.base !== v.from ? estHours(a, a.base, v.from) : 0) + (!v.round && a.base !== v.to ? estHours(a, v.to, a.base) : 0) : 0;
  const rate = Number(v.rate || a.hourlyRate);
  const flight = (tripHours + posHours) * rate;
  const fees = Number(v.fees || 0) * (v.round ? 2 : 1);
  const overnight = Number(v.nights || 0) * 1200;
  const catering = Number(v.catering || 0);
  const sub = flight + fees + overnight + catering;
  const tax = sub * (Number(v.taxPct || 0) / 100);
  return { a, legHours, tripHours, posHours, rate, flight, fees, overnight, catering, sub, tax, total: Math.round(sub + tax) };
}

function charterCrm() {
  let tab = 'pipeline';
  const focusCustomer = param('customer');
  const kb = $('#crm-out');

  const pipeline = () => {
    const leads = S().leads;
    kb.innerHTML = `<p class="muted" style="font-size:12px;margin-bottom:10px">Drag cards between stages, or use the ← → buttons (keyboard accessible).</p>
      <div class="kanban">${STAGES.map((st) => {
        const items = leads.filter((l) => l.stage === st);
        const total = items.reduce((s, l) => s + (l.quote?.total || l.value || 0), 0);
        return `<section class="kb-col" data-stage="${st}" aria-label="${STAGE_LABEL[st]} stage, ${items.length} leads">
          <div class="kb-col-head"><span>${STAGE_LABEL[st]} · ${items.length}</span><span class="num">${fmt.money(total, { compact: true })}</span></div>
          ${items.map((l) => { const c = custBy(l.customerId); const od = !['won', 'lost'].includes(l.stage) && fmt.daysFromNow(l.nextFollowUp) < 0; return `
            <article class="kb-card" draggable="true" data-lead="${l.id}" tabindex="0" aria-label="${esc(c?.name)}, ${l.from} to ${l.to}">
              <div class="row-between"><b style="font-size:13px">${esc(c?.name || '—')}</b><span class="muted" style="font-size:11px">${l.id}</span></div>
              <span style="font-size:13px">${route(l.from, l.to)} <span class="muted">· ${l.pax} pax</span></span>
              <span class="muted" style="font-size:12px">${fmt.date(l.depart)} · ${fmt.money(l.quote?.total || l.value, { compact: true })} ${l.quote ? '· quoted' : ''}</span>
              <span style="font-size:11px" class="${od ? 'overdue' : 'muted'}">Follow-up ${fmt.date(l.nextFollowUp)}${od ? ' · overdue' : ''}</span>
              <div class="kb-moves"><button type="button" data-move="-1" aria-label="Move to previous stage">←</button><button type="button" data-move="1" aria-label="Move to next stage">→</button></div>
            </article>`; }).join('') || '<p class="muted" style="font-size:12px;padding:6px">No leads</p>'}
        </section>`;
      }).join('')}</div>`;
  };

  const customers = () => {
    const rows = S().customers.map((c) => {
      const open = S().leads.filter((l) => l.customerId === c.id && !['won', 'lost'].includes(l.stage));
      const last = S().leads.filter((l) => l.customerId === c.id).flatMap((l) => l.activity).sort((a, b) => ts(b.at) - ts(a.at))[0];
      return `<tr class="is-clickable ${c.id === focusCustomer ? 'is-focus' : ''}" data-cust="${c.id}" tabindex="0"><td data-label="Customer"><b>${esc(c.name)}</b></td><td data-label="Type">${c.type}</td><td data-label="Tier">${badge('', c.tier)}</td><td data-label="Trips" class="r">${c.trips}</td><td data-label="Open leads" class="r">${open.length}</td><td data-label="Last activity">${last ? fmt.date(last.at) : '—'}</td></tr>`;
    }).join('');
    kb.innerHTML = `<div class="card card-flush"><div class="table-wrap"><table class="table responsive"><caption class="sr-only">Customers</caption><thead><tr><th>Customer</th><th>Type</th><th>Tier</th><th class="r">Trips</th><th class="r">Open leads</th><th>Last activity</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <p class="card-foot">Customer records are synthetic. Do not store passport, payment or other sensitive data in this demo.</p>`;
  };

  const quoteBuilder = (lead) => {
    const l = lead || {};
    const acOpts = aircraftOptions('', (a) => !['aog'].includes(a.status));
    kb.innerHTML = `<div class="cols-main"><section class="card"><div class="card-head"><h2 class="card-title">Quote builder</h2><span class="demo-pill">Estimate</span></div>
      <form id="qb" class="form-grid" novalidate>
        <label class="field span-2"><span>Lead (optional)</span><select name="leadId"><option value="">— Standalone quote —</option>${S().leads.filter((x) => !['won', 'lost'].includes(x.stage)).map((x) => `<option value="${x.id}" ${x.id === l.id ? 'selected' : ''}>${x.id} · ${esc(custBy(x.customerId)?.name)} · ${x.from}→${x.to}</option>`).join('')}</select></label>
        <label class="field"><span>Aircraft</span><select name="aircraftId" required>${acOpts}</select></label>
        <label class="field"><span>Passengers</span><input name="pax" type="number" min="1" max="19" required value="${l.pax || 4}"/></label>
        <label class="field"><span>From</span><select name="from" required>${airportOptions(l.from || 'TEB')}</select></label>
        <label class="field"><span>To</span><select name="to" required>${airportOptions(l.to || 'PBI')}</select></label>
        <label class="field"><span>Departure date</span><input name="date" type="date" required value="${(l.depart || new Date(Date.now() + 5 * DAY).toISOString()).slice(0, 10)}"/></label>
        <label class="field"><span>Hourly rate (USD)</span><input name="rate" type="number" min="1000" step="50" required/></label>
        <label class="field"><span>Landing / handling fees per leg</span><input name="fees" type="number" min="0" step="50" value="650"/></label>
        <label class="field"><span>Crew overnights</span><input name="nights" type="number" min="0" max="30" value="0"/></label>
        <label class="field"><span>Catering (USD)</span><input name="catering" type="number" min="0" step="25" value="0"/></label>
        <label class="field"><span>Taxes % (verify)</span><input name="taxPct" type="number" min="0" max="30" step="0.1" value="7.5"/></label>
        <label class="check"><input type="checkbox" name="round" value="1"/> Round trip</label>
        <label class="check"><input type="checkbox" name="positioning" value="1" checked/> Charge positioning from/to base</label>
      </form></section>
      <section class="card" aria-live="polite"><div class="card-head"><h2 class="card-title">Summary</h2></div><div id="qb-sum"></div></section></div>`;
    const form = $('#qb');
    const syncRate = () => { const a = acBy(form.aircraftId.value); if (a) form.rate.value = a.hourlyRate; };
    if (l.quote) { form.aircraftId.value = l.quote.aircraftId; }
    syncRate();
    const calc = () => {
      const v = formValues(form); v.round = form.round.checked; v.positioning = form.positioning.checked;
      const q = quoteCalc(v);
      if (!q) { $('#qb-sum').innerHTML = emptyState('Choose an aircraft and two different airports'); return; }
      const warn = [];
      if (Number(v.pax) > q.a.pax) warn.push(`${q.a.model} seats ${q.a.pax} — reduce passengers or change aircraft`);
      if (distanceNm(v.from, v.to) > q.a.rangeNm * 0.9) warn.push('Leg exceeds planning range — a fuel stop is required');
      $('#qb-sum').innerHTML = `
        ${warn.map((w) => `<p class="notice" style="margin-bottom:10px">${icon('alert', 16)}<span>${esc(w)}</span></p>`).join('')}
        <dl class="dl">
          <dt>Aircraft</dt><dd>${esc(acLabel(q.a))}</dd>
          <dt>Flight time</dt><dd>${fmt.hours(q.tripHours)} ${v.round ? '(round trip)' : ''}</dd>
          <dt>Positioning</dt><dd>${fmt.hours(q.posHours)}</dd>
          <dt>Flight charges</dt><dd class="num">${fmt.money(q.flight)}</dd>
          <dt>Fees</dt><dd class="num">${fmt.money(q.fees)}</dd>
          <dt>Overnights</dt><dd class="num">${fmt.money(q.overnight)}</dd>
          <dt>Catering</dt><dd class="num">${fmt.money(q.catering)}</dd>
          <dt>Taxes (${v.taxPct}%)</dt><dd class="num">${fmt.money(q.tax)}</dd>
        </dl>
        <p class="price" style="margin-top:14px">${fmt.money(q.total)}<small>estimated total</small></p>
        <p class="muted" style="font-size:12px;margin-top:6px">Block times are great-circle planning estimates. Taxes vary by itinerary — verify applicability (e.g., US federal excise tax) before sending. Subject to operator confirmation and availability.</p>
        <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="qb-save" ${warn.length ? 'disabled' : ''}>Save quote to lead</button><button class="btn" id="qb-csv">Download CSV</button></div>`;
      $('#qb-save').addEventListener('click', () => {
        if (!guard('crm')) return;
        let lead = S().leads.find((x) => x.id === v.leadId);
        if (!lead) { toast('Choose a lead to attach this quote to', 'danger'); form.leadId.focus(); return; }
        lead.quote = { aircraftId: q.a.id, total: q.total, hours: q.tripHours, at: new Date().toISOString() };
        if (['new', 'qualifying'].includes(lead.stage)) lead.stage = 'quoted';
        lead.activity.unshift({ at: new Date().toISOString(), text: `Quote saved: ${fmt.money(q.total)} on ${q.a.tail}` });
        store.audit('Quote saved', `${lead.id} ${q.total}`); store.save();
        toast(`Quote attached to ${lead.id}`, 'success');
      });
      $('#qb-csv').addEventListener('click', () => download(`aero-quote-${v.from}-${v.to}.csv`, toCSV([
        ['Item', 'Value'], ['Aircraft', acLabel(q.a)], ['Route', `${v.from}-${v.to}${v.round ? ' round trip' : ''}`], ['Date', v.date], ['Passengers', v.pax],
        ['Flight hours', q.tripHours], ['Positioning hours', q.posHours], ['Hourly rate', q.rate], ['Flight charges', Math.round(q.flight)], ['Fees', q.fees], ['Overnights', q.overnight], ['Catering', q.catering], [`Taxes ${v.taxPct}%`, Math.round(q.tax)], ['Estimated total (USD)', q.total], ['Note', 'Estimate only - subject to operator confirmation'],
      ])));
    };
    form.addEventListener('input', calc);
    form.aircraftId.addEventListener('change', () => { syncRate(); calc(); });
    form.leadId.addEventListener('change', () => { const x = S().leads.find((y) => y.id === form.leadId.value); if (x) { form.from.value = x.from; form.to.value = x.to; form.pax.value = x.pax; form.date.value = x.depart.slice(0, 10); } calc(); });
    calc();
  };

  const reminders = () => {
    const list = S().leads.filter((l) => !['won', 'lost'].includes(l.stage)).sort((a, b) => ts(a.nextFollowUp) - ts(b.nextFollowUp));
    kb.innerHTML = `<div class="card"><ul class="list">${list.map((l) => { const d = fmt.daysFromNow(l.nextFollowUp); return `<li>
      <span class="grow"><span class="title">${esc(custBy(l.customerId)?.name)} · ${route(l.from, l.to)}</span><span class="meta"> · ${STAGE_LABEL[l.stage]} · owner ${l.owner}</span></span>
      <span class="${d < 0 ? 'overdue' : 'muted'}" style="font-size:12px">${d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : `in ${d}d`}</span>
      <label class="sr-only" for="fu-${l.id}">Follow-up date for ${l.id}</label><input id="fu-${l.id}" type="date" value="${l.nextFollowUp}" data-fu="${l.id}" style="width:auto;min-height:32px"/>
      <button class="btn btn-sm" data-done="${l.id}">Done +3d</button></li>`; }).join('')}</ul></div>`;
  };

  const activity = () => {
    const items = S().leads.flatMap((l) => l.activity.map((a) => ({ ...a, lead: l }))).sort((a, b) => ts(b.at) - ts(a.at)).slice(0, 60);
    kb.innerHTML = `<div class="card"><ol class="timeline">${items.map((a) => `<li><p class="t-time">${fmt.dateTime(a.at)} · ${a.lead.id}</p><p>${esc(a.text)} <span class="muted">— ${esc(custBy(a.lead.customerId)?.name)}</span></p></li>`).join('')}</ol></div>`;
  };

  const views = { pipeline, customers, quote: () => quoteBuilder(), reminders, activity };
  const draw = () => {
    const leads = S().leads;
    const open = leads.filter((l) => !['won', 'lost'].includes(l.stage));
    const won = leads.filter((l) => l.stage === 'won');
    $('#crm-kpis').innerHTML = [
      kpi({ label: 'Open pipeline', value: fmt.money(open.reduce((s, l) => s + (l.quote?.total || l.value), 0), { compact: true }), sub: plural(open.length, 'open lead') }),
      kpi({ label: 'Quoted', value: leads.filter((l) => l.stage === 'quoted').length }),
      kpi({ label: 'Win rate', value: fmt.pct(won.length / Math.max(1, won.length + leads.filter((l) => l.stage === 'lost').length)), sub: 'Won ÷ closed' }),
      kpi({ label: 'Overdue follow-ups', value: open.filter((l) => fmt.daysFromNow(l.nextFollowUp) < 0).length, tone: open.some((l) => fmt.daysFromNow(l.nextFollowUp) < 0) ? 'danger' : '' }),
    ].join('');
    views[tab]();
  };
  const setTab = (t) => { tab = t; $$('#crm-tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t))); draw(); };
  $('#crm-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) setTab(b.dataset.tab); });
  if (focusCustomer) setTab('customers'); else draw();
  if (focusCustomer) setTimeout(() => openCustomer(focusCustomer), 50);

  // drag & drop
  let dragId = null;
  kb.addEventListener('dragstart', (e) => { const c = e.target.closest('.kb-card'); if (!c) return; dragId = c.dataset.lead; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
  kb.addEventListener('dragend', (e) => { e.target.closest?.('.kb-card')?.classList.remove('dragging'); $$('.kb-col', kb).forEach((c) => c.classList.remove('drag-over')); });
  kb.addEventListener('dragover', (e) => { const col = e.target.closest('.kb-col'); if (!col) return; e.preventDefault(); $$('.kb-col', kb).forEach((c) => c.classList.toggle('drag-over', c === col)); });
  kb.addEventListener('drop', (e) => { const col = e.target.closest('.kb-col'); if (!col || !dragId) return; e.preventDefault(); moveLead(dragId, col.dataset.stage); dragId = null; draw(); });
  on(kb, 'click', '[data-move]', (e, b) => {
    e.stopPropagation();
    const card = b.closest('.kb-card'); const l = S().leads.find((x) => x.id === card.dataset.lead);
    const i = STAGES.indexOf(l.stage) + Number(b.dataset.move);
    if (i < 0 || i >= STAGES.length) return;
    moveLead(l.id, STAGES[i]); draw();
    $(`.kb-card[data-lead="${l.id}"] [data-move="${b.dataset.move}"]`, kb)?.focus();
  });
  const openLead = (id) => {
    const l = S().leads.find((x) => x.id === id); const c = custBy(l.customerId);
    const panel = openDrawer({
      title: `${l.id} · ${esc(c?.name)}`, wide: true,
      body: `<dl class="dl"><dt>Route</dt><dd>${route(l.from, l.to)} <span class="muted">${esc(city(l.from))} → ${esc(city(l.to))}</span></dd><dt>Date</dt><dd>${fmt.dateLong(l.depart)}</dd><dt>Passengers</dt><dd>${l.pax}</dd><dt>Source</dt><dd>${esc(l.source)}</dd><dt>Value</dt><dd>${fmt.money(l.quote?.total || l.value)} ${l.quote ? `(quoted on ${acBy(l.quote.aircraftId)?.tail})` : '(estimate)'}</dd></dl>
        <form id="ld" class="form-grid" style="margin-top:16px" novalidate>
          <label class="field"><span>Stage</span><select name="stage">${STAGES.map((s) => `<option value="${s}" ${l.stage === s ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></label>
          <label class="field"><span>Next follow-up</span><input type="date" name="nextFollowUp" value="${l.nextFollowUp}" required/></label>
          <label class="field span-2"><span>Add note</span><textarea name="note" maxlength="400" placeholder="Call summary, client preferences…"></textarea></label>
        </form>
        <h3 class="card-title" style="margin:16px 0 8px">Activity</h3><ol class="timeline">${l.activity.map((a) => `<li><p class="t-time">${fmt.dateTime(a.at)}</p><p>${esc(a.text)}</p></li>`).join('')}</ol>`,
      footer: '<button class="btn" id="ld-quote">Build quote</button><button class="btn btn-primary" id="ld-save">Save</button>',
    });
    $('#ld-save', panel).addEventListener('click', () => {
      if (!guard('crm')) return;
      const f = $('#ld', panel); if (!validate(f)) return;
      const v = formValues(f);
      if (v.stage !== l.stage) moveLead(l.id, v.stage);
      l.nextFollowUp = v.nextFollowUp;
      if (v.note) l.activity.unshift({ at: new Date().toISOString(), text: `Note: ${v.note}` });
      store.audit('Lead updated', l.id); store.save();
      closeOverlay(); toast('Lead saved'); draw();
    });
    $('#ld-quote', panel).addEventListener('click', () => { closeOverlay(); tab = 'quote'; $$('#crm-tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === 'quote'))); quoteBuilder(l); });
  };
  const openCustomer = (id) => {
    const c = custBy(id); if (!c) return;
    const leads = S().leads.filter((l) => l.customerId === id);
    const trips = S().trips.filter((t) => t.customerId === id).sort((a, b) => ts(b.depart) - ts(a.depart)).slice(0, 8);
    openDrawer({ title: esc(c.name), body: `<dl class="dl"><dt>Type</dt><dd>${c.type}</dd><dt>Contact</dt><dd>${esc(c.contact)}</dd><dt>Tier</dt><dd>${c.tier}</dd><dt>Trips flown</dt><dd>${c.trips}</dd></dl>
      <h3 class="card-title" style="margin:16px 0 6px">Leads</h3><ul class="list">${leads.map((l) => `<li><span class="grow">${l.id} ${route(l.from, l.to)} · ${fmt.date(l.depart)}</span>${badge(l.stage)}</li>`).join('') || '<li class="meta">None</li>'}</ul>
      <h3 class="card-title" style="margin:16px 0 6px">Recent trips</h3><ul class="list">${trips.map((t) => `<li><span class="grow">${t.id} ${route(t.from, t.to)} · ${fmt.date(t.depart)}</span>${badge(t.status)}</li>`).join('') || '<li class="meta">None</li>'}</ul>` });
  };
  on(kb, 'click', '.kb-card', (e, c) => { if (!e.target.closest('[data-move]')) openLead(c.dataset.lead); });
  on(kb, 'keydown', '.kb-card', (e, c) => { if (e.key === 'Enter' && e.target === c) openLead(c.dataset.lead); });
  on(kb, 'click', '[data-cust]', (e, r) => openCustomer(r.dataset.cust));
  on(kb, 'keydown', '[data-cust]', (e, r) => { if (e.key === 'Enter') openCustomer(r.dataset.cust); });
  on(kb, 'change', '[data-fu]', (e, i) => { const l = S().leads.find((x) => x.id === i.dataset.fu); l.nextFollowUp = i.value; l.activity.unshift({ at: new Date().toISOString(), text: `Follow-up rescheduled to ${i.value}` }); store.save(); toast('Follow-up rescheduled'); draw(); });
  on(kb, 'click', '[data-done]', (e, b) => { const l = S().leads.find((x) => x.id === b.dataset.done); l.nextFollowUp = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10); l.activity.unshift({ at: new Date().toISOString(), text: 'Follow-up completed; next in 3 days' }); store.audit('Follow-up completed', l.id); store.save(); toast('Follow-up logged'); draw(); });

  $('#new-request').addEventListener('click', () => {
    const panel = openModal({
      title: 'New trip request', wide: true,
      body: `<form id="nr" class="form-grid" novalidate>
        <label class="field"><span>Existing customer</span><select name="customerId"><option value="">— New customer —</option>${S().customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>New customer name</span><input name="newName" type="text" maxlength="80"/></label>
        <label class="field"><span>From</span><select name="from" required>${airportOptions('TEB')}</select></label>
        <label class="field"><span>To</span><select name="to" required>${airportOptions('ASE')}</select></label>
        <label class="field"><span>Date</span><input name="date" type="date" required min="${todayISO()}" value="${new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10)}"/></label>
        <label class="field"><span>Passengers</span><input name="pax" type="number" min="1" max="19" required value="4"/></label>
        <label class="field span-2"><span>Notes</span><textarea name="notes" maxlength="400"></textarea></label></form>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="nr-save">Create lead</button>',
    });
    $('#nr-save', panel).addEventListener('click', () => {
      const f = $('#nr', panel);
      if (!validate(f, (v) => ({ ...(v.from === v.to ? { to: 'Choose a different destination' } : {}), ...(!v.customerId && !v.newName ? { newName: 'Enter a name or pick a customer' } : {}) }))) return;
      const v = formValues(f);
      let cid = v.customerId;
      if (!cid) { cid = uid('c'); S().customers.push({ id: cid, name: v.newName, type: 'Private', contact: v.newName, tier: 'New', trips: 0 }); }
      const lead = { id: 'L' + (300 + S().leads.length), customerId: cid, from: v.from, to: v.to, depart: v.date + 'T12:00:00.000Z', pax: Number(v.pax), stage: 'new', value: Math.round(estHours(acBy('a4'), v.from, v.to) * 7400), source: 'Direct request', nextFollowUp: todayISO(), owner: 'Sales', quote: null, activity: [{ at: new Date().toISOString(), text: `Trip request created${v.notes ? ': ' + v.notes : ''}` }] };
      store.add('leads', lead, 'Lead created'); closeOverlay(); toast(`Lead ${lead.id} created`, 'success'); setTab('pipeline');
    });
  });
}

/* =========================================================
   CREW — roster, qualifications, duty/rest, assignments
   ========================================================= */
function crew() {
  const draw = () => {
    const s = S();
    const items = s.crew.flatMap((c) => [['Medical', c.medicalExp], ['Recurrent training', c.recurrentExp], ['Passport', c.passportExp]].map(([k, d]) => ({ c, k, d, st: expiry(d) })));
    const warnings = dutyWarnings();
    $('#crew-kpis').innerHTML = [
      kpi({ label: 'Active crew', value: s.crew.length, sub: `${s.crew.filter((c) => c.role === 'Captain').length} captains · ${s.crew.filter((c) => c.role === 'First Officer').length} FOs` }),
      kpi({ label: 'Expiring ≤ 30 days', value: items.filter((i) => i.st === 'expiring').length, tone: 'gold' }),
      kpi({ label: 'Expired', value: items.filter((i) => i.st === 'expired').length, tone: items.some((i) => i.st === 'expired') ? 'danger' : '' }),
      kpi({ label: 'Duty / rest warnings', value: warnings.length, tone: warnings.length ? 'danger' : '', sub: 'Against demo thresholds' }),
    ].join('');

    $('#roster').innerHTML = `<div class="table-wrap"><table class="table responsive"><caption class="sr-only">Crew roster</caption><thead><tr><th>Name</th><th>Role</th><th>Base</th><th>Type ratings</th><th>Medical</th><th>Recurrent</th><th>Next assignment</th><th class="r">Actions</th></tr></thead><tbody>
      ${s.crew.map((c) => { const n = upcoming(30, (t) => t.crew.includes(c.id))[0]; return `<tr>
        <td data-label="Name"><button class="btn btn-ghost btn-sm" style="padding:0" data-crew="${c.id}"><b>${esc(c.name)}</b></button></td><td data-label="Role">${c.role}</td><td data-label="Base">${c.base}</td>
        <td data-label="Ratings">${c.ratings.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</td>
        <td data-label="Medical">${badge(expiry(c.medicalExp), fmt.date(c.medicalExp))}</td><td data-label="Recurrent">${badge(expiry(c.recurrentExp), fmt.date(c.recurrentExp))}</td>
        <td data-label="Next">${n ? `${n.id} ${n.from}→${n.to} <span class="muted">${fmt.date(n.depart)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions"><button class="btn btn-sm" data-duty="${c.id}">Log duty</button></td></tr>`; }).join('')}</tbody></table></div>`;

    $('#expirations').innerHTML = `<ul class="list">${items.filter((i) => i.st !== 'valid').sort((a, b) => ts(a.d) - ts(b.d)).map((i) => `<li><span class="grow"><span class="title">${esc(i.c.name)}</span><span class="meta"> · ${i.k}</span></span><span class="meta">${fmt.date(i.d)}</span>${badge(i.st)}</li>`).join('') || '<li class="meta">All items valid for 30+ days</li>'}</ul>`;

    $('#duty-warnings').innerHTML = warnings.length ? `<ul class="list">${warnings.map((w) => `<li><span class="badge badge-danger no-dot">${icon('alert', 12)}</span><span class="grow">${esc(w)}</span></li>`).join('')}</ul>` : '<p class="muted">No warnings against configured demo thresholds.</p>';

    const next = upcoming(7);
    $('#assignments').innerHTML = `<ul class="list">${next.slice(0, 10).map((t) => { const ac = acBy(t.aircraftId); return `<li><span class="grow"><span class="title">${t.id} ${route(t.from, t.to)}</span><span class="meta"> · ${ac.tail} ${esc(ac.model)} · ${fmt.dateTime(t.depart)}</span><br><span class="meta">${t.crew.map((id) => esc(crewBy(id)?.name)).join(', ') || 'Unassigned'}</span></span>${t.crew.length < 2 ? badge('pending', 'Needs crew') : ''}<button class="btn btn-sm" data-assign="${t.id}">Assign</button></li>`; }).join('') || '<li class="meta">No trips in the next 7 days</li>'}</ul>`;

    // availability: 14 days
    const days = Array.from({ length: 14 }, (_, i) => T.startOfToday().getTime() + i * DAY);
    $('#availability').innerHTML = `<div class="gantt-scroll"><div class="avail-grid" role="table" aria-label="Crew availability, next 14 days"><span class="h" role="columnheader">Crew</span>${days.map((d) => `<span class="h" role="columnheader">${new Date(d).getDate()}</span>`).join('')}
      ${s.crew.map((c) => { const periods = crewDutyPeriods(c.id); const med = expiry(c.medicalExp) === 'expired'; return `<span class="n" role="rowheader">${esc(c.name)}</span>${days.map((d) => { const duty = periods.filter((p) => p.start < d + DAY && p.end > d); const cls = med ? 'warn' : duty.length ? 'duty' : (new Date(d).getDay() % 6 === 0 && c.id.endsWith('2')) ? 'off' : ''; const lbl = med ? 'Medical expired' : duty.length ? 'On duty ' + duty.map((p) => p.src).join(', ') : cls === 'off' ? 'Day off' : 'Available'; return `<span class="avail-cell ${cls}" role="cell" title="${lbl}"><span class="sr-only">${lbl}</span></span>`; }).join('')}`; }).join('')}
    </div></div><div class="map-note"><span><i style="background:var(--success-soft);border:1px solid var(--success)"></i>Available</span><span><i style="background:var(--gold)"></i>On duty</span><span><i style="background:var(--surface-1);border:1px solid var(--line-strong)"></i>Off</span><span><i style="background:var(--danger)"></i>Not eligible (expired item)</span></div>`;
  };

  function dutyWarnings() {
    const st = S().settings; const out = [];
    S().crew.forEach((c) => {
      const periods = crewDutyPeriods(c.id).filter((p) => p.end > Date.now() - 7 * DAY && p.start < Date.now() + 7 * DAY);
      // merge same-day periods into duty days
      const merged = [];
      periods.forEach((p) => { const last = merged[merged.length - 1]; if (last && p.start - last.end < 3 * HOUR) last.end = Math.max(last.end, p.end); else merged.push({ ...p }); });
      merged.forEach((p, i) => {
        const len = (p.end - p.start) / HOUR;
        if (len > st.dutyLimitHours) out.push(`${c.name}: ${len.toFixed(1)} h duty on ${fmt.date(new Date(p.start).toISOString())} exceeds ${st.dutyLimitHours} h demo limit`);
        if (i > 0) { const rest = (p.start - merged[i - 1].end) / HOUR; if (rest < st.minRestHours) out.push(`${c.name}: ${rest.toFixed(1)} h rest before ${fmt.dateTime(new Date(p.start).toISOString())} (min ${st.minRestHours} h)`); }
      });
      if (expiry(c.medicalExp) === 'expired' && upcoming(14, (t) => t.crew.includes(c.id)).length) out.push(`${c.name}: assigned to upcoming trips with an expired medical`);
    });
    return out;
  }

  draw();
  const main = $('#main');
  const crewDrawer = (id) => {
    const c = crewBy(id); if (!c) return;
    const periods = crewDutyPeriods(id).filter((p) => p.end > Date.now() - 7 * DAY).slice(0, 10);
    openDrawer({ title: esc(c.name), body: `<dl class="dl"><dt>Role</dt><dd>${c.role}</dd><dt>Base</dt><dd>${c.base}</dd><dt>Ratings</dt><dd>${c.ratings.map(esc).join(', ')}</dd><dt>Medical</dt><dd>${badge(expiry(c.medicalExp), fmt.dateLong(c.medicalExp))}</dd><dt>Recurrent</dt><dd>${badge(expiry(c.recurrentExp), fmt.dateLong(c.recurrentExp))}</dd><dt>Passport</dt><dd>${badge(expiry(c.passportExp), fmt.dateLong(c.passportExp))}</dd></dl>
      <h3 class="card-title" style="margin:16px 0 6px">Duty periods · last 7 days &amp; upcoming</h3><ul class="list">${periods.map((p) => `<li><span class="grow">${fmt.dateTime(new Date(p.start).toISOString())} → ${fmt.time(new Date(p.end).toISOString())}</span><span class="meta">${((p.end - p.start) / HOUR).toFixed(1)} h · ${p.src}</span></li>`).join('') || '<li class="meta">None</li>'}</ul>` });
  };
  on(main, 'click', '[data-crew]', (e, b) => crewDrawer(b.dataset.crew));
  if (param('crew')) crewDrawer(param('crew'));

  const logDuty = (id) => {
    const c = crewBy(id);
    const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const s0 = new Date(); s0.setHours(7, 0, 0, 0); const e0 = new Date(s0.getTime() + 9 * HOUR);
    const panel = openModal({
      title: `Log duty · ${esc(c.name)}`,
      body: `<form id="dl" class="form-grid" novalidate>
        <label class="field"><span>Duty start</span><input name="start" type="datetime-local" required value="${local(s0)}"/></label>
        <label class="field"><span>Duty end</span><input name="end" type="datetime-local" required value="${local(e0)}"/></label>
        <p class="span-2" id="dl-out" aria-live="polite"></p></form>
        <p class="notice info">${icon('alert', 16)}<span>Warnings use demo thresholds from Settings (${S().settings.dutyLimitHours} h duty / ${S().settings.minRestHours} h rest). AERO does not determine legality under 14 CFR Part 91/135 or any approved program — a qualified person must verify.</span></p>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="dl-save">Save duty period</button>',
    });
    const f = $('#dl', panel);
    const check = () => {
      const v = formValues(f); const s = new Date(v.start).getTime(), e = new Date(v.end).getTime();
      if (!(e > s)) { $('#dl-out', panel).innerHTML = ''; return; }
      const len = (e - s) / HOUR;
      const prev = crewDutyPeriods(id).filter((p) => p.end <= s).pop();
      const rest = prev ? (s - prev.end) / HOUR : null;
      const warns = [];
      if (len > S().settings.dutyLimitHours) warns.push(`Duty ${len.toFixed(1)} h exceeds ${S().settings.dutyLimitHours} h`);
      if (rest !== null && rest < S().settings.minRestHours) warns.push(`Only ${rest.toFixed(1)} h rest since previous duty`);
      $('#dl-out', panel).innerHTML = `Duty length <b>${len.toFixed(1)} h</b>${rest !== null ? ` · rest since previous duty <b>${rest.toFixed(1)} h</b>` : ''}${warns.length ? `<br><span class="overdue">${warns.join(' · ')}</span>` : ' · <span style="color:var(--success)">within demo thresholds</span>'}`;
    };
    f.addEventListener('input', check); check();
    $('#dl-save', panel).addEventListener('click', () => {
      if (!validate(f, (v) => (new Date(v.end) <= new Date(v.start) ? { end: 'End must be after start' } : {}))) return;
      const v = formValues(f);
      c.manualDuty.push({ start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString() });
      store.audit('Duty period logged', c.name); store.save();
      closeOverlay(); toast('Duty logged'); draw();
    });
  };
  on(main, 'click', '[data-duty]', (e, b) => logDuty(b.dataset.duty));
  $('#log-duty').addEventListener('click', () => logDuty(S().crew[0].id));
  on(main, 'click', '[data-assign]', (e, b) => {
    const t = S().trips.find((x) => x.id === b.dataset.assign); const ac = acBy(t.aircraftId);
    const s = ts(t.depart) - HOUR, en = ts(t.arrive) + HOUR / 2;
    const rated = S().crew.filter((c) => c.ratings.includes(ac.model) || c.role === 'Flight Attendant');
    const panel = openModal({
      title: `Assign crew · ${t.id}`,
      body: `<p>${route(t.from, t.to)} · ${esc(acLabel(ac))} · ${fmt.dateTime(t.depart)}</p><form id="as" style="margin-top:12px"><fieldset style="border:0;padding:0;margin:0"><legend class="field-label">Crew rated on ${esc(ac.model)}</legend><ul class="list">
        ${rated.map((c) => { const busy = crewDutyPeriods(c.id).some((p) => p.src !== t.id && p.start < en && p.end > s); const med = expiry(c.medicalExp) === 'expired'; return `<li><label class="check grow"><input type="checkbox" name="crew" value="${c.id}" ${t.crew.includes(c.id) ? 'checked' : ''}/> ${esc(c.name)} <span class="meta">· ${c.role}</span></label>${busy ? badge('expiring', 'Overlapping duty') : ''}${med ? badge('expired', 'Medical expired') : ''}</li>`; }).join('') || '<li class="meta">No rated crew</li>'}
      </ul></fieldset></form><p class="muted" style="font-size:12px">Assignment is a scheduling record — crew legality requires qualified verification.</p>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="as-save">Save assignment</button>',
    });
    $('#as-save', panel).addEventListener('click', () => {
      if (!guard('approveTrip')) return;
      const ids = $$('input[name="crew"]:checked', panel).map((i) => i.value);
      store.update('trips', t.id, { crew: ids }, 'Crew assigned');
      closeOverlay();
      const c = findConflicts(S()).filter((x) => x.kind === 'crew' && (x.tripId === t.id || x.text.includes(t.id)));
      toast(c.length ? `Saved — ${plural(c.length, 'crew conflict')}` : 'Crew assignment saved', c.length ? 'danger' : 'success'); draw();
    });
  });
}

/* =========================================================
   MAINTENANCE — oversight with human review
   ========================================================= */
function maintenance() {
  const st = { ac: '', status: '', type: '' };
  $('#m-ac').innerHTML = '<option value="">All aircraft</option>' + S().aircraft.map((a) => `<option value="${a.id}">${a.tail}</option>`).join('');
  $('#m-type').innerHTML = '<option value="">All types</option>' + [...new Set(S().maintenance.map((m) => m.type))].map((t) => `<option>${t}</option>`).join('');
  const draw = () => {
    const s = S();
    const all = s.maintenance;
    const list = all.filter((m) => (!st.ac || m.aircraftId === st.ac) && (!st.status || mxState(m) === st.status) && (!st.type || m.type === st.type)).sort((a, b) => ts(a.dueDate) - ts(b.dueDate));
    const grounded = s.aircraft.filter((a) => groundingFlags(a.id).length);
    $('#mx-kpis').innerHTML = [
      kpi({ label: 'Open items', value: all.filter((m) => !['closed'].includes(m.state)).length }),
      kpi({ label: 'Overdue', value: all.filter((m) => mxState(m) === 'overdue').length, tone: all.some((m) => mxState(m) === 'overdue') ? 'danger' : '' }),
      kpi({ label: 'Due ≤ 30 days / 25 h', value: all.filter((m) => mxState(m) === 'due-soon').length, tone: 'gold' }),
      kpi({ label: 'Potential grounding', value: grounded.length, sub: 'Aircraft with indicators', tone: grounded.length ? 'danger' : '' }),
    ].join('');
    $('#grounding').innerHTML = grounded.length ? `<div class="cols-3">${grounded.map((a) => `<article class="card" style="border-color:rgba(217,107,105,0.35)">
      <div class="row-between"><b>${a.tail}</b>${badge(a.status)}</div><p class="muted" style="font-size:12px">${esc(a.model)} · ${a.base}</p>
      <ul class="checks" style="margin-top:10px">${groundingFlags(a.id).map((f) => `<li><span class="bad" aria-hidden="true">!</span><span>${esc(f)}</span></li>`).join('')}</ul>
      <label class="field" style="margin-top:12px"><span>Aircraft status</span><select data-acstatus="${a.id}">${['available', 'maintenance', 'aog'].map((x) => `<option value="${x}" ${a.status === x ? 'selected' : ''}>${x === 'aog' ? 'AOG' : x}</option>`).join('')}</select></label>
      <p class="card-foot">Indicator only — verify with maintenance control.</p></article>`).join('')}</div>` : '<p class="muted">No grounding indicators.</p>';

    $('#mx-count').textContent = `${list.length} items`;
    $('#mx-table').innerHTML = list.length ? `<div class="table-wrap"><table class="table responsive"><caption class="sr-only">Maintenance due items</caption><thead><tr><th>Aircraft</th><th>Item</th><th>Type</th><th>Due date</th><th class="r">Hours left</th><th>Status</th><th>Source reference</th><th class="r">Review</th></tr></thead><tbody>
      ${list.map((m) => { const a = acBy(m.aircraftId); const d = fmt.daysFromNow(m.dueDate); const hl = m.dueHours - a.totalTime; return `<tr>
        <td data-label="Aircraft"><a href="${href('platform/aircraft-detail.html?id=' + a.id)}">${a.tail}</a></td><td data-label="Item">${esc(m.item)} ${m.grounding ? '<span class="tag" title="Grounding if overdue">grounding</span>' : ''}</td><td data-label="Type">${esc(m.type)}</td>
        <td data-label="Due date">${fmt.date(m.dueDate)} <span class="${d < 0 ? 'overdue' : 'muted'}">(${d < 0 ? -d + 'd over' : d + 'd'})</span></td><td data-label="Hours left" class="r ${hl <= 0 ? 'overdue' : ''}">${hl.toLocaleString()} h</td>
        <td data-label="Status">${badge(mxState(m))}</td><td data-label="Source"><span class="muted" style="font-size:12px">${esc(m.ref)}</span></td>
        <td class="actions">${m.state === 'reviewed' ? `<span class="muted" style="font-size:12px">by ${esc(m.reviewedBy)}</span> <button class="btn btn-sm" data-close-mx="${m.id}">Close</button>` : m.state === 'closed' ? '—' : `<button class="btn btn-sm" data-review="${m.id}">Record review</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : emptyState('No items match');

    // 5-week calendar
    const start = (() => { const d = T.startOfToday(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
    const days = Array.from({ length: 35 }, (_, i) => start + i * DAY);
    $('#mx-cal').innerHTML = `<div class="gantt-scroll"><div class="week" style="grid-template-columns:repeat(7,minmax(110px,1fr));min-width:780px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="wk-head">${d}</div>`).join('')}
      ${days.map((d) => { const items = all.filter((m) => m.state !== 'closed' && ts(m.dueDate) >= d && ts(m.dueDate) < d + DAY); return `<div class="wk-cell ${d === T.startOfToday().getTime() ? 'today' : ''}"><span class="muted" style="font-size:11px">${new Date(d).getDate()}</span>${items.map((m) => `<button class="trip-chip ${mxState(m) === 'overdue' ? 'conflict' : ''}" data-review="${m.id}" title="${esc(m.item)}">${acBy(m.aircraftId).tail} · ${esc(m.item.split(' ')[0])}</button>`).join('')}</div>`; }).join('')}</div></div>`;

    const docs = s.documents.filter((d) => d.expires && (!st.ac || d.aircraftId === st.ac)).sort((a, b) => ts(a.expires) - ts(b.expires)).slice(0, 14);
    $('#mx-docs').innerHTML = `<ul class="list">${docs.map((d) => `<li>${icon('doc', 16)}<span class="grow"><span class="title">${acBy(d.aircraftId).tail} · ${esc(d.name)}</span><span class="meta"> · ${fmt.date(d.expires)}</span></span>${badge(expiry(d.expires))}</li>`).join('')}</ul><p class="card-foot">Document files are not stored in this demo.</p>`;
  };
  draw();
  $('#m-ac').addEventListener('change', (e) => { st.ac = e.target.value; draw(); });
  $('#m-status').addEventListener('change', (e) => { st.status = e.target.value; draw(); });
  $('#m-type').addEventListener('change', (e) => { st.type = e.target.value; draw(); });
  const main = $('#main');
  on(main, 'change', '[data-acstatus]', (e, sel) => {
    if (!can('reviewMx')) { guard('reviewMx'); draw(); return; }
    const a = store.update('aircraft', sel.dataset.acstatus, { status: sel.value }, `Aircraft status set to ${sel.value}`);
    toast(`${a.tail} set to ${sel.value} — reflected on Command Center & Fleet`); draw();
  });
  on(main, 'click', '[data-review]', (e, b) => {
    const m = S().maintenance.find((x) => x.id === b.dataset.review); const a = acBy(m.aircraftId);
    if (m.state === 'reviewed' || m.state === 'closed') { toast(`${m.item}: ${m.state} by ${m.reviewedBy || '—'}`); return; }
    const panel = openModal({
      title: 'Record human review',
      body: `<dl class="dl"><dt>Aircraft</dt><dd>${a.tail} · ${esc(a.model)}</dd><dt>Item</dt><dd>${esc(m.item)}</dd><dt>Due</dt><dd>${fmt.dateLong(m.dueDate)} / ${m.dueHours.toLocaleString()} h</dd><dt>Source</dt><dd>${esc(m.ref)}</dd></dl>
        <form id="rv" class="form-grid" style="margin-top:14px" novalidate>
          <label class="field span-2"><span>Reviewer name</span><input name="by" type="text" required maxlength="60" autocomplete="name"/></label>
          <label class="field span-2"><span>Note</span><textarea name="note" maxlength="300" placeholder="e.g. Confirmed against maintenance tracking program; scheduled for next phase visit"></textarea></label>
          <label class="check span-2"><input type="checkbox" name="verified" required/> I verified this item against the source document of record.</label>
        </form>
        <p class="notice" style="margin-top:12px">${icon('alert', 16)}<span>Recording a review is an acknowledgement in AERO. It is <b>not</b> a maintenance release or return to service.</span></p>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rv-save">Record review</button>',
    });
    $('#rv-save', panel).addEventListener('click', () => {
      if (!guard('reviewMx')) return;
      const f = $('#rv', panel); if (!validate(f)) return;
      const v = formValues(f);
      store.update('maintenance', m.id, { state: 'reviewed', reviewedBy: v.by, reviewedAt: new Date().toISOString(), note: v.note }, `Maintenance item reviewed by ${v.by}`);
      closeOverlay(); toast('Review recorded (not a maintenance release)'); draw();
    });
  });
  on(main, 'click', '[data-close-mx]', (e, b) => {
    if (!guard('reviewMx')) return;
    store.update('maintenance', b.dataset.closeMx, { state: 'closed' }, 'Maintenance item closed in AERO');
    toast('Item closed in AERO tracking view'); draw();
  });
}

/* =========================================================
   FINANCE — aircraft economics
   ========================================================= */
function periodTrips(days) {
  const from = Date.now() - days * DAY;
  return S().trips.filter((t) => t.status === 'completed' && ts(t.depart) >= from);
}

function ownerStatement(ownerId, days = 30) {
  const o = ownerBy(ownerId);
  const rows = o.aircraft.map((id) => {
    const a = acBy(id);
    const trips = periodTrips(days).filter((t) => t.aircraftId === id);
    const charterRev = trips.filter((t) => t.type === 'charter').reduce((s, t) => s + econ(t).revenue, 0);
    const cost = trips.reduce((s, t) => s + econ(t).cost, 0);
    const mgmt = Math.round(charterRev * 0.1);
    return { a, hours: trips.reduce((s, t) => s + t.hours, 0), trips: trips.length, charterRev, cost, mgmt, net: charterRev - cost - mgmt };
  });
  return { o, rows, total: rows.reduce((s, r) => s + r.net, 0) };
}

function finance() {
  let days = 30;
  const draw = () => {
    const trips = periodTrips(days);
    const rev = trips.reduce((s, t) => s + econ(t).revenue, 0), cost = trips.reduce((s, t) => s + econ(t).cost, 0);
    const inv = S().invoices;
    const openInv = inv.filter((i) => i.status !== 'paid');
    const comm = S().brokers.map((b) => { const ts2 = trips.filter((t) => t.brokerId === b.id && t.type === 'charter'); const gross = ts2.reduce((s, t) => s + econ(t).revenue, 0); return { b, trips: ts2.length, gross, due: Math.round(gross * b.rate) }; });
    $('#fin-kpis').innerHTML = [
      kpi({ label: `Revenue · ${days} days`, value: fmt.money(rev, { compact: true }) + '<span class="sim">Sim</span>' }),
      kpi({ label: 'Direct operating cost', value: fmt.money(cost, { compact: true }) }),
      kpi({ label: 'Gross margin', value: fmt.pct(rev ? (rev - cost) / rev : 0), tone: 'gold' }),
      kpi({ label: 'Open invoices', value: fmt.money(openInv.reduce((s, i) => s + i.amount, 0), { compact: true }), sub: plural(openInv.length, 'invoice') }),
      kpi({ label: 'Broker commissions', value: fmt.money(comm.reduce((s, c) => s + c.due, 0), { compact: true }) }),
    ].join('');

    const buckets = days <= 30 ? 6 : 13; const span = (days * DAY) / buckets;
    const labels = [], rs = [], cs = [];
    for (let i = 0; i < buckets; i++) {
      const f = Date.now() - days * DAY + i * span, to = f + span;
      const tt = S().trips.filter((t) => t.status === 'completed' && ts(t.depart) >= f && ts(t.depart) < to);
      labels.push(fmt.date(new Date(to).toISOString())); rs.push(tt.reduce((s, t) => s + econ(t).revenue, 0)); cs.push(tt.reduce((s, t) => s + econ(t).cost, 0));
    }
    mount($('#fin-chart'), (w) => lineChart({ width: w, height: 220, labels, series: [{ name: 'Revenue', values: rs }, { name: 'Direct cost', values: cs }], format: (v) => fmt.money(v, { compact: true }), label: 'Revenue vs cost' }));

    const pl = S().aircraft.map((a) => { const t = trips.filter((x) => x.aircraftId === a.id); const r = t.reduce((s, x) => s + econ(x).revenue, 0), c = t.reduce((s, x) => s + econ(x).cost, 0), h = t.reduce((s, x) => s + x.hours, 0); return { a, r, c, h, m: r - c }; }).sort((x, y) => y.m - x.m);
    $('#pl').innerHTML = `<div class="table-wrap"><table class="table responsive"><caption class="sr-only">Aircraft profit and loss</caption><thead><tr><th>Aircraft</th><th class="r">Hours</th><th class="r">Revenue</th><th class="r">Direct cost</th><th class="r">Margin</th><th class="r">Margin %</th><th class="r">Rev / h</th></tr></thead><tbody>
      ${pl.map((x) => `<tr><td data-label="Aircraft"><a href="${href('platform/aircraft-detail.html?id=' + x.a.id)}">${x.a.tail}</a> <span class="muted">${esc(x.a.model)}</span></td><td data-label="Hours" class="r">${x.h.toFixed(1)}</td><td data-label="Revenue" class="r">${fmt.money(x.r)}</td><td data-label="Cost" class="r">${fmt.money(x.c)}</td><td data-label="Margin" class="r ${x.m < 0 ? 'overdue' : ''}">${fmt.money(x.m)}</td><td data-label="Margin %" class="r">${x.r ? fmt.pct(x.m / x.r) : '—'}</td><td data-label="Rev / h" class="r">${x.h ? fmt.money(x.r / x.h) : '—'}</td></tr>`).join('')}</tbody></table></div>`;

    const invF = $('#inv-filter').value;
    $('#invoices').innerHTML = `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Invoice</th><th>Customer</th><th>Trip</th><th>Issued</th><th class="r">Amount</th><th>Status</th><th class="r">Action</th></tr></thead><tbody>
      ${inv.filter((i) => !invF || i.status === invF).slice(0, 25).map((i) => `<tr><td data-label="Invoice">${i.id}</td><td data-label="Customer">${esc(custBy(i.customerId)?.name || '—')}</td><td data-label="Trip">${i.tripId}</td><td data-label="Issued">${fmt.date(i.issued)}</td><td data-label="Amount" class="r">${fmt.money(i.amount)}</td><td data-label="Status">${badge(i.status)}</td>
      <td class="actions">${i.status === 'draft' ? `<button class="btn btn-sm" data-inv="${i.id}" data-to="sent">Mark sent</button>` : i.status === 'sent' ? `<button class="btn btn-sm" data-inv="${i.id}" data-to="paid">Record payment (demo)</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="card-foot">Payment processing is not connected (integration stub). No card data is collected or stored.</p>`;

    $('#commissions').innerHTML = `<ul class="list">${comm.map((c) => `<li><span class="grow"><span class="title">${esc(c.b.name)}</span><span class="meta"> · ${plural(c.trips, 'trip')} · ${fmt.pct(c.b.rate)} of ${fmt.money(c.gross)}</span></span><b class="num">${fmt.money(c.due)}</b></li>`).join('')}</ul>`;
  };
  $('#fin-owner').innerHTML = S().owners.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
  pressGroup($('#fin-period'), 'data-days', (v) => { days = Number(v); draw(); });
  $('#inv-filter').addEventListener('change', draw);
  on($('#main'), 'click', '[data-inv]', (e, b) => {
    if (!guard('finance')) return;
    store.update('invoices', b.dataset.inv, { status: b.dataset.to }, `Invoice marked ${b.dataset.to}`);
    toast(`${b.dataset.inv} marked ${b.dataset.to}${b.dataset.to === 'paid' ? ' (demo record only)' : ''}`); draw();
  });
  draw();

  // trip margin estimator
  const est = $('#estimator');
  est.aircraftId.innerHTML = aircraftOptions('a4');
  const preset = () => { const a = acBy(est.aircraftId.value); est.rate.value = a.hourlyRate; est.burn.value = a.burnGph; est.reserve.value = CLASSES[a.cls].reserve; };
  const calc = () => {
    const v = Object.fromEntries(['hours', 'rate', 'burn', 'fuel', 'reserve', 'crewDay', 'days', 'fees', 'repo'].map((k) => [k, Number(est[k].value) || 0]));
    const revenue = v.hours * v.rate;
    const flyHours = v.hours + v.repo;
    const fuel = flyHours * v.burn * v.fuel;
    const reserves = flyHours * v.reserve;
    const crewC = v.crewDay * v.days;
    const costs = fuel + reserves + crewC + v.fees;
    const margin = revenue - costs;
    $('#est-out').innerHTML = `<dl class="dl"><dt>Revenue (${v.hours} h × ${fmt.money(v.rate)})</dt><dd class="num">${fmt.money(revenue)}</dd>
      <dt>Fuel (${flyHours.toFixed(1)} h × ${fmt.fuel(v.burn)}/h)</dt><dd class="num">${fmt.money(fuel)}</dd><dt>Engine/MX reserves</dt><dd class="num">${fmt.money(reserves)}</dd>
      <dt>Crew (${v.days} days)</dt><dd class="num">${fmt.money(crewC)}</dd><dt>Fees</dt><dd class="num">${fmt.money(v.fees)}</dd></dl>
      <p class="price" style="margin-top:14px;color:${margin < 0 ? '#F0A9A7' : 'inherit'}">${fmt.money(margin)}<small>est. margin · ${revenue ? fmt.pct(margin / revenue) : '—'}</small></p>
      <p class="muted" style="font-size:12px">${v.repo ? `Includes ${v.repo} h unpaid repositioning — publish it as an empty leg to recover cost.` : 'No repositioning hours included.'}</p>`;
  };
  est.aircraftId.addEventListener('change', () => { preset(); calc(); });
  est.addEventListener('input', calc);
  preset(); calc();

  $('#fin-statement').addEventListener('click', () => {
    const st = ownerStatement($('#fin-owner').value, 30);
    const panel = openModal({
      title: 'Owner statement preview', wide: true,
      body: `<div class="statement"><p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8A7550">AERO · Demo statement — synthetic data</p><h3>${esc(st.o.name)}</h3><p>Period: last 30 days · prepared ${fmt.dateLong(new Date().toISOString())}</p>
        <table><thead><tr><th>Aircraft</th><th class="r">Trips</th><th class="r">Hours</th><th class="r">Charter revenue</th><th class="r">Direct cost</th><th class="r">Mgmt fee 10%</th><th class="r">Net</th></tr></thead>
        <tbody>${st.rows.map((r) => `<tr><td>${r.a.tail}</td><td class="r">${r.trips}</td><td class="r">${r.hours.toFixed(1)}</td><td class="r">${fmt.money(r.charterRev)}</td><td class="r">${fmt.money(r.cost)}</td><td class="r">${fmt.money(r.mgmt)}</td><td class="r"><b>${fmt.money(r.net)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6"><b>Net to owner</b></td><td class="r"><b>${fmt.money(st.total)}</b></td></tr></tfoot></table>
        <p style="font-size:11px;margin-top:12px;color:#5B6470">Illustrative only. Cost model: fuel + hourly reserves + fees + crew days. Not an accounting document.</p></div>`,
      footer: '<button class="btn" id="st-csv">Download CSV</button><button class="btn" data-close>Close</button>',
    });
    $('#st-csv', panel).addEventListener('click', () => download(`aero-owner-statement-${st.o.id}.csv`, toCSV([['Aircraft', 'Trips', 'Hours', 'Charter revenue', 'Direct cost', 'Mgmt fee', 'Net'], ...st.rows.map((r) => [r.a.tail, r.trips, r.hours.toFixed(1), r.charterRev, r.cost, r.mgmt, r.net]), ['Total', '', '', '', '', '', st.total]])));
  });
}

/* =========================================================
   OWNER PORTAL
   ========================================================= */
function ownerPortal() {
  const sel = $('#owner-select');
  sel.innerHTML = S().owners.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
  if (getRole().id === 'owner') sel.value = 'own4';
  const draw = () => {
    const o = ownerBy(sel.value);
    const fleetIds = o.aircraft;
    const t120 = periodTrips(120).filter((t) => fleetIds.includes(t.aircraftId));
    const st = ownerStatement(o.id, 90);
    const approvals = S().approvals.filter((a) => a.ownerId === o.id);
    const pend = approvals.filter((a) => a.status === 'pending');
    $('#own-kpis').innerHTML = [
      kpi({ label: 'Aircraft', value: fleetIds.length }),
      kpi({ label: 'Hours · last 120 days', value: Math.round(t120.reduce((s, t) => s + t.hours, 0)) }),
      kpi({ label: 'Charter trips · 120 days', value: t120.filter((t) => t.type === 'charter').length, sub: `${t120.filter((t) => t.type === 'owner').length} owner trips` }),
      kpi({ label: 'Net to owner · 90 days', value: fmt.money(st.total, { compact: true }) + '<span class="sim">Sim</span>', tone: 'gold' }),
      kpi({ label: 'Pending approvals', value: pend.length, tone: pend.length ? 'danger' : '' }),
    ].join('');
    $('#own-fleet').innerHTML = `<div class="ac-grid">${fleetIds.map((id) => aircraftCard(acBy(id))).join('')}</div>`;

    const months = [];
    for (let m = 3; m >= 0; m--) { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - m); const e = new Date(d); e.setMonth(e.getMonth() + 1); months.push([d.toLocaleDateString('en-US', { month: 'short' }), d.getTime(), e.getTime()]); }
    mount($('#own-util'), (w) => barChart({ width: w, height: 220, labels: months.map((m) => m[0]), series: fleetIds.map((id) => ({ name: acBy(id).tail, values: months.map((m) => Math.round(hoursFlown(id, m[1], m[2]))) })), format: (v) => v + ' h', label: 'Monthly flight hours per aircraft' }));

    const sched = upcoming(21, (t) => fleetIds.includes(t.aircraftId));
    $('#own-schedule').innerHTML = sched.length ? `<ol class="timeline">${sched.slice(0, 10).map((t) => `<li class="${t.approval === 'pending' ? 'warn' : ''}"><p class="t-time">${fmt.dateTime(t.depart)} · ${acBy(t.aircraftId).tail}</p><p>${route(t.from, t.to)} ${badge(t.type)} ${badge(t.approval === 'pending' ? 'pending' : t.status)}</p></li>`).join('')}</ol>` : emptyState('Nothing scheduled in the next 3 weeks');

    $('#own-fin').innerHTML = `<ul class="list">${st.rows.map((r) => `<li><span class="grow"><span class="title">${r.a.tail}</span><span class="meta"> · ${r.trips} trips · ${r.hours.toFixed(1)} h</span></span><span class="meta">Rev ${fmt.money(r.charterRev, { compact: true })} · Cost ${fmt.money(r.cost, { compact: true })}</span><b class="num">${fmt.money(r.net, { compact: true })}</b></li>`).join('')}</ul><p class="card-foot">Last 90 days. Synthetic, illustrative economics.</p>`;

    $('#own-inbox').innerHTML = approvals.length ? `<ul class="list">${approvals.map((a) => `<li><span class="grow"><span class="title">${esc(a.kind)} · ${acBy(a.aircraftId).tail}</span><br><span class="meta">${esc(a.detail)} · ${fmt.date(a.at)}</span></span>${a.status === 'pending' ? `<button class="btn btn-sm btn-danger" data-appr="${a.id}" data-to="declined">Decline</button><button class="btn btn-sm btn-primary" data-appr="${a.id}" data-to="approved">Approve</button>` : badge(a.status)}</li>`).join('')}</ul>${!can('ownerDecision') ? `<p class="card-foot">Switch the demo role to <b>Aircraft Owner</b> to decide.</p>` : ''}` : emptyState('Inbox empty');

    $('#own-req-ac').innerHTML = fleetIds.map((id) => `<option value="${id}">${acBy(id).tail} · ${esc(acBy(id).model)}</option>`).join('');
  };
  sel.addEventListener('change', draw);
  draw();
  const main = $('#main');
  on(main, 'click', '[data-appr]', (e, b) => {
    if (!guard('ownerDecision')) return;
    store.update('approvals', b.dataset.appr, { status: b.dataset.to }, `Owner ${b.dataset.to} request`);
    toast(`Request ${b.dataset.to}`, b.dataset.to === 'approved' ? 'success' : 'danger'); draw();
  });
  $('#own-req').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (!validate(f, (v) => { const a = acBy(v.aircraftId); const x = {}; if (v.from === v.to) x.to = 'Choose a different destination'; if (a && Number(v.pax) > a.pax) x.pax = `Max ${a.pax}`; if (new Date(v.depart).getTime() < Date.now()) x.depart = 'Must be in the future'; if (a && distanceNm(v.from, v.to) > a.rangeNm * 0.9) x.to = 'Beyond planning range — fuel stop needed'; return x; })) return;
    const v = formValues(f); const a = acBy(v.aircraftId);
    const hours = estHours(a, v.from, v.to); const dep = new Date(v.depart).toISOString();
    const trip = { id: 'T' + (6000 + S().trips.length), aircraftId: a.id, from: v.from, to: v.to, depart: dep, arrive: new Date(ts(dep) + hours * HOUR).toISOString(), hours, pax: Number(v.pax), type: 'owner', customerId: null, ownerId: sel.value, brokerId: null, crew: [], status: 'scheduled', approval: 'pending', fbo: null, notes: v.notes || '' };
    S().trips.push(trip);
    store.notify('Owner trip request', `${a.tail} ${v.from} → ${v.to}`, 'operations.html?trip=' + trip.id);
    store.audit('Owner trip requested', trip.id); store.save();
    f.reset(); toast(`Request ${trip.id} sent to Operations — pending approval`, 'success'); draw();
  });
}

/* =========================================================
   AI COPILOT — deterministic, explainable, approval-gated
   ========================================================= */
const SUGGESTED = [
  'Which empty legs should we publish this week?',
  'Which aircraft are under-utilized?',
  'What maintenance is due in the next 30 days?',
  'Any crew expirations or duty warnings?',
  'Are there schedule conflicts?',
  'Which aircraft earned the most last month?',
  'Which leads need follow-up today?',
];

function copilotAnswer(q) {
  const s = S(); const text = q.toLowerCase();
  const out = { html: '', evidence: [], assumptions: [], proposals: [] };
  if (/empty|reposition|leg|publish/.test(text)) {
    const legs = s.emptyLegs.filter((l) => ['candidate', 'validated', 'published'].includes(l.status) && ts(l.depart) < Date.now() + 10 * DAY)
      .map((l) => ({ l, r: recommendPrice(s, l), v: l.validation || validateLeg(s, l) })).sort((a, b) => b.r.demand.score - a.r.demand.score).slice(0, 3);
    if (!legs.length) { out.html = 'I don’t see open repositioning legs in the next 10 days. Run detection on the Empty-Leg Engine after new one-way trips are scheduled.'; return out; }
    out.html = `I found <b>${legs.length}</b> repositioning legs worth reviewing in the next 10 days:<ol>${legs.map(({ l, r, v }) => `<li>${route(l.from, l.to)} · ${acBy(l.aircraftId).tail} · ${fmt.dateTime(l.depart)} — demand <b>${r.demand.score}</b>, recommended <b>${fmt.money(r.recommended)}</b> (floor ${fmt.money(r.floor)}). Availability check: <b>${v.overall}</b>${l.status === 'published' ? ' · already published' : ''}.</li>`).join('')}</ol>`;
    legs.forEach(({ l, r }) => out.evidence.push(`${l.id}: ${l.reason}`, ...r.demand.evidence.slice(0, 2)));
    out.assumptions = legs[0].r.assumptions.slice(0, 4).concat('Crew legality, slots and permits are not verified by AERO');
    legs.filter(({ l, v }) => l.status !== 'published' && v.overall === 'validated').forEach(({ l, r }) => out.proposals.push({ label: `Publish ${l.from}→${l.to} at ${fmt.money(r.recommended)}`, perm: 'publishLeg', run: () => { l.validation = validateLeg(s, l); if (l.validation.overall !== 'validated') return 'Blocked on re-check — not published'; Object.assign(l, { status: 'published', listPrice: r.recommended, publishedAt: new Date().toISOString() }); return `Published ${l.id} to the Marketplace`; } }));
    return out;
  }
  if (/utiliz|idle|under|hours|busy/.test(text)) {
    const rows = s.aircraft.map((a) => { const h = hoursFlown(a.id, Date.now() - 90 * DAY), pace = a.targetHours * 90 / 365; return { a, h, pace, ratio: h / pace }; }).sort((x, y) => x.ratio - y.ratio);
    const low = rows.filter((r) => r.ratio < 0.8).slice(0, 4);
    out.html = low.length ? `These aircraft are below 80% of target pace over the last 90 days:<ul>${low.map((r) => `<li><b>${r.a.tail}</b> ${esc(r.a.model)} — ${Math.round(r.h)} h vs ${Math.round(r.pace)} h pace (${fmt.pct(r.ratio)})${['aog', 'maintenance'].includes(r.a.status) ? ` · currently ${r.a.status}` : ''}</li>`).join('')}</ul>Consider prioritizing them in quotes and marketplace listings.` : 'All aircraft are at or above 80% of their target pace for the last 90 days.';
    out.evidence = rows.slice(0, 6).map((r) => `${r.a.tail}: ${Math.round(r.h)} h flown (completed trips, 90d)`);
    out.assumptions = ['Target pace = annual target hours × 90/365', 'Only completed trips are counted'];
    if (low[0]) out.proposals.push({ label: `Create task: market ${low[0].a.tail} to brokers`, perm: 'crm', run: () => { s.tasks.unshift({ id: uid('K'), text: `Market ${low[0].a.tail} availability to brokers`, due: todayISO(), done: false, link: 'marketplace.html' }); return 'Task added to the Command Center'; } });
    return out;
  }
  if (/maint|due|inspect|aog|ground|airworth/.test(text)) {
    const items = s.maintenance.filter((m) => ['overdue', 'due-soon', 'in-work'].includes(mxState(m))).sort((a, b) => ts(a.dueDate) - ts(b.dueDate));
    out.html = items.length ? `${plural(items.length, 'item')} need attention:<ul>${items.slice(0, 6).map((m) => `<li><b>${acBy(m.aircraftId).tail}</b> — ${esc(m.item)} · due ${fmt.date(m.dueDate)} · ${mxState(m)}${m.grounding ? ' · <span class="overdue">grounding if overdue</span>' : ''}</li>`).join('')}</ul>Please confirm each with maintenance control — I can’t determine airworthiness.` : 'Nothing overdue or due within 30 days in the demo tracking data.';
    out.evidence = items.slice(0, 6).map((m) => m.ref);
    out.assumptions = ['Due-soon = within 30 days or 25 flight hours', 'Data is synthetic, not from a maintenance tracking program of record'];
    if (items[0]) out.proposals.push({ label: `Create task: review ${acBy(items[0].aircraftId).tail} ${items[0].item}`, perm: 'reviewMx', run: () => { s.tasks.unshift({ id: uid('K'), text: `Review ${acBy(items[0].aircraftId).tail}: ${items[0].item}`, due: todayISO(), done: false, link: 'maintenance.html' }); return 'Task added'; } });
    return out;
  }
  if (/crew|medical|expir|duty|pilot|rest/.test(text)) {
    const exp = s.crew.flatMap((c) => [['medical', c.medicalExp], ['recurrent', c.recurrentExp]].filter(([, d]) => expiry(d) !== 'valid').map(([k, d]) => ({ c, k, d })));
    const conflicts = findConflicts(s).filter((c) => c.kind === 'crew');
    out.html = `${exp.length ? `Expiring or expired items:<ul>${exp.map((x) => `<li><b>${esc(x.c.name)}</b> — ${x.k} ${expiry(x.d)} ${fmt.date(x.d)}</li>`).join('')}</ul>` : 'No crew items expire within 30 days.'} ${conflicts.length ? `<p>Also, ${plural(conflicts.length, 'crew double-booking')}: ${conflicts.map((c) => esc(c.text)).join('; ')}.</p>` : ''}`;
    out.evidence = exp.map((x) => `${x.c.name} ${x.k} date on file`).concat(conflicts.map((c) => c.text));
    out.assumptions = [`Demo thresholds: ${s.settings.dutyLimitHours} h duty / ${s.settings.minRestHours} h rest`, 'Legality must be verified by a qualified person against approved rules'];
    if (conflicts[0]) out.proposals.push({ label: `Open trip ${conflicts[0].tripId} to reassign crew`, perm: 'approveTrip', run: () => { location.href = 'operations.html?trip=' + conflicts[0].tripId; return 'Opening Operations…'; } });
    return out;
  }
  if (/conflict|double|overlap|schedul/.test(text)) {
    const c = findConflicts(s);
    out.html = c.length ? `I found ${plural(c.length, 'conflict')}:<ul>${c.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : 'No aircraft, crew or status conflicts in the upcoming schedule.';
    out.evidence = c.map((x) => `Trip ${x.tripId}`);
    out.assumptions = ['Overlap = departure/arrival windows intersect', 'Aircraft in maintenance/AOG with future trips are flagged'];
    if (c[0]) out.proposals.push({ label: `Open ${c[0].tripId} in Operations`, perm: 'approveTrip', run: () => { location.href = 'operations.html?trip=' + c[0].tripId; return 'Opening Operations…'; } });
    return out;
  }
  if (/revenue|margin|profit|earn|money|month/.test(text)) {
    const trips = periodTrips(30);
    const rows = s.aircraft.map((a) => { const t = trips.filter((x) => x.aircraftId === a.id); return { a, r: t.reduce((x, y) => x + econ(y).revenue, 0), m: t.reduce((x, y) => x + econ(y).margin, 0), n: t.length }; }).sort((x, y) => y.r - x.r);
    out.html = `Top earners over the last 30 days (simulated economics):<ol>${rows.slice(0, 4).map((r) => `<li><b>${r.a.tail}</b> — revenue ${fmt.money(r.r)}, margin ${fmt.money(r.m)} across ${plural(r.n, 'trip')}</li>`).join('')}</ol>`;
    out.evidence = rows.slice(0, 4).map((r) => `${r.a.tail}: ${r.n} completed trips`);
    out.assumptions = ['Charter revenue = block hours × rate card', 'Owner trips billed at direct cost + 15%', 'Direct cost = fuel + reserves + fees + crew days'];
    return out;
  }
  if (/lead|pipeline|follow|crm|quote|client/.test(text)) {
    const due = s.leads.filter((l) => !['won', 'lost'].includes(l.stage) && fmt.daysFromNow(l.nextFollowUp) <= 0).sort((a, b) => ts(a.nextFollowUp) - ts(b.nextFollowUp));
    out.html = due.length ? `${plural(due.length, 'lead')} need follow-up today or are overdue:<ul>${due.map((l) => `<li><b>${esc(custBy(l.customerId)?.name)}</b> — ${route(l.from, l.to)} · ${STAGE_LABEL[l.stage]} · due ${fmt.date(l.nextFollowUp)}</li>`).join('')}</ul>` : 'No follow-ups due today.';
    out.evidence = due.map((l) => `Lead ${l.id} follow-up ${l.nextFollowUp}`);
    out.assumptions = ['Open = not won or lost'];
    if (due[0]) out.proposals.push({ label: `Reschedule all ${due.length} follow-ups to tomorrow`, perm: 'crm', run: () => { const d = new Date(Date.now() + DAY).toISOString().slice(0, 10); due.forEach((l) => { l.nextFollowUp = d; l.activity.unshift({ at: new Date().toISOString(), text: 'Follow-up rescheduled by Copilot proposal (approved)' }); }); return `${due.length} follow-ups moved to ${d}`; } });
    return out;
  }
  out.html = `I can answer from the demo records about: empty legs, utilization, maintenance due items, crew expirations and duty warnings, schedule conflicts, revenue by aircraft, and CRM follow-ups. Try one of the suggested questions.`;
  return out;
}

function aiCopilot() {
  const log = $('#chat-log');
  const render = (role, html) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = html;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
    return div;
  };
  const ask = (q) => {
    if (!q.trim()) return;
    render('user', esc(q));
    const typing = render('ai', '<span class="typing" aria-label="Thinking"><span></span><span></span><span></span></span>');
    setTimeout(() => {
      const a = copilotAnswer(q);
      S().copilotLog.unshift({ at: new Date().toISOString(), q, role: getRole().id });
      store.save(false);
      typing.innerHTML = `${a.html}
        ${a.evidence.length || a.assumptions.length ? `<div class="evidence">${a.evidence.length ? `<h4>Evidence (demo records)</h4><ul>${a.evidence.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}${a.assumptions.length ? `<h4>Assumptions</h4><ul>${a.assumptions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        ${a.proposals.map((p, i) => `<div class="proposal" data-prop="${i}"><span><b>Proposed action</b> — ${esc(p.label)}</span><span class="muted" style="font-size:12px">Requires your approval. Nothing happens until you approve.</span><div class="row"><button class="btn btn-sm btn-primary" data-approve>Approve</button><button class="btn btn-sm" data-dismiss>Dismiss</button></div></div>`).join('')}`;
      a.proposals.forEach((p, i) => {
        const box = typing.querySelector(`[data-prop="${i}"]`);
        box.querySelector('[data-approve]').addEventListener('click', () => {
          if (!guard(p.perm)) return;
          const msg = p.run();
          store.audit('Copilot proposal approved', p.label); store.save();
          box.innerHTML = `<span>${icon('check', 14)} Approved by ${esc(getRole().label)} — ${esc(msg)}</span>`;
          toast(msg, 'success'); side();
        });
        box.querySelector('[data-dismiss]').addEventListener('click', () => { store.audit('Copilot proposal dismissed', p.label); store.save(); box.innerHTML = '<span class="muted">Dismissed.</span>'; });
      });
      log.scrollTop = log.scrollHeight;
    }, reducedMotion() ? 0 : 450);
  };
  render('ai', `Hello — I answer questions from this workspace’s <b>synthetic demo records</b> and show the evidence behind each answer. I can propose actions, but I never take them without approval. <span class="muted">No language model is called in this prototype.</span>`);
  $('#suggest').innerHTML = SUGGESTED.map((q) => `<button class="pill" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  on($('#suggest'), 'click', '[data-q]', (e, b) => ask(b.dataset.q));
  const form = $('#chat-form');
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = form.q.value; form.q.value = ''; ask(q); });
  form.q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const side = () => {
    const s = S();
    const legs = s.emptyLegs.filter((l) => ['candidate', 'published'].includes(l.status)).map((l) => ({ l, r: recommendPrice(s, l) })).sort((a, b) => b.r.demand.score - a.r.demand.score).slice(0, 4);
    const low = s.aircraft.map((a) => ({ a, ratio: hoursFlown(a.id, Date.now() - 90 * DAY) / (a.targetHours * 90 / 365) })).sort((x, y) => x.ratio - y.ratio)[0];
    const c = findConflicts(s);
    const mxN = s.maintenance.filter((m) => mxState(m) === 'overdue').length;
    $('#insights').innerHTML = `<ul class="list">
      <li><span class="grow"><span class="title">Lowest utilization</span><br><span class="meta">${low.a.tail} at ${fmt.pct(low.ratio)} of target pace (90d)</span></span></li>
      <li><span class="grow"><span class="title">Schedule conflicts</span><br><span class="meta">${plural(c.length, 'conflict')} in upcoming trips</span></span>${c.length ? badge('expired', String(c.length)) : badge('valid', '0')}</li>
      <li><span class="grow"><span class="title">Overdue maintenance</span><br><span class="meta">${plural(mxN, 'item')} — verify with maintenance control</span></span></li></ul>`;
    $('#ai-legs').innerHTML = `<ul class="list">${legs.map(({ l, r }) => `<li><span class="grow"><span class="title">${route(l.from, l.to)}</span><span class="meta"> · ${acBy(l.aircraftId).tail} · ${fmt.date(l.depart)}</span></span><span class="meta">D${r.demand.score}</span><b class="num">${fmt.money(l.listPrice || r.recommended, { compact: true })}</b></li>`).join('') || '<li class="meta">None</li>'}</ul>`;
  };
  side();
  if (param('q')) ask(param('q'));
}

/* =========================================================
   MARKETPLACE — broker & charter marketplace
   ========================================================= */
export function quoteRequest({ leg, aircraft, onDone }) {
  const a = aircraft || acBy(leg.aircraftId);
  const from = leg ? leg.from : a.base;
  const to = leg ? leg.to : '';
  const date = (leg ? leg.depart : new Date(Date.now() + 7 * DAY).toISOString()).slice(0, 10);
  const panel = openModal({
    title: leg ? 'Request this empty leg' : `Request a quote · ${a.tail}`, wide: true,
    body: `<p class="notice info" style="margin-bottom:14px">${icon('alert', 16)}<span>Availability is <b>not confirmed</b>. Your request goes to the operator’s CRM; the operator confirms aircraft, crew and price before anything is booked.</span></p>
      <form id="qr" class="form-grid" novalidate>
        <label class="field"><span>Your name</span><input name="name" type="text" required maxlength="80" autocomplete="name"/></label>
        <label class="field"><span>Company / brokerage</span><input name="company" type="text" maxlength="80" autocomplete="organization"/></label>
        <label class="field span-2"><span>Email</span><input name="email" type="email" required autocomplete="email"/></label>
        <label class="field"><span>From</span><select name="from" required ${leg ? 'disabled' : ''}>${airportOptions(from)}</select></label>
        <label class="field"><span>To</span><select name="to" required ${leg ? 'disabled' : ''}><option value="">Select…</option>${airportOptions(to)}</select></label>
        <label class="field"><span>Date</span><input name="date" type="date" required min="${todayISO()}" value="${date}" ${leg ? 'readonly' : ''}/></label>
        <label class="field"><span>${a.cls === 'cargo' ? 'Crew/handlers on board' : `Passengers (max ${a.pax})`}</span><input name="pax" type="number" min="${a.cls === 'cargo' ? 0 : 1}" max="${Math.max(1, a.pax)}" required value="${a.cls === 'cargo' ? 0 : 2}"/></label>
        <label class="field span-2"><span>Notes</span><textarea name="notes" maxlength="400" placeholder="Flexibility, pets, catering…"></textarea></label>
      </form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="qr-send">Send request</button>',
  });
  $('#qr-send', panel).addEventListener('click', () => {
    const f = $('#qr', panel);
    if (!validate(f, (v) => { const x = {}; const to2 = leg ? leg.to : v.to; const fr = leg ? leg.from : v.from; if (!leg && fr === to2) x.to = 'Choose a different destination'; if (!leg && to2 && distanceNm(fr, to2) > a.rangeNm * 0.9) x.to = `Beyond ${a.model} planning range`; return x; })) return;
    const v = formValues(f);
    const fr = leg ? leg.from : v.from, to2 = leg ? leg.to : v.to;
    let cust = S().customers.find((c) => c.name.toLowerCase() === (v.company || v.name).toLowerCase());
    if (!cust) { cust = { id: uid('c'), name: v.company || v.name, type: v.company ? 'Broker' : 'Private', contact: v.name, tier: 'New', trips: 0 }; S().customers.push(cust); }
    const lead = { id: 'L' + (300 + S().leads.length), customerId: cust.id, from: fr, to: to2, depart: (leg ? leg.depart : v.date + 'T12:00:00.000Z'), pax: Number(v.pax), stage: 'new', value: leg ? (leg.listPrice || 0) : Math.round(estHours(a, fr, to2) * a.hourlyRate), source: leg ? 'Empty-leg inquiry' : 'Marketplace', nextFollowUp: todayISO(), owner: 'Sales', quote: null, legId: leg?.id || null, activity: [{ at: new Date().toISOString(), text: `Marketplace request on ${leg ? 'empty leg ' + leg.id : a.tail}${v.notes ? ': ' + v.notes : ''}` }] };
    S().leads.unshift(lead);
    if (leg) leg.inquiries.push({ id: uid('Q'), broker: cust.name, pax: Number(v.pax), note: v.notes || 'Marketplace request', at: new Date().toISOString(), state: 'open' });
    store.notify('Marketplace request', `${fr} → ${to2} · ${cust.name}`, 'charter-crm.html');
    store.audit('Marketplace quote request', lead.id); store.save();
    panel.querySelector('.modal-body').innerHTML = `<div class="state" role="status">${icon('check', 28)}<p><b>Request sent to the operator’s CRM (demo).</b><br>Reference ${lead.id}. Availability: ${badge('pending', 'Pending operator confirmation')}</p></div>`;
    panel.querySelector('.modal-foot').innerHTML = '<button class="btn btn-primary" data-close>Done</button>';
    onDone && onDone();
  });
}

function marketplace() {
  const f = filterState();
  let tab = 'legs';
  const legsList = () => applyLegFilters(S().emptyLegs.filter((l) => l.status === 'published' && ts(l.depart) > Date.now()), f);
  const acList = () => S().aircraft.filter((a) => !['aog', 'maintenance'].includes(a.status) && (!f.cls || a.cls === f.cls) && (!f.from || a.base === f.from || distanceNm(a.base, f.from) < 400) && (!f.region || airport(a.base).region === f.region));
  const draw = () => {
    $('#mk-summary').textContent = tab === 'legs' ? `${plural(legsList().length, 'published empty leg')}` : `${plural(acList().length, 'aircraft')} available for charter quotes`;
    if (tab === 'legs') {
      const list = legsList().sort((a, b) => ts(a.depart) - ts(b.depart));
      $('#mk-out').innerHTML = list.length ? `<div class="leg-grid">${list.map((l) => `<div>${legCard(l, { readonly: true })}<div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm" data-req-leg="${l.id}">Request this leg</button><button class="btn btn-sm" data-detail-leg="${l.id}">Details</button></div></div>`).join('')}</div>` : emptyState('No published empty legs match. Operators publish new legs as schedules change.', '<button class="btn btn-sm" id="mk-clear2">Clear filters</button>');
    } else {
      const list = acList();
      $('#mk-out').innerHTML = list.length ? `<div class="ac-grid">${list.map((a) => `<article class="ac-card" style="cursor:default"><div class="ac-media">${acPhoto(a)}${badge('', 'Availability unconfirmed')}<span class="ac-tail">${a.tail}</span></div>
        <div class="ac-body"><div class="row-between"><span class="ac-name">${esc(a.make)} ${esc(a.model)}</span><span class="muted" style="font-size:12px">${CLASSES[a.cls].label}</span></div>
        <div class="ac-specs">${a.cls === 'cargo' ? `<span><b>${Math.round((a.payloadLb || 0) / 1000)}k lb</b>payload</span>` : `<span><b>${a.pax}</b>pax</span>`}<span><b>${fmt.dist(a.rangeNm)}</b>range</span><span><b>${a.base}</b>base</span></div>
        <p class="muted" style="font-size:12px">From ${fmt.money(a.hourlyRate)}/h · rate card (synthetic)</p>
        <div class="row"><button class="btn btn-primary btn-sm" data-req-ac="${a.id}">Request quote</button><button class="btn btn-sm" data-detail-ac="${a.id}">Details</button></div></div></article>`).join('')}</div>` : emptyState('No aircraft match');
    }
  };
  const sync = wireFilterPanel('mk', f, draw, () => (tab === 'legs' ? legsList().length : acList().length));
  draw();
  $('#mk-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (!b) return; $$('#mk-tabs [role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); tab = b.dataset.tab; draw(); sync(); });
  const out = $('#mk-out');
  on(out, 'click', '[data-req-leg]', (e, b) => quoteRequest({ leg: S().emptyLegs.find((l) => l.id === b.dataset.reqLeg), onDone: draw }));
  on(out, 'click', '[data-req-ac]', (e, b) => quoteRequest({ aircraft: acBy(b.dataset.reqAc), onDone: draw }));
  on(out, 'click', '#mk-clear2', () => $('#mk-clear').click());
  const detail = (a, l) => openDrawer({
    title: l ? `${l.from} → ${l.to}` : a.tail, wide: true,
    body: `<div class="ac-media" style="height:200px;border-radius:12px">${acPhoto(a, 1200)}<span class="ac-tail">${a.tail}</span></div>
      <dl class="dl" style="margin-top:16px"><dt>Aircraft</dt><dd>${esc(a.make)} ${esc(a.model)} · ${a.year}</dd><dt>Class</dt><dd>${CLASSES[a.cls].label}</dd><dt>Seats</dt><dd>${a.pax}</dd><dt>Range</dt><dd>${fmt.dist(a.rangeNm)}</dd><dt>Base</dt><dd>${a.base} · ${esc(city(a.base))}</dd>
      ${l ? `<dt>Departure</dt><dd>${fmt.dateLong(l.depart)} · ${fmt.time(l.depart)} ± ${l.flexHours} h</dd><dt>Block (est.)</dt><dd>${fmt.hours(estHours(a, l.from, l.to))} · ${fmt.dist(distanceNm(l.from, l.to))}</dd><dt>List price</dt><dd><b>${fmt.money(l.listPrice)}</b> for the aircraft</dd>` : `<dt>Rate card</dt><dd>${fmt.money(a.hourlyRate)}/h</dd>`}
      <dt>Availability</dt><dd>${badge('pending', 'Pending operator confirmation')}</dd></dl>`,
    footer: `<button class="btn btn-primary" id="dd-req">${l ? 'Request this leg' : 'Request quote'}</button>`,
  }).querySelector('#dd-req').addEventListener('click', () => { closeOverlay(); quoteRequest({ leg: l, aircraft: a, onDone: draw }); });
  on(out, 'click', '[data-detail-leg]', (e, b) => { const l = S().emptyLegs.find((x) => x.id === b.dataset.detailLeg); detail(acBy(l.aircraftId), l); });
  on(out, 'click', '[data-detail-ac]', (e, b) => detail(acBy(b.dataset.detailAc), null));
}

/* =========================================================
   ANALYTICS — BI with date filters + CSV export
   ========================================================= */
function analytics() {
  const st = { range: '90', from: '', to: '' };
  const bounds = () => {
    const now = Date.now();
    if (st.range === 'custom' && st.from && st.to) return [ts(st.from + 'T00:00:00'), ts(st.to + 'T23:59:59')];
    if (st.range === 'ytd') { const d = new Date(); return [new Date(d.getFullYear(), 0, 1).getTime(), now]; }
    return [now - Number(st.range === 'custom' ? 90 : st.range) * DAY, now];
  };
  let rowsCache = [];
  const draw = () => {
    const [from, to] = bounds();
    const trips = S().trips.filter((t) => t.status === 'completed' && ts(t.depart) >= from && ts(t.depart) <= to);
    const days = Math.max(1, (to - from) / DAY);
    const rev = trips.reduce((s, t) => s + econ(t).revenue, 0), cost = trips.reduce((s, t) => s + econ(t).cost, 0);
    const legs = S().emptyLegs;
    const conv = legs.filter((l) => l.status === 'converted').length;
    $('#an-range').textContent = `${fmt.date(new Date(from).toISOString())} – ${fmt.date(new Date(to).toISOString())} · ${plural(trips.length, 'completed trip')}`;
    $('#an-kpis').innerHTML = [
      kpi({ label: 'Flight hours', value: Math.round(trips.reduce((s, t) => s + t.hours, 0)) }),
      kpi({ label: 'Trips', value: trips.length, sub: `${trips.filter((t) => t.type === 'charter').length} charter · ${trips.filter((t) => t.type === 'reposition').length} empty` }),
      kpi({ label: 'Revenue', value: fmt.money(rev, { compact: true }) + '<span class="sim">Sim</span>' }),
      kpi({ label: 'Avg margin', value: fmt.pct(rev ? (rev - cost) / rev : 0), tone: 'gold' }),
      kpi({ label: 'Empty-leg conversion', value: fmt.pct(conv / Math.max(1, legs.length)), sub: `${conv} of ${legs.length} detected legs` }),
    ].join('');

    $('#an-util').innerHTML = hBars(S().aircraft.map((a) => { const h = trips.filter((t) => t.aircraftId === a.id).reduce((s, t) => s + t.hours, 0); return { label: a.tail, value: Math.round(h), target: Math.round(a.targetHours * days / 365), sub: `${fmt.pct(h / Math.max(1, a.targetHours * days / 365))} of pace` }; }).sort((x, y) => y.value - x.value), { format: (v) => v + ' h' });

    const per = S().aircraft.map((a) => ({ a, r: trips.filter((t) => t.aircraftId === a.id).reduce((s, t) => s + econ(t).revenue, 0) })).sort((x, y) => y.r - x.r);
    mount($('#an-rev'), (w) => barChart({ width: w, height: 240, labels: per.map((x) => x.a.tail.replace(/^N/, '')), series: [{ name: 'Revenue', values: per.map((x) => x.r) }], format: (v) => fmt.money(v, { compact: true }), label: 'Revenue per aircraft' }));

    const months = {};
    trips.forEach((t) => { const k = t.depart.slice(0, 7); months[k] = months[k] || { r: 0, c: 0, h: 0 }; const e = econ(t); months[k].r += e.revenue; months[k].c += e.cost; months[k].h += t.hours; });
    const mk = Object.keys(months).sort();
    mount($('#an-trend'), (w) => mk.length > 1 ? lineChart({ width: w, height: 220, labels: mk.map((k) => new Date(k + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })), series: [{ name: 'Revenue', values: mk.map((k) => months[k].r) }, { name: 'Direct cost', values: mk.map((k) => months[k].c) }], format: (v) => fmt.money(v, { compact: true }), label: 'Monthly revenue and cost' }) : `<p class="muted">Select a range spanning at least two months to see the trend.</p>`);

    const inquiries = legs.reduce((s, l) => s + l.inquiries.length, 0);
    $('#an-funnel').innerHTML = funnel([
      { label: 'Detected', value: legs.length },
      { label: 'Validated', value: legs.filter((l) => l.validation && l.validation.overall === 'validated').length + legs.filter((l) => ['published', 'converted'].includes(l.status) && !l.validation).length },
      { label: 'Published', value: legs.filter((l) => ['published', 'converted'].includes(l.status)).length },
      { label: 'Inquiries', value: inquiries },
      { label: 'Converted to leads', value: conv },
    ]);

    rowsCache = trips.map((t) => { const e = econ(t); const a = acBy(t.aircraftId); return { t, a, e }; }).sort((x, y) => y.e.margin - x.e.margin);
    $('#an-table').innerHTML = `<div class="table-wrap" style="max-height:440px"><table class="table responsive"><caption class="sr-only">Trip profitability</caption><thead><tr><th>Date</th><th>Trip</th><th>Aircraft</th><th>Route</th><th>Type</th><th class="r">Hours</th><th class="r">Revenue</th><th class="r">Cost</th><th class="r">Margin</th><th class="r">Margin %</th></tr></thead><tbody>
      ${rowsCache.slice(0, 60).map(({ t, a, e }) => `<tr><td data-label="Date">${fmt.date(t.depart)}</td><td data-label="Trip">${t.id}</td><td data-label="Aircraft">${a.tail}</td><td data-label="Route">${route(t.from, t.to)}</td><td data-label="Type">${badge(t.type)}</td><td data-label="Hours" class="r">${t.hours.toFixed(1)}</td><td data-label="Revenue" class="r">${fmt.money(e.revenue)}</td><td data-label="Cost" class="r">${fmt.money(e.cost)}</td><td data-label="Margin" class="r ${e.margin < 0 ? 'overdue' : ''}">${fmt.money(e.margin)}</td><td data-label="Margin %" class="r">${e.revenue ? fmt.pct(e.pct) : '—'}</td></tr>`).join('') || '<tr><td colspan="10">No completed trips in range</td></tr>'}</tbody></table></div>
      <p class="card-foot">Showing ${Math.min(60, rowsCache.length)} of ${rowsCache.length}. CSV export includes all rows.</p>`;
  };
  pressGroup($('#an-ranges'), 'data-range', (v) => { st.range = v; $('#an-custom').hidden = v !== 'custom'; draw(); });
  $('#an-from').addEventListener('change', (e) => { st.from = e.target.value; draw(); });
  $('#an-to').addEventListener('change', (e) => { st.to = e.target.value; draw(); });
  $('#an-export').addEventListener('click', () => {
    const [from, to] = bounds();
    const rows = [['Date', 'Trip ID', 'Tail', 'Aircraft', 'From', 'To', 'Type', 'Block hours', 'Revenue USD', 'Direct cost USD', 'Margin USD', 'Margin %', 'Data']].concat(
      rowsCache.map(({ t, a, e }) => [t.depart.slice(0, 10), t.id, a.tail, `${a.make} ${a.model}`, t.from, t.to, t.type, t.hours.toFixed(1), e.revenue, e.cost, e.margin, e.revenue ? (e.pct * 100).toFixed(1) : '', 'synthetic']));
    download(`aero-trip-profitability_${new Date(from).toISOString().slice(0, 10)}_${new Date(to).toISOString().slice(0, 10)}.csv`, toCSV(rows));
    store.audit('Analytics CSV exported', `${rows.length - 1} rows`); store.save(false);
    toast(`Exported ${rows.length - 1} rows`);
  });
  $('#an-export-util').addEventListener('click', () => {
    const [from, to] = bounds(); const days = (to - from) / DAY;
    const rows = [['Tail', 'Aircraft', 'Hours flown', 'Target pace hours', 'Pace %']].concat(S().aircraft.map((a) => { const h = hoursFlown(a.id, from, to); const p = a.targetHours * days / 365; return [a.tail, `${a.make} ${a.model}`, h.toFixed(1), p.toFixed(1), ((h / p) * 100).toFixed(1)]; }));
    download('aero-fleet-utilization.csv', toCSV(rows)); toast('Utilization CSV exported');
  });
  draw();
}

/* =========================================================
   SETTINGS — configuration
   ========================================================= */
function settings() {
  const s = S().settings;
  const org = $('#set-org');
  org.orgName.value = s.orgName; org.orgType.value = s.orgType; org.timezone.value = s.timezone;
  org.addEventListener('submit', (e) => { e.preventDefault(); if (!validate(org)) return; const v = formValues(org); Object.assign(s, v); store.audit('Organization settings saved'); store.save(); toast('Organization saved'); });

  const prefs = $('#set-prefs');
  ['currency', 'distanceUnit', 'fuelUnit'].forEach((k) => (prefs[k].value = s[k]));
  prefs.fuelPrice.value = s.fuelPrice; prefs.dutyLimitHours.value = s.dutyLimitHours; prefs.minRestHours.value = s.minRestHours;
  prefs.addEventListener('submit', (e) => {
    e.preventDefault(); if (!validate(prefs)) return;
    const v = formValues(prefs);
    Object.assign(s, { currency: v.currency, distanceUnit: v.distanceUnit, fuelUnit: v.fuelUnit, fuelPrice: Number(v.fuelPrice), dutyLimitHours: Number(v.dutyLimitHours), minRestHours: Number(v.minRestHours) });
    store.audit('Units, currency & thresholds saved', `${v.currency}/${v.distanceUnit}/${v.fuelUnit}`); store.save(); toast('Preferences saved — applied across modules'); drawAudit();
  });

  $('#set-roles').innerHTML = `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Demo role</th><th>Approve trips</th><th>Publish legs</th><th>Edit aircraft</th><th>Owner decisions</th><th>Review MX</th><th>Finance</th><th class="r"></th></tr></thead><tbody>
    ${ROLES.map((r) => `<tr><td data-label="Role"><b>${r.label}</b>${r.id === getRole().id ? ' <span class="badge badge-gold no-dot">current</span>' : ''}</td>${['approveTrip', 'publishLeg', 'editAircraft', 'ownerDecision', 'reviewMx', 'finance'].map((p) => `<td data-label="${p}">${can(p, r.id) ? '✓' : '<span class="muted">—</span>'}</td>`).join('')}<td class="actions"><button class="btn btn-sm" data-role="${r.id}" ${r.id === getRole().id ? 'disabled' : ''}>Use role</button></td></tr>`).join('')}</tbody></table></div>`;
  on($('#set-roles'), 'click', '[data-role]', (e, b) => { setRole(b.dataset.role); store.audit('Switched demo role', b.dataset.role); store.save(false); location.reload(); });

  $('#set-int').innerHTML = `<ul class="list">${INTEGRATIONS.map((i) => `<li><span class="grow"><span class="title">${esc(i.category)}</span><br><span class="meta">${esc(i.description)}</span><br><span class="meta">Contract: <code>${i.contract.map(esc).join(', ')}</code></span></span><span class="badge" id="int-${i.id}">Not connected</span><button class="btn btn-sm" data-int="${i.id}">Check status</button></li>`).join('')}</ul>`;
  on($('#set-int'), 'click', '[data-int]', async (e, b) => {
    const a = INTEGRATIONS.find((x) => x.id === b.dataset.int);
    const r = await a.status();
    $('#int-' + a.id).textContent = r.connected ? 'Connected' : 'Stub · not connected';
    toast(r.note);
  });

  const notif = $('#set-notif');
  Object.entries(s.notify).forEach(([k, v]) => { if (notif[k]) notif[k].checked = v; });
  notif.addEventListener('change', (e) => { s.notify[e.target.name] = e.target.checked; store.audit('Notification preference changed', `${e.target.name}: ${e.target.checked}`); store.save(); toast('Notification preference saved'); drawAudit(); });

  const drawAudit = () => {
    const q = ($('#audit-q').value || '').toLowerCase();
    const rows = S().audit.filter((a) => !q || `${a.action} ${a.detail} ${a.actor} ${a.role}`.toLowerCase().includes(q)).slice(0, 80);
    $('#audit').innerHTML = `<div class="table-wrap" style="max-height:420px"><table class="table responsive"><thead><tr><th>Time</th><th>Actor (demo)</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows.map((a) => `<tr><td data-label="Time">${fmt.dateTime(a.at)}</td><td data-label="Actor">${esc(a.actor)} <span class="muted">${esc(a.role)}</span></td><td data-label="Action">${esc(a.action)}</td><td data-label="Detail"><span class="muted">${esc(a.detail)}</span></td></tr>`).join('') || '<tr><td colspan="4">No entries</td></tr>'}</tbody></table></div>`;
  };
  $('#audit-q').addEventListener('input', drawAudit);
  drawAudit();
  $('#audit-csv').addEventListener('click', () => download('aero-audit-trail.csv', toCSV([['Time', 'Actor', 'Role', 'Action', 'Detail']].concat(S().audit.map((a) => [a.at, a.actor, a.role, a.action, a.detail])))));
  $('#export-json').addEventListener('click', () => download('aero-demo-data.json', JSON.stringify(S(), null, 2), 'application/json'));
  $('#reset-demo').addEventListener('click', () => {
    const panel = openModal({ title: 'Reset demo data?', body: '<p>This replaces all local demo data (trips, legs, leads, audit trail) with a fresh synthetic dataset. Only this browser is affected.</p>', footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="do-reset">Reset data</button>' });
    $('#do-reset', panel).addEventListener('click', () => { store.reset(); closeOverlay(); toast('Demo data reset'); setTimeout(() => location.reload(), 500); });
  });
}

/* =========================================================
   PASSENGER PORTAL — preserves the original "My AERO" experience
   ========================================================= */
function passenger() {
  const P = () => S().passenger;
  let booking = null; // { legId, step, details }

  const recommendations = () => {
    const pub = S().emptyLegs.filter((l) => l.status === 'published' && l.cls !== 'cargo' && ts(l.depart) > Date.now()); // passengers: no freighters
    const saved = P().savedRoutes;
    const scored = pub.map((l) => {
      let score = 0, why = 'Popular repositioning leg';
      saved.forEach((r) => { if (r.from === l.from && r.to === l.to) { score += 3; why = `Matches your saved route ${r.from} → ${r.to}`; } else if (r.to === l.to) { score += 1; why = `Into ${city(l.to)}, like your saved route`; } else if (airport(r.from)?.region === l.region) { score += 0.5; } });
      if (l.from === P().profile.homeAirport) { score += 1.5; why = `Departs your home airport ${l.from}`; }
      if (l.cls === P().profile.preferredClass) score += 0.5;
      return { l, score, why };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, 4);
  };

  const draw = () => {
    const p = P();
    // upcoming = submitted requests (never shown as confirmed)
    $('#px-upcoming').innerHTML = p.requests.length ? `<ul class="list">${p.requests.map((r) => `<li><span class="grow"><span class="title">${route(r.from, r.to)}</span><span class="meta"> · ${fmt.dateTime(r.depart)} · ${r.pax} pax${r.legId ? ' · empty leg' : ''}</span></span>${badge('submitted')}</li>`).join('')}</ul><p class="card-foot">Requests become flights only after the operator confirms availability.</p>`
      : `<div class="state">No upcoming flights.<br><a href="${href('platform/marketplace.html')}" class="accent-line" style="color:var(--gold)">Browse empty legs →</a></div>`;

    $('#px-routes').innerHTML = `<ul class="list">${p.savedRoutes.map((r, i) => `<li><span class="grow"><span class="title">${route(r.from, r.to)}</span><span class="meta"> · ${esc(r.label || `${city(r.from)} → ${city(r.to)}`)}</span></span><button class="btn btn-sm btn-ghost" data-rm-route="${i}" aria-label="Remove saved route ${r.from} to ${r.to}">${icon('close', 14)}</button></li>`).join('') || '<li class="meta">No saved routes</li>'}</ul>`;

    const recs = recommendations();
    $('#px-recs').innerHTML = recs.length ? `<div class="leg-grid">${recs.map(({ l, why }) => { const a = acBy(l.aircraftId); return `<article class="leg">
      <span class="badge badge-gold no-dot">${icon('spark', 12)} ${esc(why)}</span>
      <div class="leg-route"><div><div class="code">${l.from}</div><div class="city">${esc(city(l.from))}</div></div><div class="line" aria-hidden="true"></div><div style="text-align:right"><div class="code">${l.to}</div><div class="city">${esc(city(l.to))}</div></div></div>
      <div class="leg-meta"><span><b>${fmt.date(l.depart)}</b>${fmt.time(l.depart)}</span><span><b>${esc(a.model)}</b>${CLASSES[a.cls].label}</span><span><b>${a.pax}</b>seats</span></div>
      <div class="row-between"><p class="price">${fmt.money(l.listPrice)}<small>whole aircraft</small></p><button class="btn btn-primary btn-sm" data-book="${l.id}">Request</button></div></article>`; }).join('')}</div>`
      : emptyState('No published empty legs right now.');

    const pr = p.profile;
    const f = $('#px-profile');
    f.name.value = pr.name; f.homeAirport.value = pr.homeAirport; f.preferredClass.value = pr.preferredClass; f.seats.value = pr.seats; f.notes.value = pr.notes;
    drawBooking();
  };

  const STEPS = ['Passenger Details', 'Review', 'Payment', 'Request Sent'];
  const drawBooking = () => {
    const host = $('#px-booking');
    if (!booking) { host.innerHTML = `<p class="muted">Choose a recommended leg or a marketplace listing to start a request. Steps: ${STEPS.join(' → ')}.</p>`; return; }
    const l = S().emptyLegs.find((x) => x.id === booking.legId); const a = acBy(l.aircraftId);
    const stepper = `<ol class="steps" aria-label="Booking progress">${STEPS.map((s, i) => `${i ? '<li aria-hidden="true"><span class="step-line"></span></li>' : ''}<li class="${i < booking.step ? 'done' : ''}" ${i === booking.step ? 'aria-current="step"' : ''}><span class="n">${i < booking.step ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>`;
    const summary = `<p>${route(l.from, l.to)} · ${esc(a.model)} · ${fmt.dateTime(l.depart)} ± ${l.flexHours} h · <b>${fmt.money(l.listPrice)}</b></p>`;
    let body = '';
    if (booking.step === 0) body = `<form id="bk" class="form-grid" novalidate>
        <label class="field"><span>Lead passenger name</span><input name="name" type="text" required maxlength="80" value="${esc(booking.details?.name || P().profile.name)}" autocomplete="name"/></label>
        <label class="field"><span>Passengers (max ${a.pax})</span><input name="pax" type="number" min="1" max="${a.pax}" required value="${booking.details?.pax || P().profile.seats}"/></label>
        <label class="field span-2"><span>Contact email</span><input name="email" type="email" required value="${esc(booking.details?.email || '')}" autocomplete="email"/></label>
        <label class="field span-2"><span>Special requests</span><textarea name="requests" maxlength="300">${esc(booking.details?.requests || '')}</textarea></label>
        <p class="span-2 muted" style="font-size:12px">Do not enter passport or payment details. The operator collects required passenger documents after confirming availability.</p></form>`;
    if (booking.step === 1) body = `<dl class="dl"><dt>Flight</dt><dd>${route(l.from, l.to)} · ${esc(city(l.from))} → ${esc(city(l.to))}</dd><dt>Departure</dt><dd>${fmt.dateLong(l.depart)} · ${fmt.time(l.depart)} (± ${l.flexHours} h)</dd><dt>Aircraft</dt><dd>${esc(a.make)} ${esc(a.model)} · ${a.pax} seats</dd><dt>Passengers</dt><dd>${booking.details.pax} · lead ${esc(booking.details.name)}</dd><dt>Price</dt><dd><b>${fmt.money(l.listPrice)}</b> whole aircraft</dd></dl>
      <p class="notice" style="margin-top:14px">${icon('alert', 16)}<span>Empty legs can change or cancel if the operator’s schedule changes. Your request is not a booking until the operator confirms.</span></p>`;
    if (booking.step === 2) body = `<div class="state" style="text-align:left;justify-items:start">${icon('coin', 26)}<p><b>No payment is collected in this demo.</b><br>In production, the operator sends a secure payment link from a hosted, PCI-compliant provider <i>after</i> confirming availability. AERO never stores card data.</p>
      <label class="check"><input type="checkbox" id="bk-ack"/> I understand this is a request, not a confirmed booking.</label></div>`;
    if (booking.step === 3) body = `<div class="state" role="status">${icon('check', 28)}<p><b>Request sent to the operator.</b><br>Status: ${badge('submitted')}<br><span class="muted">You’ll see it under Upcoming once the operator responds (simulated).</span></p></div>`;
    host.innerHTML = `${stepper}${summary}<div style="margin-top:14px">${body}</div>
      <div class="row" style="margin-top:16px">${booking.step < 3 ? `<button class="btn" id="bk-back">${booking.step ? '← Back' : 'Cancel'}</button><button class="btn btn-primary" id="bk-next">${booking.step === 2 ? 'Send request' : 'Continue'}</button>` : '<button class="btn" id="bk-done">Done</button>'}</div>`;
    $('#bk-back')?.addEventListener('click', () => { if (booking.step === 0) booking = null; else booking.step--; drawBooking(); });
    $('#bk-done')?.addEventListener('click', () => { booking = null; draw(); });
    $('#bk-next')?.addEventListener('click', () => {
      if (booking.step === 0) { const f = $('#bk'); if (!validate(f)) return; booking.details = formValues(f); }
      if (booking.step === 2) {
        if (!$('#bk-ack').checked) { toast('Please acknowledge that this is a request', 'danger'); $('#bk-ack').focus(); return; }
        const req = { id: uid('PR'), legId: l.id, from: l.from, to: l.to, depart: l.depart, pax: Number(booking.details.pax), status: 'submitted', at: new Date().toISOString() };
        P().requests.unshift(req);
        l.inquiries.push({ id: uid('Q'), broker: `Passenger portal · ${booking.details.name}`, pax: req.pax, note: booking.details.requests || 'Passenger portal request', at: req.at, state: 'open' });
        store.notify('Passenger request', `${l.from} → ${l.to} · ${req.pax} pax`, 'empty-legs.html');
        store.audit('Passenger empty-leg request submitted', req.id); store.save();
      }
      booking.step++; drawBooking(); $('#px-booking').scrollIntoView({ block: 'nearest' });
    });
    host.querySelector('input, button')?.focus({ preventScroll: true });
  };

  draw();
  const main = $('#main');
  on(main, 'click', '[data-book]', (e, b) => { booking = { legId: b.dataset.book, step: 0 }; drawBooking(); $('#px-booking').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); });
  on(main, 'click', '[data-rm-route]', (e, b) => { P().savedRoutes.splice(Number(b.dataset.rmRoute), 1); store.save(); toast('Route removed'); draw(); });
  $('#px-route-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target;
    if (!validate(f, (v) => (v.from === v.to ? { to: 'Choose a different destination' } : P().savedRoutes.some((r) => r.from === v.from && r.to === v.to) ? { to: 'Route already saved' } : {}))) return;
    const v = formValues(f); P().savedRoutes.push({ from: v.from, to: v.to, label: `${city(v.from)} → ${city(v.to)}` }); store.save(); toast('Route saved — recommendations updated'); draw();
  });
  $('#px-profile').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target; if (!validate(f)) return;
    const v = formValues(f); Object.assign(P().profile, { ...v, seats: Number(v.seats) }); store.audit('Passenger profile updated'); store.save(); toast('Profile saved'); draw();
  });
  $('#px-charter').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target;
    if (!validate(f, (v) => ({ ...(v.from === v.to ? { to: 'Choose a different destination' } : {}), ...(ts(v.date) < ts(todayISO()) ? { date: 'Choose a future date' } : {}) }))) return;
    const v = formValues(f);
    const req = { id: uid('PR'), legId: null, from: v.from, to: v.to, depart: v.date + 'T12:00:00.000Z', pax: Number(v.pax), status: 'submitted', at: new Date().toISOString(), cls: v.cls };
    P().requests.unshift(req);
    let cust = S().customers.find((c) => c.id === 'c7');
    S().leads.unshift({ id: 'L' + (300 + S().leads.length), customerId: cust.id, from: v.from, to: v.to, depart: req.depart, pax: req.pax, stage: 'new', value: Math.round(estHours(acBy('a4'), v.from, v.to) * 7400), source: 'Passenger portal', nextFollowUp: todayISO(), owner: 'Sales', quote: null, activity: [{ at: req.at, text: `Charter request from passenger portal (${CLASSES[v.cls]?.label || 'any class'})` }] });
    store.notify('Passenger charter request', `${v.from} → ${v.to}`, 'charter-crm.html');
    store.audit('Passenger charter request', req.id); store.save();
    f.reset(); toast('Charter request sent to the operator', 'success'); draw();
  });
}

/* ---------- page registry ---------- */
export const PAGES = {
  dashboard, fleet, 'aircraft-detail': aircraftDetail, operations, 'empty-legs': emptyLegs, 'charter-crm': charterCrm,
  crew, maintenance, finance, 'owner-portal': ownerPortal, 'ai-copilot': aiCopilot, marketplace, analytics, settings, passenger,
};
