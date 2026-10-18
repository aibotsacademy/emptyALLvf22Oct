/* =========================================================
   AeroFlow — private-aviation search engine (aeroflow.html)
   ---------------------------------------------------------
   Search: One Way / Round Trip / Multi-City · From · To · Date(s) ·
   PAX (or payload for cargo) · Type of aircraft (Airplane, Helicopter,
   Cargo, VIP Airliner).
   For each leg the engine returns:
     • Empty-leg deals  — PUBLISHED legs from the shared demo store whose
       origin/destination are within 150 nm of the search and depart ±3 days.
     • Charter aircraft — fleet aircraft of the chosen type that can carry the
       party/payload and fly the route (fuel stops added beyond range), with a
       whole-aircraft ESTIMATE: (block + positioning) × rate card + fees.
   Choose one option per leg → itinerary total → original 4-step booking
   (Passenger Details · Review · Payment · Request Sent). Requests reach the
   workspace (CRM lead, engine inquiries, notifications, passenger portal).
   Nothing is live availability or a booking; everything is synthetic.
   ========================================================= */
import { store, fmt, esc, uid, airport, distanceNm, estHours, recommendPrice, CLASSES, AIRCRAFT_TYPES, capacity, findConflicts, T } from './data.js';
import { $, $$, toast, validate, formValues, badge, emptyState } from './layout.js';
import { airportSuggest } from './modules.js';
import { worldMap } from './charts.js';
import { img, photoForClass, cabinFor, src } from './media.js';
import { splitTitle, initParticles, reducedMotion } from './motion.js';

const { DAY, HOUR } = T;
const S = () => store.state;
const ac = (id) => S().aircraft.find((a) => a.id === id);
const city = (c) => (airport(c) || {}).city || c;
const ts = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getTime();
const isoDay = (t) => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const todayISO = () => isoDay(Date.now());
const smooth = () => (reducedMotion() ? 'auto' : 'smooth');
const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
const TYPE_ICON = { rotor: '◎', cargo: '▣', vip: '♛' };

/* ---------- inventory (published empty legs) ---------- */
function inventory() {
  return S().emptyLegs
    .filter((l) => l.status === 'published' && ts(l.depart) > Date.now())
    .map((l) => {
      const a = ac(l.aircraftId);
      const r = recommendPrice(S(), l);
      const price = l.listPrice || r.recommended;
      return { l, a, r, price, retail: r.retail, saving: Math.max(0, 1 - price / r.retail), seed: parseInt(l.id.replace(/\D/g, ''), 10) || 0 };
    });
}
const legWhen = (l) => `${fmt.dateLong(l.depart)} · ${fmt.time(l.depart)} ± ${l.flexHours} h`;

/* ---------- deal card (grid, recommendations) ---------- */
function card(x, i) {
  const { l, a } = x;
  return `<a class="af-card" href="#leg-${l.id}" data-leg="${l.id}" data-reveal data-reveal-delay="${i % 3}" aria-label="${esc(city(l.from))} to ${esc(city(l.to))}, ${fmt.dateLong(l.depart)}, ${esc(a.model)}, ${fmt.money(x.price)}">
    <div class="af-card-media">${img(photoForClass(a.cls, x.seed), { sizes: '(max-width: 700px) 100vw, 33vw', w: 1080 })}
      <span class="af-save">−${Math.round(x.saving * 100)}%</span><span class="af-class">${CLASSES[a.cls].label}</span></div>
    <div class="af-card-body">
      <div class="af-route"><div><b>${l.from}</b><small>${esc(city(l.from))}</small></div><span class="af-line" aria-hidden="true"><i>${TYPE_ICON[a.cls] || '✈'}</i></span><div class="r"><b>${l.to}</b><small>${esc(city(l.to))}</small></div></div>
      <div class="af-meta"><span>${fmt.date(l.depart)} · ${fmt.time(l.depart)} ± ${l.flexHours}h</span><span>${esc(a.model)} · ${capacity(a)}</span></div>
      <div class="af-price"><s>${fmt.money(x.retail)}</s><b>${fmt.money(x.price)}</b><small>whole aircraft</small></div>
    </div></a>`;
}

/* ---------- map helper ---------- */
function routeMap(legs, { width = 720, pad = 8, drawVar = '' } = {}) {
  const pts = legs.flatMap((l) => [airport(l.from), airport(l.to)]).filter(Boolean);
  let lonMin = Math.min(...pts.map((p) => p.lon)) - pad, lonMax = Math.max(...pts.map((p) => p.lon)) + pad;
  let latMin = Math.min(...pts.map((p) => p.lat)) - pad, latMax = Math.max(...pts.map((p) => p.lat)) + pad;
  const wantSpan = (lonMax - lonMin) * 0.5;
  if (latMax - latMin < wantSpan) { const c = (latMax + latMin) / 2; latMin = c - wantSpan / 2; latMax = c + wantSpan / 2; }
  if (lonMax - lonMin < (latMax - latMin) * 2) { const c = (lonMax + lonMin) / 2, half = latMax - latMin; lonMin = c - half; lonMax = c + half; }
  const svg = worldMap({
    width, bounds: [lonMin, latMax, lonMax, latMin],
    routes: legs.map((l) => ({ from: l.from, to: l.to, title: `${l.from} → ${l.to}`, tone: 'gold' })),
    markers: legs.length <= 4 ? legs.flatMap((l) => [{ code: l.from, label: city(l.from), tone: 'success' }, { code: l.to, label: city(l.to), tone: 'gold' }]) : [],
    showAirports: legs.length > 4, label: 'Route map (schematic)',
  });
  const host = document.createElement('div');
  host.innerHTML = svg;
  host.querySelectorAll('.map-route').forEach((p, i) => { p.setAttribute('pathLength', '1'); p.style.setProperty('--i', i); if (drawVar) p.classList.add(drawVar); });
  return host.innerHTML;
}

/* =========================================================
   SEARCH FORM
   ========================================================= */
const sw = { trip: 'oneway', type: 'airplane', pax: 2, payload: 2000, ret: '', legs: [{ from: '', to: '', date: '' }] };

