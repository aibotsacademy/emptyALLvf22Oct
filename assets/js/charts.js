/* =========================================================
   AERO — Dependency-free SVG charts + schematic map
   All charts render at their container's pixel width so text stays
   legible at 375px; `mount()` re-renders on resize (ResizeObserver).
   ========================================================= */
import { esc, AIRPORTS } from './data.js';

const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const AXIS = 'var(--text-3)';
const GRID = 'rgba(244,241,234,0.07)';

/** Render `fn(width)` into `el` now and whenever the element resizes. */
export function mount(el, fn) {
  if (!el) return;
  const draw = () => { const w = Math.max(240, Math.floor(el.clientWidth || 600)); el.innerHTML = fn(w); };
  draw();
  if ('ResizeObserver' in window) {
    let last = el.clientWidth, raf = 0;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) < 8) return;
      last = el.clientWidth;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    });
    ro.observe(el);
    el._ro && el._ro.disconnect();
    el._ro = ro;
  }
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function legend(series) {
  if (series.length < 2) return '';
  return `<div class="chart-legend">${series.map((s, i) => `<span><i style="background:${s.color || COLORS[i]}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

/** Line / area chart. series: [{name, values:[], color?}], labels: [] */
export function lineChart({ series, labels, width = 600, height = 220, format = (v) => v, area = true, label = 'Line chart' }) {
  const pad = { t: 14, r: 12, b: 26, l: 52 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i) => pad.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => pad.t + h - (v / max) * h;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))));
  const grid = ticks.map((t) => `<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" fill="${AXIS}" font-size="11">${esc(format(t))}</text>`).join('');
  const xl = labels.map((l, i) => (i % every === 0 || i === n - 1) ? `<text x="${x(i)}" y="${height - 8}" text-anchor="middle" fill="${AXIS}" font-size="11">${esc(l)}</text>` : '').join('');
  const paths = series.map((s, si) => {
    const c = s.color || COLORS[si];
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="chart-line"/>`;
    const fill = area && si === 0 ? `<polygon points="${x(0)},${pad.t + h} ${pts.join(' ')} ${x(n - 1)},${pad.t + h}" fill="${c}" opacity="0.10"/>` : '';
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${n > 40 ? 0 : 3}" fill="${c}"><title>${esc(labels[i])}: ${esc(format(v))}</title></circle>`).join('');
    const hits = s.values.map((v, i) => `<rect x="${x(i) - w / n / 2}" y="${pad.t}" width="${Math.max(2, w / n)}" height="${h}" fill="transparent"><title>${esc(s.name || '')} ${esc(labels[i])}: ${esc(format(v))}</title></rect>`).join('');
    return fill + line + dots + hits;
  }).join('');
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${grid}${xl}${paths}</svg>${legend(series)}`;
}

/** Vertical bar chart; series supports grouped bars. */
export function barChart({ labels, series, width = 600, height = 220, format = (v) => v, label = 'Bar chart', highlight = -1 }) {
  const pad = { t: 14, r: 8, b: 30, l: 52 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length, g = series.length;
  const band = w / n, bw = Math.max(3, Math.min(28, (band * 0.7) / g));
  const y = (v) => pad.t + h - (v / max) * h;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const grid = ticks.map((t) => `<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" fill="${AXIS}" font-size="11">${esc(format(t))}</text>`).join('');
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 56))));
  const bars = labels.map((l, i) => {
    const cx = pad.l + band * i + band / 2;
    const group = series.map((s, si) => {
      const v = s.values[i] || 0;
      const bx = cx - (bw * g) / 2 + si * bw;
      const c = s.color || COLORS[si];
      const op = highlight >= 0 && highlight !== i ? 0.45 : 1;
      return `<rect x="${bx + 1}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, pad.t + h - y(v))}" rx="3" fill="${c}" opacity="${op}"><title>${esc(s.name || '')} ${esc(l)}: ${esc(format(v))}</title></rect>`;
    }).join('');
    const xt = i % every === 0 ? `<text x="${cx}" y="${height - 10}" text-anchor="middle" fill="${AXIS}" font-size="11">${esc(l)}</text>` : '';
    return group + xt;
  }).join('');
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${grid}${bars}</svg>${legend(series)}`;
}

/** Horizontal bars (HTML) — best for ranked categories with long labels. */
export function hBars(items, { format = (v) => v, max } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return `<ul class="hbars" role="list">${items.map((it, i) => `
    <li><span class="hb-label">${esc(it.label)}</span>
      <span class="hb-track" aria-hidden="true"><span class="hb-fill" style="width:${Math.max(1, (it.value / m) * 100)}%;background:${it.color || (it.tone === 'muted' ? 'var(--text-3)' : COLORS[0])}"></span>${it.target ? `<span class="hb-target" style="left:${Math.min(100, (it.target / m) * 100)}%" title="Target"></span>` : ''}</span>
      <span class="hb-value num">${esc(format(it.value))}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></li>`).join('')}</ul>`;
}

export function donut({ items, size = 150, thickness = 18, center = '', sub = '' }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const arcs = items.map((it, i) => {
    const len = (it.value / total) * c;
    const seg = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${it.color || COLORS[i]}" stroke-width="${thickness}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(it.label)}: ${it.value}</title></circle>`;
    off += len;
    return seg;
  }).join('');
  return `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(items.map((i) => i.label + ' ' + i.value).join(', '))}">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--surface-3)" stroke-width="${thickness}"/>${arcs}
    <text x="50%" y="48%" text-anchor="middle" fill="var(--text)" font-size="24" font-family="var(--font-display)">${esc(center)}</text>
    <text x="50%" y="62%" text-anchor="middle" fill="var(--text-3)" font-size="10" letter-spacing="1.5">${esc(sub)}</text></svg>
    <ul class="donut-legend" role="list">${items.map((it, i) => `<li><i style="background:${it.color || COLORS[i]}"></i>${esc(it.label)}<b class="num">${it.value}</b></li>`).join('')}</ul></div>`;
}

