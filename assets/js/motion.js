/* =========================================================
   AERO — Cinematic, reversible, scroll-linked motion
   ---------------------------------------------------------
   Principle: every scroll effect is a pure function of scroll
   position (progress 0→1), never a one-shot "play once" trigger.
   Scrolling up therefore reverses the effect smoothly, and nothing
   can be left invisible.

   • [data-reveal]      fade/translate in. Uses CSS scroll-driven animations
                        (animation-timeline: view()) when supported; otherwise
                        this file writes --p (0..1) per element each frame.
   • [data-parallax=f]  translateY proportional to distance from viewport center
   • [data-mask]        clip-path reveal driven by --p
   • [data-draw]        SVG path stroke draw driven by progress
   • [data-count=N]     number counts up/down with progress (reversible)
   • [data-sequence]    tall sticky section; writes --seq (0..1) and data-step
   • [data-hero]        hero scale/overlay/content drift while scrolling past

   Only transform/opacity/clip-path/stroke-dashoffset change → compositor-
   friendly. One passive scroll listener, one rAF per frame, IntersectionObserver
   limits work to elements near the viewport. prefers-reduced-motion: all
   content shown immediately, no parallax/scale/looping effects.
   ========================================================= */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const supportsSDA = () => typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()');

function progress(el, start = 1, end = 0.62) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || 800;
  return clamp((vh * start - r.top) / (vh * (start - end)));
}

export function initMotion(root = document) {
  const html = document.documentElement;
  const reduced = reducedMotion();
  const sda = supportsSDA();
  html.classList.toggle('sda', sda && !reduced);
  html.classList.toggle('no-sda', !sda && !reduced);
  html.classList.toggle('reduced', reduced);

  const q = (s) => Array.from(root.querySelectorAll(s));
  const reveals = q('[data-reveal]');
  const parallax = q('[data-parallax]');
  const masks = q('[data-mask]');
  const draws = q('[data-draw]');
  const counts = q('[data-count]');
  const sequences = q('[data-sequence]');
  const typers = q('[data-type]');
  const hero = root.querySelector('[data-hero]');
  const header = root.querySelector('[data-header]');

  // horizontal film strips: section height = horizontal travel + one viewport
  const sizeStrips = () => q('[data-hscroll]').forEach((el) => {
    const tr = el.querySelector('[data-hscroll-track]');
    if (!tr || reduced) return;
    el.style.height = `${Math.max(0, tr.scrollWidth - window.innerWidth) + window.innerHeight}px`;
  });
  sizeStrips();
  window.addEventListener('resize', sizeStrips, { passive: true });
  window.addEventListener('load', sizeStrips);

  // prepare draw paths
  draws.forEach((p) => {
    try { const len = p.getTotalLength(); p.style.strokeDasharray = `${len}`; p.dataset.len = len; } catch { /* not a path */ }
  });
  counts.forEach((el) => { el.dataset.fmt = el.dataset.fmt || ''; });

  const finalCount = (el) => {
    const n = parseFloat(el.dataset.count);
    const d = parseInt(el.dataset.decimals || '0', 10);
    return (el.dataset.prefix || '') + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + (el.dataset.suffix || '');
  };

  if (reduced) {
    reveals.forEach((el) => el.style.setProperty('--p', 1));
    masks.forEach((el) => el.style.setProperty('--p', 1));
    draws.forEach((p) => (p.style.strokeDashoffset = 0));
    counts.forEach((el) => (el.textContent = finalCount(el)));
    sequences.forEach((s) => { s.style.setProperty('--seq', 1); s.querySelectorAll('[data-seq-count]').forEach((n) => (n.textContent = (n.dataset.prefix || '') + Number(n.dataset.seqCount).toLocaleString('en-US') + (n.dataset.suffix || ''))); s.dataset.step = 'all'; s.querySelectorAll('[data-seq-step]').forEach((x) => x.classList.add('is-active')); });
    const v = document.querySelector('[data-hero] video');
    if (v) { v.removeAttribute('autoplay'); v.pause(); }
    if (header) window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
    return;
  }

  // track which elements are near the viewport
  const near = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? near.add(e.target) : near.delete(e.target)));
    schedule();
  }, { rootMargin: '25% 0px 25% 0px' }) : null;

  const tracked = [...(sda ? [] : reveals), ...parallax, ...masks, ...draws, ...counts, ...sequences, ...typers];
  if (io) tracked.forEach((el) => io.observe(el)); else tracked.forEach((el) => near.add(el));

  const isMobile = () => window.innerWidth < 768;
  let ticking = false;

  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    const mobile = isMobile();

    if (header) header.classList.toggle('scrolled', window.scrollY > 40);

    if (hero) {
      const r = hero.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height));
      hero.style.setProperty('--hero-p', p.toFixed(4));
    }

    // sticky sequences are always evaluated so they settle correctly after fast scrolls in either direction
    new Set([...near, ...sequences]).forEach((el) => {
      if (el.hasAttribute('data-reveal') && !sda) {
        const delay = parseFloat(el.dataset.revealDelay || 0);
        el.style.setProperty('--p', easeOut(clamp(progress(el, 1 - delay * 0.04, 0.7 - delay * 0.04))).toFixed(4));
      }
      if (el.hasAttribute('data-parallax')) {
        const f = parseFloat(el.dataset.parallax || 0.1) * (mobile ? 0.35 : 1);
        const r = el.getBoundingClientRect();
        const off = (r.top + r.height / 2 - vh / 2) * -f;
        el.style.setProperty('--py', off.toFixed(1) + 'px');
      }
      if (el.hasAttribute('data-mask')) el.style.setProperty('--p', easeOut(progress(el, 1, 0.45)).toFixed(4));
      if (el.hasAttribute('data-draw') && el.dataset.len) {
        const host = el.closest('[data-draw-host]') || el;
        const p = progress(host, 0.95, 0.35);
        el.style.strokeDashoffset = (parseFloat(el.dataset.len) * (1 - p)).toFixed(1);
      }
      if (el.hasAttribute('data-count')) {
        const p = easeOut(progress(el, 0.98, 0.6));
        const n = parseFloat(el.dataset.count) * p;
        const d = parseInt(el.dataset.decimals || '0', 10);
        el.textContent = (el.dataset.prefix || '') + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + (el.dataset.suffix || '');
      }
      if (el.hasAttribute('data-sequence')) {
        const r = el.getBoundingClientRect();
        const travel = Math.max(1, r.height - vh);
        const p = clamp(-r.top / travel);
        el.style.setProperty('--seq', p.toFixed(4));
        const steps = parseInt(el.dataset.steps || '4', 10);
        const step = Math.min(steps - 1, Math.floor(p * steps * 0.999));
        if (el.dataset.step !== String(step)) {
          el.dataset.step = String(step);
          el.querySelectorAll('[data-seq-step]').forEach((s) => s.classList.toggle('is-active', s.dataset.seqStep === String(step)));
          el.querySelectorAll('[data-seq-dot]').forEach((s) => s.setAttribute('aria-current', s.dataset.seqDot === String(step) ? 'step' : 'false'));
        }
        // local progress within the current step (0..1) for fine-grained visuals
        el.style.setProperty('--seq-local', ((p * steps) % 1).toFixed(4));
        // numbers tied to sequence progress (reversible)
        el.querySelectorAll('[data-seq-count]').forEach((n) => {
          const from = parseFloat(n.dataset.seqFrom || 0);
          const to = parseFloat(n.dataset.seqTo || 1);
          const t = easeOut(clamp((p - from) / Math.max(0.05, to - from)));
          const start = parseFloat(n.dataset.seqStart || 0), end = parseFloat(n.dataset.seqCount);
          n.textContent = (n.dataset.prefix || '') + Math.round(start + (end - start) * t).toLocaleString('en-US') + (n.dataset.suffix || '');
        });
        // horizontal, scroll-linked film strip
        if (el.hasAttribute('data-hscroll')) {
          const tr = el.querySelector('[data-hscroll-track]');
          const hp = clamp((p - 0.07) / 0.86); // brief hold at both ends so the intro and last frame can be read
          if (tr) tr.style.transform = `translate3d(${(-hp * Math.max(0, tr.scrollWidth - window.innerWidth)).toFixed(1)}px,0,0)`;
        }
      }
      if (el.hasAttribute('data-type')) {
        const full = el.dataset.type;
        const p = progress(el.closest('[data-reveal]') || el, 0.9, 0.3);
        const n = Math.round(full.length * p);
        if (el._n !== n) { el._n = n; el.textContent = full.slice(0, n); }
      }
    });
  }

  function schedule() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
}