function legRowHTML(leg, i) {
  const multi = sw.trip === 'multi';
  const dateLbl = sw.trip === 'round' ? 'Departure date' : 'Date';
  return `<div class="sw-row" data-i="${i}">
    ${multi ? `<span class="sw-leg-n" aria-hidden="true">${i + 1}</span>` : ''}
    <div class="sw-f sw-air"><label for="sw-from-${i}">From</label><input type="text" id="sw-from-${i}" data-k="from" value="${esc(leg.from)}" placeholder="City or airport" autocomplete="off" aria-controls="sw-from-${i}-dd" /><span class="sw-hint" id="sw-from-${i}-hint">${leg.from ? esc(city(leg.from)) : ''}</span><div class="fp-dropdown" id="sw-from-${i}-dd" role="listbox" hidden></div></div>
    <button type="button" class="sw-swap" data-swap="${i}" aria-label="Swap origin and destination"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg></button>
    <div class="sw-f sw-air"><label for="sw-to-${i}">To</label><input type="text" id="sw-to-${i}" data-k="to" value="${esc(leg.to)}" placeholder="City or airport" autocomplete="off" aria-controls="sw-to-${i}-dd" /><span class="sw-hint" id="sw-to-${i}-hint">${leg.to ? esc(city(leg.to)) : ''}</span><div class="fp-dropdown" id="sw-to-${i}-dd" role="listbox" hidden></div></div>
    <div class="sw-f sw-date"><label for="sw-date-${i}">${dateLbl}</label><input type="date" id="sw-date-${i}" data-k="date" min="${todayISO()}" value="${leg.date}" /></div>
    ${sw.trip === 'round' && i === 0 ? `<div class="sw-f sw-date"><label for="sw-ret">Return date</label><input type="date" id="sw-ret" min="${leg.date || todayISO()}" value="${sw.ret}" /></div>` : ''}
    ${multi && sw.legs.length > 2 ? `<button type="button" class="sw-rm" data-rm="${i}" aria-label="Remove leg ${i + 1}">×</button>` : ''}
  </div>`;
}

function renderForm() {
  if (sw.trip === 'multi' && sw.legs.length < 2) sw.legs.push({ from: sw.legs[0].to, to: '', date: '' });
  if (sw.trip !== 'multi') sw.legs = sw.legs.slice(0, 1);
  const host = $('#sw-legs');
  host.className = `sw-legs is-${sw.trip}`;
  host.innerHTML = sw.legs.map(legRowHTML).join('');
  $('#sw-add').hidden = sw.trip !== 'multi' || sw.legs.length >= 5;
  sw.legs.forEach((leg, i) => {
    ['from', 'to'].forEach((k) => {
      const input = $(`#sw-${k}-${i}`);
      input.dataset.code = leg[k];
      airportSuggest(input, $(`#sw-${k}-${i}-dd`), (code) => {
        const prev = sw.legs[i][k];
        sw.legs[i][k] = code || '';
        $(`#sw-${k}-${i}-hint`).textContent = code ? city(code) : '';
        // multi-city: the next leg starts where this one ends
        if (k === 'to' && sw.trip === 'multi' && sw.legs[i + 1] && code && (!sw.legs[i + 1].from || sw.legs[i + 1].from === prev)) { sw.legs[i + 1].from = code; const nx = $(`#sw-from-${i + 1}`); nx.value = code; nx.dataset.code = code; $(`#sw-from-${i + 1}-hint`).textContent = city(code); }
      });
    });
    $(`#sw-date-${i}`).addEventListener('change', (e) => { sw.legs[i].date = e.target.value; const r = $('#sw-ret'); if (r) r.min = e.target.value || todayISO(); });
  });
  $('#sw-ret')?.addEventListener('change', (e) => (sw.ret = e.target.value));
  renderPax();
}

function renderPax() {
  const cargo = sw.type === 'cargo';
  $('#sw-pax-label').textContent = cargo ? 'Payload' : 'PAX';
  $('#sw-pax-out').textContent = cargo ? `${sw.payload.toLocaleString()} lb` : String(sw.pax);
}