export function sparkline(values, { width = 120, height = 32, color = 'var(--gold)' } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1 || 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function funnel(steps, { format = (v) => v } = {}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return `<ol class="funnel">${steps.map((s, i) => {
    const prev = i ? steps[i - 1].value : null;
    const conv = prev ? (prev ? Math.round((s.value / prev) * 100) : 0) + '% of previous' : '';
    return `<li><div class="fn-bar" style="--w:${Math.max(4, (s.value / max) * 100)}%"><span class="fn-label">${esc(s.label)}</span><b class="num">${esc(format(s.value))}</b></div><span class="fn-conv muted">${conv}</span></li>`;
  }).join('')}</ol>`;
}

/* ---------- schematic world map (equirectangular, simplified coastlines) ---------- */
const LAND = [
  [[-165,65],[-160,71],[-130,70],[-110,73],[-85,70],[-80,63],[-65,60],[-55,52],[-66,45],[-70,42],[-76,38],[-76,35],[-81,31],[-80,25.5],[-82,27],[-84,30],[-90,29.5],[-97,27.5],[-97,22],[-92,19],[-87,21.5],[-88,16],[-84,15],[-83,10],[-79,9],[-77,8],[-80,7.5],[-85,10],[-86,12],[-92,14.5],[-96,16],[-105,20],[-110,23.5],[-115,30],[-118,34],[-121,36],[-124,40],[-124,46],[-127,50],[-135,57],[-150,60],[-158,57],[-165,60]],
  [[-77,8],[-72,12],[-62,10.5],[-52,5],[-50,0],[-44,-2.5],[-35,-5],[-35,-9],[-39,-15],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-41],[-65,-47],[-68,-52],[-70,-55],[-74,-50],[-73,-40],[-71,-30],[-70,-18],[-76,-14],[-81,-5],[-80,0],[-78,3]],
  [[-55,60],[-43,60],[-20,70],[-18,77],[-30,83],[-60,82],[-72,77],[-55,70]],
  [[-10,36],[-9,43],[-2,43.5],[-1.5,46.5],[-4.5,48],[2,51],[8,54],[9,57],[11,58.5],[5,59],[5,62],[14,67],[20,70],[28,71],[40,67],[60,68],[70,73],[100,77],[130,72],[160,70],[180,68],[180,62],[160,60],[155,58],[143,59],[135,54],[141,48],[133,43],[129,35],[122,40],[121,31],[117,24],[110,21],[108,17],[109,12],[105,10],[103,1.3],[100,6],[98,10],[97,17],[94,16],[92,21],[88,22],[80,15],[77,8],[73,17],[72,21],[67,25],[61,25],[57,26],[56,24],[59,22.5],[52,17],[45,13],[43,16],[39,22],[35,28],[34,31],[35.5,35],[30,36.5],[27,37],[26,40],[23,40],[23,36.5],[21,38],[19.5,40],[13,45.5],[12,44],[16,40],[16,38],[11.5,42.5],[9,44],[6,43],[3,43],[3,42],[-1,37.5],[-6,36]],
  [[-17,21],[-16,14],[-17,14.7],[-12,7.5],[-8,4.5],[-2,5],[5,6],[9,4],[9.5,1],[13,-6],[12,-17],[15,-27],[18,-34.5],[25,-34],[32,-28.5],[35.5,-24],[35,-18],[40.5,-15],[39,-5],[42,0],[51,12],[44,11],[43,12.5],[38,18],[35,24],[33,29.5],[32,31.5],[20,31],[19,30.5],[10,34],[11,37],[0,36],[-6,35.8],[-10,30],[-14,26]],
  [[-5.5,50],[1.5,51],[1.7,52.8],[0,53.5],[-1.5,55.5],[-2,57.6],[-3.5,58.6],[-5,58.5],[-6,56.5],[-5,55],[-3,54.5],[-4.5,53.2],[-4.5,51.7]],
  [[114,-22],[113.5,-26],[115,-34],[118,-35],[124,-33],[131,-31.5],[138,-35],[140,-38],[146,-39],[150,-37.5],[153,-31],[153,-25],[146,-19],[142,-11],[136,-12],[131,-11.5],[126,-14],[122,-18]],
  [[130,31],[135,34],[140,35],[141,41],[145,43.5],[141,45.5],[139.5,40],[136,36.5],[131,34.5]],
  [[109,1.5],[117,7],[119,5],[118,1],[116,-4],[110,-3]],
  [[95.5,5.5],[98,4],[104,-2],[106,-6],[102,-4],[96,3]],
];