/* ---------- hero title: word-by-word load reveal (original AERO title animation, refined) ---------- */
export function splitTitle(el) {
  if (!el) return;
  const text = el.dataset.text || el.textContent;
  el.setAttribute('aria-label', text);
  const lines = text.split('|');
  el.innerHTML = lines.map((line) => `<span class="ht-line">${line.trim().split(' ').map((w) => `<span class="ht-word" aria-hidden="true"><span>${w}</span></span>`).join(' ')}</span>`).join('');
  let i = 0;
  el.querySelectorAll('.ht-word > span').forEach((s) => s.style.setProperty('--i', i++));
  el.setAttribute('aria-label', text.replace(/\|/g, ' '));
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
}

/* ---------- hero particles (original canvas, restrained: sparse gold dust) ---------- */
export function initParticles(canvas) {
  if (!canvas || reducedMotion() || window.innerWidth < 768) { if (canvas) canvas.remove(); return; }
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1), running = true, raf = 0;
  const N = 46;
  const parts = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, s: Math.random() * 0.00025 + 0.00008, a: Math.random() * 0.5 + 0.15 }));
  const size = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  window.addEventListener('resize', size, { passive: true });
  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    parts.forEach((p) => {
      p.y -= p.s; p.x += p.s * 0.4;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      if (p.x > 1.02) p.x = -0.02;
      ctx.beginPath();
      ctx.fillStyle = `rgba(201,167,106,${p.a})`;
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    raf = requestAnimationFrame(tick);
  };
  // pause when hero is off screen or tab hidden
  const io = new IntersectionObserver(([e]) => { running = e.isIntersecting && !document.hidden; cancelAnimationFrame(raf); if (running) tick(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; cancelAnimationFrame(raf); if (running) tick(); });
}