function readQueries() {
  const errs = [];
  $$('#sw [aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  const bad = (sel, msg) => { const n = $(sel); if (n) n.setAttribute('aria-invalid', 'true'); errs.push(msg); };
  sw.legs.forEach((l, i) => {
    const n = sw.legs.length > 1 ? `Leg ${i + 1}: ` : '';
    if (!airport(l.from)) bad(`#sw-from-${i}`, `${n}choose a departure airport`);
    if (!airport(l.to)) bad(`#sw-to-${i}`, `${n}choose a destination airport`);
    if (l.from && l.from === l.to) bad(`#sw-to-${i}`, `${n}destination must differ from origin`);
    if (!l.date) bad(`#sw-date-${i}`, `${n}choose a date`);
    else if (l.date < todayISO()) bad(`#sw-date-${i}`, `${n}date must be today or later`);
    if (i > 0 && l.date && sw.legs[i - 1].date && l.date < sw.legs[i - 1].date) bad(`#sw-date-${i}`, `${n}must be on or after the previous leg`);
  });
  if (sw.trip === 'round') {
    if (!sw.ret) bad('#sw-ret', 'Choose a return date');
    else if (sw.legs[0].date && sw.ret < sw.legs[0].date) bad('#sw-ret', 'Return must be on or after departure');
  }
  $('#sw-error').textContent = errs.slice(0, 2).join(' · ');
  if (errs.length) { $('#sw [aria-invalid]')?.focus(); return null; }
  const q = sw.legs.map((l) => ({ ...l }));
  if (sw.trip === 'round') q.push({ from: sw.legs[0].to, to: sw.legs[0].from, date: sw.ret });
  return q;
}

/* =========================================================
   SEARCH ENGINE
   ========================================================= */
const NEAR_NM = 150;
const near = (a, b) => a === b || distanceNm(a, b) <= NEAR_NM;

function capOK(a) { return sw.type === 'cargo' ? (a.payloadLb || 0) >= sw.payload : a.pax >= sw.pax; }

function searchLeg(q) {
  const classes = AIRCRAFT_TYPES[sw.type].classes;
  const dQ = ts(q.date);
  const deals = inventory()
    .filter((x) => classes.includes(x.a.cls) && capOK(x.a) && near(x.l.from, q.from) && near(x.l.to, q.to) && Math.abs(ts(x.l.depart) - dQ) <= 3.5 * DAY)
    .map((x) => ({ kind: 'deal', key: 'deal:' + x.l.id, a: x.a, l: x.l, price: x.price, retail: x.retail, saving: x.saving, hours: estHours(x.a, x.l.from, x.l.to), from: x.l.from, to: x.l.to, depart: x.l.depart, seed: x.seed, exact: x.l.from === q.from && x.l.to === q.to }));
  const d = distanceNm(q.from, q.to);
  const busy = new Set(S().trips.filter((t) => t.status !== 'cancelled' && Math.abs(ts(t.depart) - dQ) < 0.6 * DAY).map((t) => t.aircraftId));
  const options = S().aircraft
    .filter((a) => classes.includes(a.cls) && !['aog', 'maintenance'].includes(a.status) && capOK(a))
    .map((a, i) => {
      const legRange = a.rangeNm * 0.9;
      const stops = d > legRange ? Math.ceil(d / legRange) - 1 : 0;
      if (stops > 2) return null;
      const posD = a.base === q.from ? 0 : distanceNm(a.base, q.from);
      if (a.cls === 'rotor' && posD > a.rangeNm * 1.5) return null; // helicopters don't reposition across regions
      const hours = Math.round((estHours(a, q.from, q.to) + stops * 0.75) * 10) / 10;
      const posH = posD ? estHours(a, a.base, q.from) : 0;
      const fees = 650 * (1 + stops) + (['heavy', 'ultra', 'vip', 'cargo'].includes(a.cls) ? 900 : 0);
      const price = Math.round(((hours + posH) * a.hourlyRate + fees) / 50) * 50;
      return { kind: 'charter', key: 'ac:' + a.id, a, price, hours, posH, stops, d, from: q.from, to: q.to, depart: q.date + 'T12:00:00', seed: i, busy: busy.has(a.id) };
    })
    .filter(Boolean);
  return { q, deals, options };
}

let R = null; // { legs:[{q,deals,options}], active, sel:[], sort, cls, price, type, pax, payload }

function runSearch() {
  const qs = readQueries();
  if (!qs) return;
  R = { legs: qs.map(searchLeg), active: 0, sel: qs.map(() => null), sort: 'value', cls: '', price: '', type: sw.type, pax: sw.pax, payload: sw.payload, trip: sw.trip };
  store.audit('AeroFlow search', `${sw.trip} · ${AIRCRAFT_TYPES[sw.type].label} · ${qs.map((q) => q.from + '-' + q.to).join(', ')}`);
  store.save(false);
  $('#results').hidden = false;
  $$('#rs-sort [data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === 'value')));
  $$('#rs-price [data-price]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.price === '')));
  $('#rs-class').innerHTML = sw.type === 'airplane' ? `<button type="button" class="pill" data-cls="" aria-pressed="true">All classes</button>${AIRCRAFT_TYPES.airplane.classes.map((c) => `<button type="button" class="pill" data-cls="${c}" aria-pressed="false">${CLASSES[c].label}</button>`).join('')}` : '';
  drawResults();
  updateTripBar();
  $('#results').scrollIntoView({ behavior: smooth(), block: 'start' });
  setTimeout(() => $('#rs-title').focus?.(), 400);
}

function rowHTML(o, legIndex) {
  const a = o.a;
  const selected = R.sel[legIndex]?.key === o.key;
  const meta = o.kind === 'deal'
    ? `<span>${fmt.dateTime(o.depart)} ± ${o.l.flexHours} h</span><span>${o.exact ? 'Exact route' : `${o.from} → ${o.to} (nearby)`}</span>`
    : `<span>${fmt.hours(o.hours)} flight${o.stops ? ` · ${o.stops} fuel stop${o.stops > 1 ? 's' : ''}` : ' · nonstop'}</span><span>${o.posH ? `${fmt.hours(o.posH)} positioning from ${a.base}` : `Based at ${a.base}`}</span>${o.busy ? '<span class="rs-warn">Scheduled nearby that day — operator to confirm</span>' : ''}`;
  return `<article class="rs-row ${selected ? 'is-selected' : ''} ${o.kind === 'deal' ? 'is-deal' : ''}">
    <div class="rs-img">${img(photoForClass(a.cls, o.seed), { sizes: '(max-width: 700px) 100vw, 240px', w: 640 })}${o.kind === 'deal' ? `<span class="af-save">−${Math.round(o.saving * 100)}%</span>` : ''}</div>
    <div class="rs-info">
      <p class="rs-kind">${o.kind === 'deal' ? '<span class="badge badge-gold no-dot">Empty leg</span>' : '<span class="badge no-dot">Charter</span>'} <span class="muted">${CLASSES[a.cls].label}</span></p>
      <h4>${esc(a.make)} ${esc(a.model)}</h4>
      <p class="rs-meta">${capacity(a)} · ${meta}</p>
    </div>
    <div class="rs-price">
      ${o.kind === 'deal' ? `<s>${fmt.money(o.retail)}</s>` : '<small>Estimate</small>'}
      <b>${fmt.money(o.price)}</b>
      <div class="row" style="justify-content:flex-end">
        ${o.kind === 'deal' ? `<button type="button" class="btn btn-sm btn-ghost" data-leg="${o.l.id}">Details</button>` : ''}
        <button type="button" class="btn btn-sm ${selected ? 'btn-primary' : ''}" data-pick="${legIndex}|${o.key}" aria-pressed="${selected}">${selected ? '✓ Selected' : 'Select'}</button>
      </div>
    </div>
  </article>`;
}

function sorted(list) {
  let out = list.filter((o) => (!R.cls || o.a.cls === R.cls) && (!R.price || o.price <= Number(R.price)));
  if (R.sort === 'price') out.sort((a, b) => a.price - b.price);
  else if (R.sort === 'fastest') out.sort((a, b) => a.hours - b.hours || a.price - b.price);
  else out.sort((a, b) => (b.kind === 'deal') - (a.kind === 'deal') || (a.kind === 'deal' ? b.saving - a.saving : a.price - b.price));
  return out;
}

function drawResults() {
  const t = AIRCRAFT_TYPES[R.type].label;
  const capTxt = R.type === 'cargo' ? `${R.payload.toLocaleString()} lb payload` : `${R.pax} passenger${R.pax > 1 ? 's' : ''}`;
  $('#rs-chips').innerHTML = [{ oneway: 'One Way', round: 'Round Trip', multi: 'Multi-City' }[R.trip], t, capTxt].map((c) => `<span class="rs-chip">${esc(c)}</span>`).join('');
  $('#rs-legs').innerHTML = R.legs.map((L, i) => `<button type="button" role="tab" class="rs-leg ${R.sel[i] ? 'is-done' : ''}" data-legtab="${i}" aria-selected="${i === R.active}">
      <span class="rs-leg-n">${R.sel[i] ? '✓' : i + 1}</span><span><b>${L.q.from} → ${L.q.to}</b><small>${fmt.dateLong(L.q.date)}</small></span></button>`).join('');
  const L = R.legs[R.active];
  const deals = sorted(L.deals), opts = sorted(L.options);
  const legLbl = R.legs.length > 1 ? `Leg ${R.active + 1} · ` : '';
  $('#rs-body').innerHTML = `
    <div class="rs-route">${routeMap([{ from: L.q.from, to: L.q.to }], { width: 900, pad: Math.max(3, distanceNm(L.q.from, L.q.to) / 140) })}
      <div class="rs-route-txt"><p class="eyebrow">${legLbl}${fmt.dateLong(L.q.date)}</p><h3>${esc(city(L.q.from))} <span>→</span> ${esc(city(L.q.to))}</h3><p class="muted">${fmt.dist(distanceNm(L.q.from, L.q.to))} great-circle · ${L.deals.length + L.options.length} option${L.deals.length + L.options.length === 1 ? '' : 's'}</p></div></div>
    <section class="rs-sec" aria-labelledby="rs-deals-h"><h3 id="rs-deals-h">Empty-leg deals <small>within ±3 days · airports within ${NEAR_NM} nm</small></h3>
      ${deals.length ? deals.map((o) => rowHTML(o, R.active)).join('') : `<p class="rs-none">No empty legs match this leg${L.deals.length ? ' with the current refinements' : ''}. Charter aircraft below are priced as whole-aircraft estimates.</p>`}</section>
    <section class="rs-sec" aria-labelledby="rs-ch-h"><h3 id="rs-ch-h">Charter aircraft <small>whole-aircraft estimates</small></h3>
      ${opts.length ? opts.map((o) => rowHTML(o, R.active)).join('') : emptyState(L.options.length ? 'No aircraft match the current refinements.' : `No ${esc(t.toLowerCase())} can carry ${esc(capTxt)} on this route. Try another type of aircraft or a nearby airport.`, '<a class="btn btn-sm" href="#search" data-focus-search>Modify search</a>')}</section>`;
}

function updateTripBar() {
  const bar = $('#tripbar');
  if (!R) { bar.hidden = true; return; }
  bar.hidden = false;
  $('#tb-legs').innerHTML = R.legs.map((L, i) => `<button type="button" class="tb-leg ${R.sel[i] ? 'is-done' : ''}" data-legtab="${i}"><b>${L.q.from}→${L.q.to}</b><span>${R.sel[i] ? fmt.money(R.sel[i].price, { compact: true }) : 'Choose'}</span></button>`).join('');
  const done = R.sel.every(Boolean);
  const total = R.sel.reduce((s, o) => s + (o ? o.price : 0), 0);
  $('#tb-total').textContent = total ? fmt.money(total) : '—';
  $('#tb-book').disabled = !done;
  document.body.classList.add('has-tripbar');
}

/* =========================================================
   DETAIL (single empty leg) + BOOKING (any itinerary)
   ========================================================= */
const STEPS = ['Passenger Details', 'Review', 'Payment', 'Request Sent'];
let lastFocus = null;
let booking = null; // { items:[{kind,a,l?,from,to,depart,price}], step, d }

function showOverlay(photoKey) {
  const box = $('#af-detail');
  lastFocus = document.activeElement;
  $('#dt-photo').innerHTML = img(photoKey, { eager: true, w: 2400 });
  box.hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => box.classList.add('open'));
  $('#af-detail-scroll').scrollTop = 0;
  $('#dt-close').focus();
}

function openDetail(legId) {
  const x = inventory().find((v) => v.l.id === legId);
  if (!x) { toast('That leg is no longer published', 'danger'); history.replaceState(null, '', location.pathname); return; }
  const { l, a, r } = x;
  showOverlay(photoForClass(a.cls, x.seed));
  $('#dt-head').innerHTML = `<p class="eyebrow">Empty leg · ${CLASSES[a.cls].label} · ${esc(a.make)} ${esc(a.model)}</p>
    <h2 id="dt-title" class="dt-route">${l.from}<i aria-hidden="true">→</i>${l.to}</h2>
    <p class="dt-cities">${esc(city(l.from))} to ${esc(city(l.to))} · ${legWhen(l)}</p>`;
  const seats = a.cls === 'cargo' ? `${capacity(a)}` : `up to ${a.pax} passengers (≈ ${fmt.money(Math.round(x.price / a.pax))} per seat if full)`;
  $('#dt-body').innerHTML = `
    <div class="dt-grid">
      <div>
        <dl class="dt-specs">
          <div><dt>Aircraft</dt><dd>${esc(a.make)} ${esc(a.model)}</dd></div>
          <div><dt>Capacity</dt><dd>${capacity(a)}</dd></div>
          <div><dt>Distance</dt><dd>${fmt.dist(distanceNm(l.from, l.to))}</dd></div>
          <div><dt>Block (est.)</dt><dd>${fmt.hours(estHours(a, l.from, l.to))}</dd></div>
          <div><dt>Range</dt><dd>${fmt.dist(a.rangeNm)}</dd></div>
          <div><dt>Year</dt><dd>${a.year}</dd></div>
        </dl>
        <div class="dt-map">${routeMap([l], { width: 760, pad: Math.max(4, distanceNm(l.from, l.to) / 120) })}</div>
        <div class="dt-cabin">${img(cabinFor(a.cls), { sizes: '(max-width: 900px) 100vw, 55vw', w: 1600 })}<span>Photography illustrative</span></div>
      </div>
      <aside class="dt-price" aria-labelledby="dt-price-h">
        <p class="eyebrow" id="dt-price-h">Empty-leg price</p>
        <p class="dt-amount">${fmt.money(x.price)}</p>
        <p class="dt-retail">Retail one-way <s>${fmt.money(x.retail)}</s> · <b>save ${Math.round(x.saving * 100)}%</b></p>
        <p class="muted" style="font-size:13px">Whole aircraft, ${seats}.</p>
        <p style="margin:14px 0">${badge('pending', 'Availability pending operator confirmation')}</p>
        <details class="assumptions"><summary>Why this price?</summary><ul>${r.assumptions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>
        <button type="button" class="btn btn-primary dt-book-btn" id="dt-book-start">Request this leg ${ARROW}</button>
        <div id="dt-book" class="dt-book" aria-live="polite"></div>
      </aside>
    </div>`;
  if (location.hash !== '#leg-' + l.id) history.pushState(null, '', '#leg-' + l.id);
  booking = null;
  $('#dt-book-start').addEventListener('click', () => {
    booking = { items: [{ kind: 'deal', a, l, from: l.from, to: l.to, depart: l.depart, price: x.price }], step: 0 };
    $('#dt-book-start').hidden = true; drawBooking();
  });
}

function openItinerary() {
  const items = R.sel.map((o) => ({ kind: o.kind, a: o.a, l: o.l || null, from: o.from, to: o.to, depart: o.depart, price: o.price }));
  showOverlay(photoForClass(items[0].a.cls, R.sel[0].seed));
  const total = items.reduce((s, i) => s + i.price, 0);
  $('#dt-head').innerHTML = `<p class="eyebrow">${{ oneway: 'One Way', round: 'Round Trip', multi: 'Multi-City' }[R.trip]} · ${items.length} leg${items.length > 1 ? 's' : ''}</p>
    <h2 id="dt-title" class="dt-route">${[items[0].from, ...items.map((i) => i.to)].join('<i aria-hidden="true">→</i>')}</h2>
    <p class="dt-cities">${[items[0].from, ...items.map((i) => i.to)].map((c) => esc(city(c))).join(' → ')}</p>`;
  $('#dt-body').innerHTML = `
    <div class="dt-grid">
      <div>
        <ol class="it-list">${items.map((i, n) => `<li><span class="it-n">${n + 1}</span><div><b>${i.from} → ${i.to}</b><span>${fmt.dateLong(i.depart)} · ${esc(i.a.make)} ${esc(i.a.model)} · ${capacity(i.a)}</span></div><span class="badge ${i.kind === 'deal' ? 'badge-gold' : ''} no-dot">${i.kind === 'deal' ? 'Empty leg' : 'Charter estimate'}</span><b class="num">${fmt.money(i.price)}</b></li>`).join('')}</ol>
        <div class="dt-map">${routeMap(items, { width: 760, pad: 6 })}</div>
      </div>
      <aside class="dt-price" aria-labelledby="dt-price-h">
        <p class="eyebrow" id="dt-price-h">Estimated itinerary total</p>
        <p class="dt-amount">${fmt.money(total)}</p>
        <p class="muted" style="font-size:13px">Whole-aircraft prices. Charter legs are estimates excluding taxes; the operator confirms aircraft, crew and final price.</p>
        <p style="margin:14px 0">${badge('pending', 'Availability pending operator confirmation')}</p>
        <div id="dt-book" class="dt-book" aria-live="polite"></div>
      </aside>
    </div>`;
  booking = { items, step: 0 };
  drawBooking();
}

function closeDetail(push = true) {
  const box = $('#af-detail');
  if (box.hidden) return;
  box.classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { box.hidden = true; }, reducedMotion() ? 0 : 350);
  if (push && location.hash.startsWith('#leg-')) history.pushState(null, '', location.pathname + location.search);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

function drawBooking() {
  const host = $('#dt-book');
  const P = S().passenger;
  const cargo = booking.items.every((i) => i.a.cls === 'cargo');
  const maxPax = Math.min(...booking.items.map((i) => i.a.pax || 0));
  const stepper = `<ol class="steps" aria-label="Booking progress">${STEPS.map((s, i) => `${i ? '<li aria-hidden="true"><span class="step-line"></span></li>' : ''}<li class="${i < booking.step ? 'done' : ''}" ${i === booking.step ? 'aria-current="step"' : ''}><span class="n">${i < booking.step ? '✓' : i + 1}</span><span class="st-l">${s}</span></li>`).join('')}</ol>`;
  let body = '';
  if (booking.step === 0) body = `<form id="bk" class="form-grid" novalidate>
      <label class="field span-2"><span>${cargo ? 'Shipper contact' : 'Lead passenger'}</span><input name="name" type="text" required maxlength="80" autocomplete="name" value="${esc(booking.d?.name || P.profile.name)}"/></label>
      ${cargo ? `<label class="field"><span>Cargo description</span><input name="cargo" type="text" required maxlength="80" value="${esc(booking.d?.cargo || '')}" placeholder="e.g. 2 pallets, auto parts"/></label>`
        : `<label class="field"><span>Passengers (max ${maxPax})</span><input name="pax" type="number" min="1" max="${maxPax}" required value="${booking.d?.pax || Math.min(maxPax, R?.pax || P.profile.seats)}"/></label>`}
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${esc(booking.d?.email || '')}"/></label>
      <label class="field span-2"><span>Requests</span><textarea name="requests" maxlength="300" placeholder="${cargo ? 'Dimensions, dangerous goods, handling…' : 'Pets, catering, ground transport…'}">${esc(booking.d?.requests || '')}</textarea></label>
      <p class="span-2 muted" style="font-size:12px">No passport or payment details here — the operator collects documents after confirming.</p></form>`;
  if (booking.step === 1) body = `<dl class="dl">${booking.items.map((i, n) => `<dt>Leg ${n + 1}</dt><dd>${i.from} → ${i.to} · ${fmt.date(i.depart)} · ${esc(i.a.model)} · <b>${fmt.money(i.price)}</b></dd>`).join('')}<dt>${cargo ? 'Shipment' : 'Passengers'}</dt><dd>${cargo ? esc(booking.d.cargo) : booking.d.pax} · ${esc(booking.d.name)}</dd><dt>Total</dt><dd><b>${fmt.money(booking.items.reduce((s, i) => s + i.price, 0))}</b></dd></dl>
    <p class="notice" style="margin-top:12px"><span>Empty legs can move or cancel if the operator’s schedule changes, and charter legs are estimates. This is a request, not a booking.</span></p>`;
  if (booking.step === 2) body = `<p><b>No payment is taken in this demo.</b> In production the operator sends a secure link from a hosted, PCI-compliant provider after confirming availability. AERO never stores card data.</p>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="bk-ack"/> I understand this is a request pending operator confirmation.</label>`;
  if (booking.step === 3) body = `<div class="state" role="status"><p><b>Request sent to the operator.</b><br>${badge('submitted')}<br><span class="muted">Track it under My Flights.</span></p></div>`;
  host.innerHTML = `${stepper}<div class="bk-body">${body}</div><div class="row" style="margin-top:14px">${booking.step < 3 ? `<button type="button" class="btn" id="bk-back">${booking.step ? '← Back' : 'Cancel'}</button><button type="button" class="btn btn-primary" id="bk-next">${booking.step === 2 ? 'Send request' : 'Continue'}</button>` : `<button type="button" class="btn" id="bk-done">Close</button>`}</div>`;
  $('#bk-back')?.addEventListener('click', () => {
    if (booking.step === 0) { if ($('#dt-book-start')) { booking = null; host.innerHTML = ''; $('#dt-book-start').hidden = false; } else closeDetail(); return; }
    booking.step--; drawBooking();
  });
  $('#bk-done')?.addEventListener('click', () => { closeDetail(); drawMy(); });
  $('#bk-next')?.addEventListener('click', () => {
    if (booking.step === 0) { const f = $('#bk'); if (!validate(f)) return; booking.d = formValues(f); }
    if (booking.step === 2) {
      if (!$('#bk-ack').checked) { toast('Please acknowledge that this is a request', 'danger'); $('#bk-ack').focus(); return; }
      submitRequest();
    }
    booking.step++; drawBooking();
    host.querySelector('input, button')?.focus({ preventScroll: true });
  });
}

function submitRequest() {
  const at = new Date().toISOString();
  const pax = Number(booking.d.pax || 0);
  booking.items.forEach((i) => {
    S().passenger.requests.unshift({ id: uid('PR'), legId: i.l?.id || null, from: i.from, to: i.to, depart: i.depart, pax, status: 'submitted', at, aircraft: i.a.model });
    if (i.l) i.l.inquiries.push({ id: uid('Q'), broker: `AeroFlow · ${booking.d.name}`, pax, note: booking.d.requests || booking.d.cargo || 'AeroFlow request', at, state: 'open' });
  });
  const first = booking.items[0];
  const itin = booking.items.map((i) => `${i.from}-${i.to} ${i.depart.slice(0, 10)} ${i.a.tail} ${i.kind === 'deal' ? 'empty leg' : 'charter est.'} $${i.price}`).join(' | ');
  S().leads.unshift({
    id: 'L' + (300 + S().leads.length), customerId: 'c7', from: first.from, to: booking.items[booking.items.length - 1].to, depart: first.depart.length === 10 ? first.depart + 'T12:00:00.000Z' : new Date(first.depart).toISOString(),
    pax, stage: 'new', value: booking.items.reduce((s, i) => s + i.price, 0), source: 'AeroFlow search', nextFollowUp: todayISO(), owner: 'Sales', quote: null,
    activity: [{ at, text: `AeroFlow request (${booking.items.length} leg${booking.items.length > 1 ? 's' : ''}): ${itin}${booking.d.cargo ? ' · cargo: ' + booking.d.cargo : ''}` }],
  });
  store.notify('AeroFlow request', `${first.from} → ${first.to}${booking.items.length > 1 ? ` +${booking.items.length - 1} leg(s)` : ''}`, 'charter-crm.html');
  store.audit('AeroFlow request submitted', itin); store.save();
}

/* =========================================================
   MY FLIGHTS
   ========================================================= */
function drawMy() {
  const P = S().passenger;
  $('#af-upcoming').innerHTML = P.requests.length ? `<ul class="af-list">${P.requests.slice(0, 6).map((r) => `<li><b>${r.from} → ${r.to}</b><span>${fmt.date(r.depart)}${r.pax ? ` · ${r.pax} pax` : ''}${r.aircraft ? ` · ${esc(r.aircraft)}` : ''}</span>${badge('submitted', 'Awaiting operator')}</li>`).join('')}</ul>`
    : `<p class="af-empty">No upcoming flights.<br><a href="#search" class="link-accent" data-focus-search>Search flights →</a></p>`;
  $('#af-routes').innerHTML = `<ul class="af-list">${P.savedRoutes.map((r) => `<li><b>${r.from} → ${r.to}</b><span>${esc(r.label || '')}</span><button type="button" class="pill" data-route="${r.from}-${r.to}">Search</button></li>`).join('')}</ul>`;
  const scored = inventory().map((x) => {
    let s = 0;
    P.savedRoutes.forEach((r) => { if (r.from === x.l.from && r.to === x.l.to) s += 3; else if (r.to === x.l.to) s += 1; });
    if (x.l.from === P.profile.homeAirport) s += 1.5;
    if (x.a.cls === P.profile.preferredClass) s += 0.5;
    return { x, s: s + x.saving };
  }).sort((a, b) => b.s - a.s).slice(0, 3);
  $('#af-recs').innerHTML = scored.length ? scored.map(({ x }, i) => card(x, i)).join('') : emptyState('No published legs right now.');
}

/* =========================================================
   PAGE
   ========================================================= */
export function initAeroflow() {
  requestAnimationFrame(() => document.body.classList.add('is-loaded'));
  splitTitle($('#af-title'));
  initParticles($('#particle-canvas'));

  // nav
  const navBtn = $('#nav-toggle'), nav = $('#site-nav');
  navBtn.addEventListener('click', () => { const o = !nav.classList.contains('open'); nav.classList.toggle('open', o); navBtn.setAttribute('aria-expanded', String(o)); });
  $$('a', nav).forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }));

  // ORIGINAL video background (file.mp4) with photo sequence until/unless it loads
  const slides = $$('.af-slide');
  let si = 0, timer = null;
  const runSlides = () => { if (reducedMotion() || timer) return; timer = setInterval(() => { slides[si].classList.remove('is-on'); si = (si + 1) % slides.length; slides[si].classList.add('is-on'); }, 6500); };
  const stopSlides = () => { clearInterval(timer); timer = null; };
  runSlides();
  const video = $('#hero-video'), vt = $('#video-toggle');
  const vfail = () => { video.remove(); vt.remove(); };
  $$('source', video).pop().addEventListener('error', vfail);
  if (video.networkState === 3) vfail();
  const vready = () => { video.classList.add('is-ready'); stopSlides(); vt.hidden = false; };
  video.addEventListener('loadeddata', vready);
  if (video.readyState >= 2) vready();
  if (reducedMotion()) { video.removeAttribute('autoplay'); video.pause?.(); vt.textContent = 'Play video'; vt.setAttribute('aria-pressed', 'true'); }
  vt.addEventListener('click', () => {
    if (video.paused) { video.play().catch(() => {}); vt.textContent = 'Pause video'; vt.setAttribute('aria-pressed', 'false'); }
    else { video.pause(); vt.textContent = 'Play video'; vt.setAttribute('aria-pressed', 'true'); }
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? stopSlides() : !video.classList.contains('is-ready') && runSlides()));

  // hero stats
  const inv = inventory();
  const usable = S().aircraft.filter((a) => !['aog', 'maintenance'].includes(a.status));
  const stats = { '#af-stat-legs': inv.length, '#af-stat-ac': usable.length, '#af-stat-dest': new Set(S().trips.map((t) => t.to)).size };
  const t0 = performance.now();
  const tick = (t) => {
    const k = reducedMotion() ? 1 : Math.min(1, Math.max(0, (t - t0 - 900) / 1400));
    Object.entries(stats).forEach(([sel, n]) => ($(sel).textContent = Math.round(n * (1 - Math.pow(1 - k, 3)))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const maxSave = Math.round(Math.max(0, ...inv.map((x) => x.saving)) * 100);
  if (inv.length) $('#af-eyebrow').textContent = `Private aviation · Empty legs up to ${maxSave}% below retail · Instant estimates`;

  // ---------- search form ----------
  const form = $('#sw');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'trip') { sw.trip = e.target.value; renderForm(); }
    if (e.target.name === 'type') { sw.type = e.target.value; renderPax(); }
  });
  $('#sw-add').addEventListener('click', () => {
    const last = sw.legs[sw.legs.length - 1];
    sw.legs.push({ from: last.to, to: '', date: last.date });
    renderForm();
    $(`#sw-to-${sw.legs.length - 1}`).focus();
  });
  form.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { sw.legs.splice(Number(rm.dataset.rm), 1); renderForm(); return; }
    const swp = e.target.closest('[data-swap]');
    if (swp) { const l = sw.legs[Number(swp.dataset.swap)]; [l.from, l.to] = [l.to, l.from]; renderForm(); return; }
    const st = e.target.closest('[data-step]');
    if (st) {
      const d = Number(st.dataset.step);
      if (sw.type === 'cargo') sw.payload = Math.min(50000, Math.max(500, sw.payload + d * 500));
      else sw.pax = Math.min(19, Math.max(1, sw.pax + d));
      renderPax();
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
  // sensible defaults: home airport, a week out
  sw.legs[0].from = S().passenger.profile.homeAirport || '';
  sw.legs[0].date = isoDay(Date.now() + 5 * DAY);
  sw.ret = isoDay(Date.now() + 8 * DAY);
  renderForm();

  const focusSearch = () => { $('#search').scrollIntoView({ behavior: smooth() }); setTimeout(() => $('#sw-to-0')?.focus({ preventScroll: true }), reducedMotion() ? 0 : 600); };

  // ---------- results interactions ----------
  $('#results').addEventListener('click', (e) => {
    const s = e.target.closest('#rs-sort [data-sort]');
    if (s) { R.sort = s.dataset.sort; $$('#rs-sort [data-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b === s))); drawResults(); return; }
    const c = e.target.closest('#rs-class [data-cls]');
    if (c) { R.cls = c.dataset.cls; $$('#rs-class [data-cls]').forEach((b) => b.setAttribute('aria-pressed', String(b === c))); drawResults(); return; }
    const pr = e.target.closest('#rs-price [data-price]');
    if (pr) { R.price = pr.dataset.price; $$('#rs-price [data-price]').forEach((b) => b.setAttribute('aria-pressed', String(b === pr))); drawResults(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const [li, key] = pick.dataset.pick.split('|');
      const L = R.legs[Number(li)];
      const o = [...L.deals, ...L.options].find((x) => x.key === key);
      R.sel[li] = R.sel[li]?.key === key ? null : o;
      const next = R.sel.findIndex((x) => !x);
      if (R.sel[li] && next !== -1 && next !== Number(li)) { R.active = next; toast(`Leg ${Number(li) + 1} selected — now choose leg ${next + 1}`); $('#rs-legs').scrollIntoView({ behavior: smooth(), block: 'start' }); }
      else if (R.sel.every(Boolean)) toast('Itinerary complete — review and request below', 'success');
      drawResults(); updateTripBar();
    }
  });
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-legtab]');
    if (tab && R) { R.active = Number(tab.dataset.legtab); drawResults(); if (tab.closest('#tripbar')) $('#results').scrollIntoView({ behavior: smooth() }); return; }
    const leg = e.target.closest('[data-leg]');
    if (leg) { e.preventDefault(); openDetail(leg.dataset.leg); return; }
    const fs = e.target.closest('[data-focus-search]');
    if (fs) { e.preventDefault(); focusSearch(); return; }
    const ty = e.target.closest('[data-search-type]');
    if (ty) { const r = $(`#sw input[name="type"][value="${ty.dataset.searchType}"]`); r.checked = true; sw.type = r.value; renderPax(); focusSearch(); return; }
    const route = e.target.closest('[data-route]');
    if (route) {
      const [from, to] = route.dataset.route.split('-');
      $('#sw input[name="trip"][value="oneway"]').checked = true; sw.trip = 'oneway';
      sw.legs = [{ from, to, date: isoDay(Date.now() + 7 * DAY) }];
      renderForm(); runSearch();
    }
  });
  $('#tb-book').addEventListener('click', openItinerary);

  // ---------- empty-leg deals grid ----------
  let dealType = '';
  const drawDeals = () => {
    const list = inventory().filter((x) => !dealType || AIRCRAFT_TYPES[dealType].classes.includes(x.a.cls)).sort((a, b) => ts(a.l.depart) - ts(b.l.depart));
    $('#dl-summary').textContent = `${list.length} empty leg${list.length === 1 ? '' : 's'}${list.length ? ` · from ${fmt.money(Math.min(...list.map((x) => x.price)))}` : ''} · whole-aircraft prices`;
    $('#af-grid').innerHTML = list.length ? list.slice(0, 12).map(card).join('') : emptyState('No published legs of this type right now.');
  };
  $('#dl-type').addEventListener('click', (e) => { const b = e.target.closest('[data-dtype]'); if (!b) return; $$('#dl-type [data-dtype]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dealType = b.dataset.dtype; drawDeals(); });
  drawDeals();

  // ---------- aircraft types band: rate-card "from" prices ----------
  Object.entries(AIRCRAFT_TYPES).forEach(([k, t]) => {
    const fleet = S().aircraft.filter((a) => t.classes.includes(a.cls));
    const el = $('#ty-from-' + k);
    if (el && fleet.length) el.textContent = `${fleet.length} aircraft · from ${fmt.money(Math.min(...fleet.map((a) => a.hourlyRate)))}/h · demo rate card`;
  });

  // ---------- featured departure ----------
  const feat = inv.slice().sort((a, b) => b.r.demand.score - a.r.demand.score || b.saving - a.saving)[0];
  if (feat) {
    const { l, a } = feat;
    $('#ft-photo').innerHTML = img(photoForClass(a.cls, feat.seed), { w: 2400 });
    $('#ft-cabin').innerHTML = img(cabinFor(a.cls), { w: 2400 });
    $('#ft-from').textContent = l.from; $('#ft-to').textContent = l.to;
    $('#ft-cities').textContent = `${city(l.from)} to ${city(l.to)} · ${fmt.dateLong(l.depart)}`;
    $('#ft-ac').textContent = `${a.make} ${a.model} · ${CLASSES[a.cls].label} · ${capacity(a)} · ${a.year}`;
    const d = distanceNm(l.from, l.to);
    const dist = $('#ft-dist'); dist.dataset.seqCount = d; dist.textContent = d.toLocaleString();
    $('#ft-block').textContent = estHours(a, l.from, l.to).toFixed(1);
    $('#ft-when').textContent = `${fmt.time(l.depart)} ± ${l.flexHours} h`;
    $('#ft-retail').textContent = fmt.money(feat.retail);
    const pr = $('#ft-price'); pr.dataset.seqStart = feat.retail; pr.dataset.seqCount = feat.price; pr.textContent = fmt.money(feat.price);
    $('#ft-save').textContent = `−${Math.round(feat.saving * 100)}%`;
    $('#ft-cabin-txt').textContent = `${capacity(a)} · range ${fmt.dist(a.rangeNm)} · demand score ${feat.r.demand.score}/100`;
    $('#ft-map').innerHTML = routeMap([l], { width: 1400, pad: Math.max(5, d / 90), drawVar: 'ft-route-line' });
    $('#ft-open').addEventListener('click', () => openDetail(l.id));
  } else $('#featured').hidden = true;

  // ---------- market in motion ----------
  if (inv.length) {
    $('#mk-map').innerHTML = routeMap(inv.map((x) => x.l), { width: 900, pad: 6, drawVar: 'mk-route-line' });
    $('#mk-map').style.setProperty('--n', inv.length);
    const classes = Object.keys(CLASSES).map((k) => { const xs = inv.filter((x) => x.a.cls === k); return { k, n: xs.length, avg: xs.length ? xs.reduce((s, x) => s + x.saving, 0) / xs.length : 0 }; }).filter((c) => c.n);
    $('#mk-bars').innerHTML = `<div class="mk-bar-row">${classes.map((c) => `<div class="mk-bar"><span class="mk-bar-v num">${Math.round(c.avg * 100)}%</span><span class="mk-bar-col"><i style="--v:${(c.avg * 100).toFixed(1)}%"></i></span><span class="mk-bar-l">${CLASSES[c.k].label}<small>${c.n} leg${c.n === 1 ? '' : 's'}</small></span></div>`).join('')}</div><p class="mk-cap">Average saving vs. one-way retail, by class</p>`;
    const seats = inv.reduce((s, x) => s + x.a.pax, 0);
    const value = inv.reduce((s, x) => s + (x.retail - x.price), 0);
    const avg = Math.round((inv.reduce((s, x) => s + x.saving, 0) / inv.length) * 100);
    $('#mk-totals').innerHTML = `<div class="mk-tot"><b class="num" data-seq-count="${seats}" data-seq-from="0.66" data-seq-to="0.9">${seats}</b><span>seats in motion</span></div>
      <div class="mk-tot"><b class="num" data-seq-count="${Math.round(value / 1000)}" data-seq-from="0.68" data-seq-to="0.92" data-prefix="$" data-suffix="K">$${Math.round(value / 1000)}K</b><span>offered below retail</span></div>
      <div class="mk-tot"><b class="num" data-seq-count="${avg}" data-seq-from="0.7" data-seq-to="0.94" data-suffix="%">${avg}%</b><span>average saving</span></div>`;
  }

  // ---------- overlay wiring ----------
  const box = $('#af-detail');
  $('#dt-close').addEventListener('click', () => closeDetail());
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
    if (e.key === 'Tab') {
      const els = $$('a[href], button:not([disabled]), input, select, textarea, summary', box).filter((el) => el.offsetParent !== null && !el.hidden);
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('#af-detail-scroll').addEventListener('scroll', (e) => box.style.setProperty('--dt-y', e.target.scrollTop), { passive: true });
  const fromHash = () => { const m = location.hash.match(/^#leg-(.+)$/); if (m) openDetail(m[1]); else closeDetail(false); };
  window.addEventListener('popstate', fromHash);
  fromHash();

  drawMy();
}