/**
 * Schematic map. Not live tracking.
 * markers: [{code, label, tone}] (placed at airports), routes: [{from, to, tone, dashed}]
 */
export function worldMap({ width = 640, bounds = [-130, 62, 60, 0], markers = [], routes = [], label = 'Schematic fleet map', showAirports = true }) {
  const [lonMin, latMax, lonMax, latMin] = bounds;
  const height = Math.round(width * ((latMax - latMin) / (lonMax - lonMin)) * 1.15);
  const px = (lon) => ((lon - lonMin) / (lonMax - lonMin)) * width;
  const py = (lat) => ((latMax - lat) / (latMax - latMin)) * height;
  const land = LAND.map((poly) => `<path d="M${poly.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join('L')}Z" />`).join('');
  const grat = [];
  for (let lo = Math.ceil(lonMin / 30) * 30; lo <= lonMax; lo += 30) grat.push(`<line x1="${px(lo)}" x2="${px(lo)}" y1="0" y2="${height}"/>`);
  for (let la = Math.ceil(latMin / 15) * 15; la <= latMax; la += 15) grat.push(`<line y1="${py(la)}" y2="${py(la)}" x1="0" x2="${width}"/>`);
  const ap = (code) => AIRPORTS.find((a) => a.code === code);
  const inView = (a) => a && a.lon >= lonMin && a.lon <= lonMax && a.lat <= latMax && a.lat >= latMin;
  const arcs = routes.map((r, i) => {
    const a = ap(r.from), b = ap(r.to);
    if (!a || !b) return '';
    const x1 = px(a.lon), y1 = py(a.lat), x2 = px(b.lon), y2 = py(b.lat);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
    const tone = r.tone === 'muted' ? 'var(--text-3)' : r.tone === 'info' ? 'var(--series-2)' : 'var(--gold)';
    return `<path class="map-route" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" stroke="${tone}" ${r.dashed ? 'stroke-dasharray="4 5"' : ''} style="--i:${i}"><title>${esc(r.from)} → ${esc(r.to)}${r.title ? ' · ' + esc(r.title) : ''}</title></path>`;
  }).join('');
  const dots = showAirports ? AIRPORTS.filter(inView).map((a) => `<circle cx="${px(a.lon)}" cy="${py(a.lat)}" r="2" class="map-ap"><title>${a.code} — ${esc(a.city)}</title></circle>`).join('') : '';
  // spread markers that share a station
  const seen = {};
  const marks = markers.map((m) => {
    const a = ap(m.code);
    if (!inView(a)) return '';
    const k = (seen[m.code] = (seen[m.code] || 0) + 1) - 1;
    const x = px(a.lon) + k * 9, y = py(a.lat) - k * 3;
    const tone = { danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--series-2)', success: 'var(--success)' }[m.tone] || 'var(--gold)';
    return `<g class="map-marker" transform="translate(${x},${y})"><circle r="9" fill="${tone}" opacity="0.18"/><circle r="4.5" fill="${tone}" stroke="var(--navy)" stroke-width="1.5"/><title>${esc(m.label)}</title></g>`;
  }).join('');
  const labels = markers.length <= 14 ? [...new Set(markers.map((m) => m.code))].map((code) => { const a = ap(code); return inView(a) ? `<text x="${px(a.lon) + 8}" y="${py(a.lat) + 14}" class="map-label">${code}</text>` : ''; }).join('') : '';
  return `<svg class="map" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    <rect width="${width}" height="${height}" fill="var(--surface-1)"/>
    <g class="map-grat">${grat.join('')}</g><g class="map-land">${land}</g>${dots}${arcs}${marks}${labels}</svg>`;
}
