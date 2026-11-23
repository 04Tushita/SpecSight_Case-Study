(() => {
'use strict';
document.documentElement.classList.add('js');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const s = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const COL = { pass: '#86d4c2', fail: '#ff8f7e', wait: '#f6c177', run: '#7dd3fc', idle: '#8c84b0', queued: '#8c84b0' };

// wrap text into lines by an estimated character width
function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
function textBlock(x, y, lines, size, attrs = {}, lh = 1.22) {
  const t = s('text', { x, y: y - ((lines.length - 1) * size * lh) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size, ...attrs });
  lines.forEach((l, i) => t.append(s('tspan', { x, dy: i ? size * lh : 0 }, l)));
  return t;
}

/* ======================================================= Pan / zoom */
class PZ {
  constructor(vp, c, w, h, o = {}) {
    Object.assign(this, { vp, c, w, h, pad: o.pad ?? 18, maxK: o.max ?? 7, s: 1, x: 0, y: 0, user: false, anim: 0, dragged: 0 });
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    this.ptr = new Map();
    this.bind();
    this.fit(false);
    new ResizeObserver(() => { if (!this.vp.clientWidth) return; if (!this.user) this.fit(false); else this.set(this); }).observe(vp);
    $$('[data-z]', vp).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.tool(b.dataset.z); }));
  }
  get vw() { return this.vp.clientWidth; }
  get vh() { return this.vp.clientHeight; }
  resize(w, h) { cancelAnimationFrame(this.anim); this.w = w; this.h = h; this.c.style.width = w + 'px'; this.c.style.height = h + 'px'; }
  fs() { return Math.max(0.0001, Math.min((this.vw - 2 * this.pad) / this.w, (this.vh - 2 * this.pad) / this.h)); }
  fitState() { const k = this.fs(); return { s: k, x: (this.vw - this.w * k) / 2, y: (this.vh - this.h * k) / 2 }; }
  fit(anim = true) { cancelAnimationFrame(this.anim); this.user = false; const t = this.fitState(); anim ? this.to(t) : this.set(t); }
  clampS(k) { const f = this.fs(); return Math.min(Math.max(k, f * 0.7), Math.max(f * this.maxK, f * 1.5)); }
  set({ s: k, x, y }) {
    k = this.clampS(k);
    const W = this.w * k, H = this.h * k, vw = this.vw, vh = this.vh;
    const mx = vw * 0.45, my = vh * 0.45;
    if (W <= vw) x = Math.min(Math.max(x, -W * 0.25), vw - W * 0.75); else x = Math.min(mx, Math.max(vw - W - mx, x));
    if (H <= vh) y = Math.min(Math.max(y, -H * 0.25), vh - H * 0.75); else y = Math.min(my, Math.max(vh - H - my, y));
    this.s = k; this.x = x; this.y = y;
    this.c.style.transform = `translate(${x}px,${y}px) scale(${k})`;
    this.vp.classList.toggle('zoomed', k > this.fs() * 1.03);
    this.onchange && this.onchange();
  }
  to(t, dur = 900, cb) {
    cancelAnimationFrame(this.anim);
    if (reduce) { this.set(t); cb && cb(); return; }
    const a = { s: this.s, x: this.x, y: this.y };
    // interpolate in a way that keeps the zoom feeling natural
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = ease(p);
      const k = a.s * Math.pow(t.s / a.s, e);
      // keep focal point consistent: lerp the content point at view center
      const ca = { x: (this.vw / 2 - a.x) / a.s, y: (this.vh / 2 - a.y) / a.s };
      const cb2 = { x: (this.vw / 2 - t.x) / t.s, y: (this.vh / 2 - t.y) / t.s };
      const cx = ca.x + (cb2.x - ca.x) * e, cy = ca.y + (cb2.y - ca.y) * e;
      this.set({ s: k, x: this.vw / 2 - cx * k, y: this.vh / 2 - cy * k });
      if (p < 1) this.anim = requestAnimationFrame(step); else cb && cb();
    };
    this.anim = requestAnimationFrame(step);
  }
  zoomBy(f, cx = this.vw / 2, cy = this.vh / 2, anim = false) {
    const k = this.clampS(this.s * f);
    const t = { s: k, x: cx - (cx - this.x) * (k / this.s), y: cy - (cy - this.y) * (k / this.s) };
    this.user = true;
    anim ? this.to(t, 420) : this.set(t);
  }
  focus(rx, ry, rw, rh, dur = 1000, pad = 36, cb) {
    let k = Math.min((this.vw - 2 * pad) / rw, (this.vh - 2 * pad) / rh);
    k = this.clampS(k);
    this.user = true;
    this.to({ s: k, x: this.vw / 2 - (rx + rw / 2) * k, y: this.vh / 2 - (ry + rh / 2) * k }, dur, cb);
  }
  tool(z) { if (z === 'in') this.zoomBy(1.6, undefined, undefined, true); else if (z === 'out') this.zoomBy(1 / 1.6, undefined, undefined, true); else this.fit(); }
  bind() {
    const vp = this.vp;
    let start = null;
    const local = (e) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('button, a, .flow-cap, .jcap, .focus-card, .map-side')) return;
      this.ptr.set(e.pointerId, local(e));
      cancelAnimationFrame(this.anim);
      this.onuser && this.onuser();
      start = { x: this.x, y: this.y, s: this.s, p: local(e), moved: 0, touch: e.pointerType === 'touch' };
      if (this.ptr.size === 2) {
        const [a, b] = [...this.ptr.values()];
        start.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    });
    const move = (e) => {
      if (!this.ptr.has(e.pointerId) || !start) return;
      const p = local(e);
      this.ptr.set(e.pointerId, p);
      if (this.ptr.size >= 2 && start.pinch) {
        const [a, b] = [...this.ptr.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = this.clampS(start.s * (d / start.pinch.d));
        const cx = (start.pinch.m.x - start.x) / start.s, cy = (start.pinch.m.y - start.y) / start.s;
        this.user = true;
        this.set({ s: k, x: m.x - cx * k, y: m.y - cy * k });
        start.moved = 99;
        e.preventDefault();
        return;
      }
      const dx = p.x - start.p.x, dy = p.y - start.p.y;
      if (start.touch && !vp.classList.contains('zoomed')) return; // let the page scroll
      if (Math.abs(dx) + Math.abs(dy) > 4) { start.moved = 1; vp.classList.add('drag'); }
      if (start.moved) { this.user = true; this.set({ s: this.s, x: start.x + dx, y: start.y + dy }); }
    };
    const up = (e) => {
      if (!this.ptr.has(e.pointerId)) return;
      this.ptr.delete(e.pointerId);
      if (start && start.moved) this.dragged = performance.now();
      if (!this.ptr.size) { start = null; vp.classList.remove('drag'); }
      else if (start) { const [p] = [...this.ptr.values()]; start = { x: this.x, y: this.y, s: this.s, p, moved: start.moved, touch: start.touch }; }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    vp.addEventListener('click', (e) => { if (performance.now() - this.dragged < 250) { e.stopPropagation(); e.preventDefault(); } }, true);
    vp.addEventListener('wheel', (e) => {
      const p = local(e);
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0035), p.x, p.y); return; }
      if (vp.classList.contains('zoomed')) { e.preventDefault(); this.user = true; this.set({ s: this.s, x: this.x - e.deltaX, y: this.y - e.deltaY }); }
    }, { passive: false });
    vp.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; const p = local(e); this.zoomBy(1.8, p.x, p.y, true); });
  }
}

/* ======================================================= The eye */
let mouse = { x: -1, y: -1 };
window.addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
const MOODS = {
  idle: { o: 0.92, s: 0, tilt: 0, pupil: 1 },
  focus: { o: 0.8, s: 0, tilt: 0, pupil: 0.9, look: [0.55, 0.2] },
  squint: { o: 0.3, s: 0, tilt: 0, pupil: 0.85, scan: true },
  curious: { o: 1, s: 0, tilt: 0.7, pupil: 1.2 },
  worried: { o: 0.82, s: 0, tilt: -0.6, pupil: 0.8 },
  happy: { o: 0.82, s: 0.45, tilt: 0, pupil: 1.12 },
};
let eyeN = 0;
class Eye {
  constructor(host, o = {}) {
    this.id = 'eye' + eyeN++;
    this.mood = o.mood || 'idle';
    this.st = o.statuses || ['idle', 'idle', 'idle', 'idle', 'idle'];
    this.cur = { o: 0.9, s: 0, tilt: 0, pupil: 1, lx: 0, ly: 0 };
    this.blinkUntil = 0; this.boopUntil = 0; this.hover = false;
    this.lookAt = null;
    const svg = s('svg', { viewBox: '-4 -14 108 86', 'aria-hidden': 'true' });
    const clip = s('clipPath', { id: 'c' + this.id }, (this.shapeP = s('path')));
    svg.append(s('defs', {}, clip, s('radialGradient', { id: 'g' + this.id }, s('stop', { offset: '0', 'stop-color': '#8B5CF6', 'stop-opacity': '.55' }), s('stop', { offset: '1', 'stop-color': '#8B5CF6', 'stop-opacity': '0' }))));
    this.fillP = s('path', { fill: '#100D1A' });
    const g = s('g', { 'clip-path': `url(#c${this.id})` });
    this.glow = s('circle', { r: 26, fill: `url(#g${this.id})` });
    this.arcs = [0, 1, 2, 3, 4].map(() => s('path', {}));
    this.pupilC = s('circle', { fill: '#050507' });
    this.sh1 = s('circle', { r: 2.5, fill: '#fff', opacity: 0.9 });
    this.sh2 = s('circle', { r: 1.1, fill: '#fff', opacity: 0.5 });
    g.append(this.glow, ...this.arcs, this.pupilC, this.sh1, this.sh2);
    this.up = s('path', { fill: 'none', stroke: o.lid || '#C4B5FD', 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    this.lo = s('path', { fill: 'none', stroke: '#8C84B0', 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    this.lashes = [0, 1, 2, 3, 4].map(() => s('path', { stroke: '#8C84B0', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    this.brow = s('path', { fill: 'none', stroke: o.lid || '#C4B5FD', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.85 });
    svg.append(this.fillP, g, this.up, this.lo, ...this.lashes, this.brow);
    host.append(svg);
    this.svg = svg;
    host.addEventListener('pointerenter', () => (this.hover = true));
    host.addEventListener('pointerleave', () => (this.hover = false));
    host.addEventListener('click', () => this.boop());
    this.nextBlink = performance.now() + 1500;
    this.last = performance.now();
    this.visible = true;
    new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; if (this.visible) this.loop(); }).observe(host);
    this.loop();
  }
  boop() { this.boopUntil = performance.now() + 900; this.blinkUntil = performance.now() + 160; }
  setMood(m) { this.mood = m; }
  setStatuses(a) { this.st = a; }
  loop() {
    if (this.raf) return;
    const tick = (now) => {
      this.raf = 0;
      if (!this.visible) return;
      this.frame(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const m = MOODS[now < this.boopUntil ? 'happy' : this.mood] || MOODS.idle;
    if (now > this.nextBlink) { this.blinkUntil = now + 140; this.nextBlink = now + 2600 + Math.random() * 3800; }
    let lx = 0, ly = 0;
    if (m.scan) lx = Math.sin(now / 380) * 0.8;
    else if (m.look) [lx, ly] = m.look;
    else if (mouse.x >= 0) {
      const r = this.svg.getBoundingClientRect();
      const dx = mouse.x - (r.left + r.width / 2), dy = mouse.y - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = Math.min(1, d / Math.max(260, r.width * 1.2));
      lx = (dx / d) * k; ly = (dy / d) * k;
    }
    const blinking = now < this.blinkUntil;
    const tg = { o: blinking ? 0.04 : m.o, s: m.s, tilt: m.tilt, pupil: m.pupil + (this.hover ? 0.22 : 0), lx, ly };
    const c = this.cur, k = 1 - Math.exp(-(blinking ? 40 : 10) * dt);
    for (const key of Object.keys(tg)) c[key] += (tg[key] - c[key]) * k;
    this.draw();
  }
  draw() {
    const { o, s: sm, tilt, pupil, lx, ly } = this.cur;
    const cy = 32;
    const upY1 = cy - 30 * o + tilt * 5, upY2 = cy - 30 * o - tilt * 9;
    const loY = cy + 24 * o * (1 - sm) - 15 * sm * Math.min(1, o * 1.6);
    const upper = `M6 ${cy} C 28 ${upY1} 72 ${upY2} 94 ${cy}`;
    const lower = `M6 ${cy} C 28 ${loY} 72 ${loY} 94 ${cy}`;
    const shape = `${upper} C 72 ${loY} 28 ${loY} 6 ${cy} Z`;
    this.shapeP.setAttribute('d', shape); this.fillP.setAttribute('d', shape);
    this.up.setAttribute('d', upper); this.lo.setAttribute('d', lower);
    const ix = 50 + lx * 15, iy = cy + ly * 7 - sm * 4;
    this.glow.setAttribute('cx', ix); this.glow.setAttribute('cy', iy);
    this.st.forEach((st, i) => {
      const a0 = ((-90 + i * 72 + 6) * Math.PI) / 180, a1 = ((-90 + (i + 1) * 72 - 6) * Math.PI) / 180;
      const R = 17.5, r = 12.6;
      const P = (a, rad) => [ix + Math.cos(a) * rad, iy + Math.sin(a) * rad];
      const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R), [x2, y2] = P(a1, r), [x3, y3] = P(a0, r);
      const el = this.arcs[i];
      el.setAttribute('d', `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`);
      el.setAttribute('fill', COL[st] || COL.idle);
      el.setAttribute('opacity', st === 'idle' || st === 'queued' ? 0.75 : 1);
    });
    this.pupilC.setAttribute('cx', ix); this.pupilC.setAttribute('cy', iy); this.pupilC.setAttribute('r', 7.6 * pupil);
    this.sh1.setAttribute('cx', ix - 3.4); this.sh1.setAttribute('cy', iy - 4);
    this.sh2.setAttribute('cx', ix + 3.6); this.sh2.setAttribute('cy', iy + 3);
    const B = (t, a, b, c2, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c2 + t * t * t * d; };
    [0.22, 0.36, 0.5, 0.64, 0.78].forEach((t, i) => {
      const x = B(t, 6, 28, 72, 94), y = B(t, cy, upY1, upY2, cy);
      const x2 = B(t + 0.01, 6, 28, 72, 94), y2 = B(t + 0.01, cy, upY1, upY2, cy);
      let nx = y2 - y, ny = -(x2 - x);
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const dir = o < 0.22 ? -1 : 1, len = 6.5;
      this.lashes[i].setAttribute('d', `M${x + nx * 2 * dir} ${y + ny * 2 * dir} L${x + nx * (2 + len) * dir + (t - 0.5) * 4} ${y + ny * (2 + len) * dir}`);
    });
    const md = this.mood;
    const brow = md === 'curious' ? `M60 ${upY2 - 9} Q 74 ${upY2 - 15} 86 ${upY2 - 8}` : md === 'worried' ? `M58 ${upY2 - 12} Q 72 ${upY2 - 9} 84 ${upY2 - 4}` : '';
    this.brow.setAttribute('d', brow);
  }
}


/* ======================================================= Navigation */
// [section id, nav label, phase-link?] ; sections without a label light up the closest earlier link
const SECS = [
  ['top'], ['problem', 'Problem'], ['phase1', 'Phase 1', 1], ['interviews', 'Interviews'], ['findings', 'Themes'], ['maps', 'Maps'],
  ['phase2', 'Phase 2', 1], ['process', 'Design'], ['testing', 'Testing'], ['solution', 'Solution', 1], ['eye', 'The eye'], ['features', 'Features'], ['try'], ['next', 'Next'],
];
const nav = $('#nav'), navInd = $('#navInd'), tryBtn = $('.bar .btn');
const linkOf = {};
SECS.forEach(([id, t, ph]) => { if (t) linkOf[id] = nav.appendChild(h('a', { href: '#' + id, class: ph ? 'ph' : '' }, t)); });
const secEls = SECS.map(([id]) => document.getElementById(id));
let curSec = -1;
const prog = $('#prog');
function placeInd(a) {
  if (!a) { navInd.style.opacity = 0; return; }
  navInd.style.opacity = 1;
  navInd.style.width = a.offsetWidth + 'px';
  navInd.style.transform = `translateX(${a.offsetLeft}px)`;
}
function onScroll() {
  const y = scrollY + innerHeight * 0.32;
  let i = 0;
  secEls.forEach((el, k) => { if (el && el.offsetTop <= y) i = k; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = secEls.length - 1;
  const max = document.documentElement.scrollHeight - innerHeight;
  prog.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  if (i === curSec) return;
  curSec = i;
  const id = SECS[i][0];
  const on = SECS[i][1] ? linkOf[id] : null;
  Object.values(linkOf).forEach((a) => a.classList.toggle('on', a === on));
  tryBtn.classList.toggle('here', id === 'try');
  placeInd(on);
  if (on && nav.scrollWidth > nav.clientWidth + 2) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { curSec = -1; onScroll(); });
const goSec = (d) => { const i = Math.min(secEls.length - 1, Math.max(0, curSec + d)); secEls[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const a = document.activeElement;
  if (a && (a.matches('input, textarea, select, iframe') || a.isContentEditable)) return;
  if ($('#lb').classList.contains('open')) {
    if (e.key === 'Escape') closeLB();
    else if (e.key === 'ArrowRight' && lbList) lbStep(1);
    else if (e.key === 'ArrowLeft' && lbList) lbStep(-1);
    return;
  }
  if (tOpen >= 0) {
    if (e.key === 'Escape') { tClose(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); tSwap(tOpen + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const d = e.key === 'ArrowRight' ? 1 : -1;
  if (a && a.closest && a.closest('#sbox, #tl')) { e.preventDefault(); stUser(); stStep(d); return; }
  if (a && a.closest && a.closest('#ivp, #roles')) { e.preventDefault(); ivStep(d); return; }
  e.preventDefault();
  goSec(d);
});

/* reveal */
const io = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
if (!reduce) $$('[data-r]').forEach((el) => { if (el.getBoundingClientRect().top > innerHeight * 0.9) { el.classList.add('pre'); io.observe(el); } });

/* ======================================================= Hero eye */
const heroEye = new Eye($('#heroEye'), { mood: 'squint', lid: '#6b4ce6' });
const hs = $('#heroSpecs'), hm = $('#heroMsg');
const specChips = [1, 2, 3, 4, 5].map((n) => hs.appendChild(h('span', { class: 'spec', 'data-st': 'idle' }, 'Spec ' + n)));
const STORY = [
  [['idle', 'idle', 'idle', 'idle', 'idle'], 'squint', 'Reading 5 specs', 1800],
  [['run', 'idle', 'idle', 'idle', 'idle'], 'focus', 'Testing in a sandboxed copy', 900],
  [['pass', 'run', 'idle', 'idle', 'idle'], 'focus', 'Testing in a sandboxed copy', 900],
  [['pass', 'fail', 'run', 'idle', 'idle'], 'focus', 'Spec 2 broke', 900],
  [['pass', 'fail', 'wait', 'run', 'idle'], 'curious', 'Spec 3 needs you', 1100],
  [['pass', 'fail', 'wait', 'fail', 'run'], 'worried', 'Spec 4 broke', 900],
  [['pass', 'fail', 'wait', 'fail', 'pass'], 'worried', '2 specs broke · a fix is ready', 1700],
  [['pass', 'run', 'pass', 'run', 'pass'], 'focus', 'Spec 3 clarified · re-testing the fix', 1500],
  [['pass', 'pass', 'pass', 'pass', 'pass'], 'happy', '5 of 5 specs verified', 3000],
];
let si = 0;
(function heroStep() {
  const [st, md, msg, ms] = STORY[si];
  heroEye.setStatuses(st); heroEye.setMood(md);
  specChips.forEach((c, i) => (c.dataset.st = st[i]));
  hm.textContent = msg;
  si = (si + 1) % STORY.length;
  setTimeout(heroStep, reduce ? ms * 2 : ms);
})();

/* ======================================================= Interviews */
const PCOL = ['#6b4ce6', '#1f8a6e', '#d9822b', '#c4442d', '#2f7fd1', '#b0408a', '#8a6d12'];
const person = (c, w = 36, hh = 50) => s('svg', { viewBox: '0 0 36 50', width: w, height: hh, 'aria-hidden': 'true' }, s('circle', { cx: 18, cy: 12, r: 9, fill: c }), s('path', { d: 'M3 50 V40 C3 30 10 25 18 25 C26 25 33 30 33 40 V50 Z', fill: c }));
const NOTES = 'From my interview notes', TRANS = 'From the interview transcript';
const ROLES = [
  { t: 'Software engineers', d: 'Full stack, data engineering and data migration. They write the code and check what the AI gives them.', people: [
    { n: 'Engineer 1', r: 'Software Engineer I · full stack', c: PCOL[0],
      got: ['Runs the AI’s changes against the acceptance criteria in the storyboard to see how the code works.', 'The AI misread an SEO task at first and had to be steered back.', 'Syntax errors still get fixed by hand.', 'Uses AI to find bugs and fill gaps.'],
      think: 'Checking against the acceptance criteria is already the habit. The cost is the time it takes when the AI misreads the task.',
      q: 'They run the changes made by AI, against the points given in the acceptance criteria field in the storyboard to see how the code works.', src: NOTES },
    { n: 'Engineer 2', r: 'Associate Software Engineer · data engineering', c: PCOL[1],
      got: ['Uses AI for unfamiliar code, for writing code and for test cases.', 'Checks output against sample data, existing processes and expected results.', 'When the AI misunderstands, it adds work instead of saving it.', 'Only approved AI tools and MCPs are allowed.'],
      think: 'Trust comes from evidence: sample data and expected results. A check that shows its evidence fits how they already work.',
      q: 'AI responses are not automatically trusted.', src: NOTES },
    { n: 'Engineer 3', r: 'Full-stack developer · data migration', c: PCOL[2],
      got: ['AI is new on the team, encouraged through workshops and licensed tools.', 'Pull requests are reviewed by teammates who weren’t involved in the work.', 'Developers explain their changes and show their test results at review.'],
      think: 'Review depends on showing test results. If that evidence is ready before review, review goes faster.',
      q: 'AI-generated code is always double-checked.', src: NOTES },
    { n: 'Engineer 4', r: 'Data engineer · HR data and analytics', c: PCOL[3],
      got: ['AI gets to a first workable solution faster.', 'Validates against the actual systems and data: counts, nulls, duplicates and business rules.', 'Humans stay in charge of production, permissions and business rules.'],
      think: 'The AI fails where it lacks context about the system, so the check has to be against the real rules, not just code that runs.',
      q: 'AI becomes less useful when it lacks context and produces solutions that don’t fit the architecture.', src: NOTES },
  ] },
  { t: 'Product owners & managers', d: 'They write the user stories and the acceptance criteria the code is checked against.', people: [
    { n: 'Product owner', r: 'Writes user stories and acceptance criteria', c: PCOL[4],
      got: ['Uses Claude to draft requirements and scenarios.', 'Keeps company data generic before it goes into an AI tool.', 'Knows the written criteria can be read in more than one way.'],
      think: 'The same acceptance criteria can mean different things to different readers. A vague spec has to be caught and clarified, not guessed.',
      q: 'what we write can be construed in a very different way when somebody is reading it', src: TRANS },
    { n: 'Product manager / owner', r: 'Plans the work and clarifies requirements', c: PCOL[5],
      got: ['A clarification was misread: developers built a behaviour for users it wasn’t meant for.', 'The misunderstanding only came out later, after the work was done.', 'Finds AI less reliable for the product side of the role.'],
      think: 'Misreadings of the criteria surface late, when they cost the most. Clarifying earlier would have saved a round of rework.',
      q: 'But for this clarification, the developers thought that this would also happen for non-logged in users.', src: TRANS },
  ] },
  { t: 'Quality assurance', d: 'They test the work after the developer, against the same acceptance criteria.', people: [
    { n: 'QA tester', r: 'Tests features before release', c: PCOL[6],
      got: ['Stories “usually don’t say the how, they just say the what”.', 'The most common problem is not having proper acceptance criteria.', 'AI-written code makes careful testing more important, not less.'],
      think: 'With AI in the loop, testing has to be more thorough, and weak acceptance criteria are where it starts to go wrong.',
      q: 'because of AI, it’s more important for testers to actually be thorough with what they’re testing because it can get wonky', src: TRANS },
  ] },
];
let ivR = 0, ivP = 0;
const rolesEl = $('#roles'), ivTabs = $('#ivTabs'), ivBody = $('#ivBody');
const roleBtns = ROLES.map((r, i) => {
  const ppl = h('div', { class: 'ppl' }, ...r.people.map((p) => person(p.c)));
  const b = h('button', { class: 'role', role: 'tab', 'aria-selected': 'false' }, ppl, h('div', { class: 'cnt' }, h('b', {}, r.people.length), h('span', {}, r.t)), h('p', {}, r.d), h('span', { class: 'open' }, `Open ${r.people.length === 1 ? 'the interview' : r.people.length + ' interviews'} →`));
  b.addEventListener('click', () => ivRole(i, true));
  rolesEl.append(b);
  return b;
});
function ivRole(i, scroll) {
  ivR = i;
  roleBtns.forEach((b, k) => b.setAttribute('aria-selected', k === i));
  const r = ROLES[i];
  ivTabs.replaceChildren(h('div', { class: 'lbl' }, r.t), ...r.people.map((p, k) => {
    const b = h('button', { class: 'ivt', role: 'tab', 'aria-selected': 'false', style: `animation-delay:${k * 60}ms` }, h('i', { style: `background:${p.c}22` }, person(p.c, 18, 22)), h('span', {}, h('b', {}, p.n), h('small', {}, p.r)));
    b.addEventListener('click', () => ivShow(k));
    return b;
  }));
  ivShow(0);
  if (scroll && innerWidth < 900) $('#ivp').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
function ivShow(k) {
  ivP = k;
  const p = ROLES[ivR].people[k];
  $$('.ivt', ivTabs).forEach((b, j) => b.setAttribute('aria-selected', j === k));
  ivBody.className = 'iv-body';
  ivBody.innerHTML = `<div><div class="who">${esc(ROLES[ivR].t)} · ${k + 1} of ${ROLES[ivR].people.length}</div><h3>${esc(p.n)}<span style="color:var(--mut);font-weight:500"> · ${esc(p.r)}</span></h3></div>
  <div class="quote"><p>${esc(p.q)}</p><small>${esc(p.src)}</small></div>
  <div class="iv-cols"><div class="iv-learn"><div class="k">What I got from it</div><ul>${p.got.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="iv-think"><div class="k">What I understood</div><p>${esc(p.think)}</p></div></div>`;
  void ivBody.offsetWidth;
  ivBody.classList.add('iv-anim');
  const t = ivTabs.children[k + 1];
  if (t && ivTabs.scrollWidth > ivTabs.clientWidth) ivTabs.scrollTo({ left: t.offsetLeft - 12, behavior: reduce ? 'auto' : 'smooth' });
}
function ivStep(d) {
  const n = ROLES[ivR].people.length;
  if (ivP + d >= n) { ivRole((ivR + 1) % ROLES.length); }
  else if (ivP + d < 0) { const r = (ivR - 1 + ROLES.length) % ROLES.length; ivRole(r); ivShow(ROLES[r].people.length - 1); }
  else ivShow(ivP + d);
}
ivRole(0);

/* ======================================================= Thematic analysis: sticky board */
const EYEG = '<svg viewBox="0 0 100 64" aria-hidden="true"><path d="M6 32 C 28 4 72 4 94 32 C 72 58 28 58 6 32 Z" fill="none" stroke="#c4b5fd" stroke-width="7"/><circle cx="50" cy="32" r="13" fill="#86d4c2"/></svg>';
const MOMENTS = [['Before', 'Understanding the task'], ['During', 'Working with the AI'], ['After', 'Handing off']];
const THEMES = [
  { id: 'T1', m: 0, t: 'The acceptance criteria are the finish line', d: 'Every role uses the acceptance criteria to decide whether work is done, but each person re-reads them on their own.', heard: ['“Done” is decided by running the change against the acceptance criteria.', 'Developers, QA and product owners all go back to the same criteria, separately.'], so: 'SpecSight reads the task’s specs and turns each one into tests, so everyone checks against the same list.', fr: [5, 'Late discovery as rework'] },
  { id: 'T2', m: 0, t: 'The same requirement gets read differently', d: 'Stories say what and why. The how is left to interpretation, and gaps only surface late.', heard: ['The story is clear about the goal, less clear about how it should work.', 'Gaps show up at review or in QA, when they cost the most.'], so: 'A vague spec is flagged right away, and the developer can clarify it while the other tests keep running.', fr: [1, 'Interpreting the how'] },
  { id: 'T3', m: 0, t: 'Clarify before you code', d: 'Engineers settle doubts with the product owner, the lead or teammates before writing code.', heard: ['Unclear criteria are escalated, not guessed.', 'Going back to the product owner adds delay, but avoids building the wrong thing.'], so: '“Clarify Spec 3” keeps the question with the task, and the developer can ask the product owner from the same place.', fr: [1, 'Interpreting the how'] },
  { id: 'T4', m: 1, t: 'Context is rebuilt by hand for the AI', d: 'Developers retype the story, the files and the expected output into every prompt.', heard: ['Re-explaining the context in every prompt.', 'Missing task context leads to irrelevant AI output.'], so: 'SpecSight reads the task, its specs and the agent’s changes itself, so nothing has to be retyped to check the work.', fr: [2, 'Rebuilding context for AI'] },
  { id: 'T5', m: 1, t: 'The AI doesn’t know our system', d: 'Output is mostly right, but it misses the organisation’s rules and needs adapting or undoing.', heard: ['Output that looks right but misses an edge case.', 'It has to be checked line by line.'], so: 'Every spec is tested on a sandboxed copy of the app, and SpecSight shows exactly where the code broke and why.', fr: [3, 'Mostly-right output'] },
  { id: 'T6', m: 1, t: 'AI output is never trusted blindly', d: 'Everyone checks AI work, but how they check varies from person to person.', heard: ['AI is a tool, not a decision maker.', 'They want the AI to show evidence, then they approve.', 'A human still reviews at the end.'], so: 'One click verifies the agent’s work against the specs. The developer still decides: fix by agent, or investigate in VS Code first.', fr: [3, 'Mostly-right output'] },
  { id: 'T8', m: 1, t: 'Data rules shape how AI is used', d: 'Only approved AI tools are allowed, and sensitive data is kept out of prompts.', heard: ['Confidential data can’t go into non-enterprise AI tools.', 'Sanitizing context before prompting takes time.'], so: 'Not solved yet. The next step is to show clearly which code and data SpecSight reads, and keep it to approved tools.', fr: [2, 'Rebuilding context for AI'] },
  { id: 'T7', m: 2, t: 'Evidence matters at handoff', d: 'Reviewers and QA need to see what changed, how it was built and what was tested.', heard: ['Tests get shown in a PR meeting.', 'QA asks how it was built.'], so: 'The Proof Capsule and the test recordings go into the pull request, with what was and wasn’t tested.', fr: [4, 'No evidence at handoff'] },
];
const LANEC = [['#ffe9b8', '#6b4a06'], ['#e2d9ff', '#3d2a8a'], ['#cff2e5', '#145c49']];
const tboard = $('#tboard'), tdetail = $('#tdetail');
const tNotes = [];
const ROT = [-1.6, 1.2, -0.6, 1.8, -1.2, 0.8, -1.8, 1.4];
MOMENTS.forEach(([a, b], m) => {
  const lane = h('div', { class: 'tlane lane-' + m }, h('div', { class: 'tlane-h' }, h('b', {}, b), h('span', {}, a)));
  const box = h('div', { class: 'tnotes' });
  THEMES.forEach((t, i) => {
    if (t.m !== m) return;
    const n = h('button', { class: 'note', style: `--r:${ROT[i]}deg`, 'aria-label': `${t.id}: ${t.t}` }, h('span', { class: 'id' }, t.id), h('span', { class: 't' }, t.t), h('span', { class: 'go' }, 'Open →'));
    n.addEventListener('click', () => tOpenAt(i));
    box.append(n);
    tNotes[i] = n;
  });
  lane.append(box);
  $('#tlanes').append(lane);
});
let tOpen = -1;
function tFill(i) {
  const t = THEMES[i], [bg, fg] = LANEC[t.m];
  tdetail.innerHTML = `<div class="inner"><div class="top"><span class="where" style="background:${bg};color:${fg}">${t.id} · ${MOMENTS[t.m][0]}: ${MOMENTS[t.m][1]}</span><div class="ctrls"><button class="pbtn ic" data-d="-1" aria-label="Previous theme">←</button><span>${i + 1} / ${THEMES.length}</span><button class="pbtn ic" data-d="1" aria-label="Next theme">→</button><button class="pbtn ic" data-x aria-label="Close">✕</button></div></div>
  <h3>${esc(t.t)}</h3><p class="desc">${esc(t.d)}</p>
  <div class="tcols"><div class="theard"><div class="k">What I heard in interviews</div><ul>${t.heard.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="tso"><div class="k">${EYEG}What it means for SpecSight</div><p>${esc(t.so)}</p></div></div>
  <span class="tfr"><b>${t.fr[0]}</b>Friction point: ${esc(t.fr[1])}</span></div>`;
  $$('[data-d]', tdetail).forEach((b) => b.addEventListener('click', () => tSwap(tOpen + +b.dataset.d)));
  $('[data-x]', tdetail).addEventListener('click', tClose);
}
function tPlace(noteRect) {
  const br = tboard.getBoundingClientRect();
  const w = tdetail.offsetWidth, hh = tdetail.offsetHeight;
  const left = Math.max(14, (br.width - w) / 2);
  let top = noteRect ? noteRect.top - br.top - 30 : 20;
  tboard.style.minHeight = '';
  const bh = Math.max(tboard.offsetHeight, hh + 28);
  tboard.style.minHeight = bh + 'px';
  top = Math.max(14, Math.min(top, bh - hh - 14));
  return { left, top };
}
function tOpenAt(i) {
  tOpen = i;
  tFill(i);
  const nr = tNotes[i].getBoundingClientRect(), br = tboard.getBoundingClientRect();
  tdetail.style.opacity = 0;
  tdetail.style.transform = 'none';
  const { left, top } = tPlace(nr);
  tdetail.style.left = left + 'px'; tdetail.style.top = top + 'px';
  tboard.classList.add('open');
  tNotes.forEach((n, k) => n.classList.toggle('src', k === i));
  const w = tdetail.offsetWidth, hh = tdetail.offsetHeight;
  const dx = nr.left - br.left - left, dy = nr.top - br.top - top;
  const inner = $('.inner', tdetail);
  if (reduce) { tdetail.style.opacity = 1; }
  else {
    tdetail.animate([{ transform: `translate(${dx}px,${dy}px) scale(${nr.width / w},${nr.height / hh})`, opacity: 0.4, borderRadius: '8px' }, { transform: 'none', opacity: 1, borderRadius: '26px' }], { duration: 620, easing: 'cubic-bezier(.22,.9,.24,1)', fill: 'forwards' });
    inner.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 620, easing: 'ease-out' });
  }
  const r2 = tdetail.getBoundingClientRect();
  if (r2.top < 90 || br.top + top + hh > innerHeight) window.scrollTo({ top: scrollY + br.top + top - 110, behavior: reduce ? 'auto' : 'smooth' });
  setTimeout(() => { const b = $('[data-x]', tdetail); b && b.focus({ preventScroll: true }); }, 50);
}
function tSwap(i) {
  i = (i + THEMES.length) % THEMES.length;
  const inner = $('.inner', tdetail);
  const go = () => {
    tOpen = i;
    tFill(i);
    tNotes.forEach((n, k) => n.classList.toggle('src', k === i));
    const { left, top } = tPlace(null);
    const prevTop = parseFloat(tdetail.style.top);
    tdetail.style.left = left + 'px'; tdetail.style.top = Math.min(prevTop, top) + 'px';
    if (!reduce) $('.inner', tdetail).animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,.9,.24,1)' });
  };
  if (reduce || !inner) go(); else inner.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-14px)' }], { duration: 180, easing: 'ease-in' }).onfinish = go;
}
function tClose() {
  if (tOpen < 0) return;
  const i = tOpen;
  tOpen = -1;
  const nr = tNotes[i].getBoundingClientRect(), dr = tdetail.getBoundingClientRect();
  const done = () => { tboard.classList.remove('open'); tdetail.getAnimations().forEach((a) => a.cancel()); tdetail.style.opacity = 0; tNotes[i].classList.remove('src'); tboard.style.minHeight = ''; tNotes[i].focus({ preventScroll: true }); };
  if (reduce) { done(); return; }
  tboard.classList.remove('open');
  tdetail.style.opacity = 1;
  tdetail.getAnimations().forEach((a) => a.cancel());
  const a = tdetail.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${nr.left - dr.left}px,${nr.top - dr.top}px) scale(${nr.width / dr.width},${nr.height / dr.height})`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  a.onfinish = done;
}
$('#tscrim').addEventListener('click', tClose);
let tSw = null;
tdetail.addEventListener('touchstart', (e) => { tSw = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
tdetail.addEventListener('touchend', (e) => { if (!tSw) return; const dx = e.changedTouches[0].clientX - tSw[0], dy = e.changedTouches[0].clientY - tSw[1]; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) tSwap(tOpen + (dx < 0 ? 1 : -1)); tSw = null; });
addEventListener('resize', () => { if (tOpen >= 0) { const { left } = tPlace(null); tdetail.style.left = left + 'px'; } });

/* ======================================================= Maps */
const STAKE = {
  vb: [2180, 700, 3520, 3260],
  rings: [[3856, 2328, 1564], [3856, 2328, 1112], [3856, 2328, 602]],
  groups: { core: ['Goal', '#ffc7c2'], eng: ['Engineering & AI', '#dcccff'], des: ['Design, research & frontend', '#ffc2ec'], mgmt: ['Leads & managers', '#cdf4d3'], qa: ['Quality', '#ffecbd'], gov: ['Governance & policy', '#c2e5ff'], biz: ['Business & customers', '#ffe0c2'] },
  nodes: [
    ['74600', 'core', 3856, 2328, 560, 224, 'High Quality AI Outputs'], ['74601', 'eng', 3440, 2555, 416, 166, 'Backend Engineer'], ['74603', 'des', 2952, 2715, 416, 166, 'UX Designer'],
    ['74604', 'des', 3296, 3019, 416, 166, 'UI Designer'], ['74606', 'des', 2672, 2293, 416, 166, 'UX Researcher'], ['74608', 'des', 3856, 2904, 416, 160, 'Frontend Engineer'],
    ['74612', 'mgmt', 3568, 3342, 416, 160, 'Engineering Lead'], ['74616', 'qa', 4264, 2536, 368, 160, 'Quality Assurance'], ['74619', 'gov', 4472, 1736, 368, 160, 'CTO'],
    ['74620', 'gov', 4600, 2216, 368, 160, 'CSO + CIO'], ['74621', 'gov', 5112, 1864, 368, 160, 'Legal Department'], ['74622', 'gov', 4232, 2024, 368, 160, 'AI Company Policies'],
    ['74627', 'eng', 3660, 2072, 248, 160, 'AI'], ['74629', 'eng', 3304, 2296, 368, 160, 'System Architect'], ['74631', 'mgmt', 4216, 3182, 368, 160, 'Product Manager'],
    ['74633', 'biz', 2416, 1806, 368, 160, 'Customers'], ['74635', 'biz', 5416, 2520, 368, 160, 'CEO'], ['74637', 'biz', 5304, 2968, 368, 160, 'Company Stakeholders'], ['74639', 'mgmt', 4104, 3728, 368, 160, 'Project Manager'],
  ],
  edges: [
    ['74601', '74600', 'Queries for output'], ['74603', '74604', 'Discusses design'], ['74606', '74603', 'Hands off research findings'], ['74608', '74600', 'Queries for output'], ['74604', '74608', 'Hands off design specs'],
    ['74608', '74601', 'Hands off feature requirements'], ['74612', '74601', 'Project requirements and progress'], ['74603', '74608', 'Hands off prototype'], ['74612', '74608', 'Project requirements and progress'],
    ['74616', '74601', 'Reviews work'], ['74616', '74600', 'Ensures output quality'], ['74622', '74600', 'Determines AI usage'], ['74619', '74622', 'Technology alignment'], ['74620', '74622', 'Security'],
    ['74621', '74622', 'Determines policies for AI inputs'], ['74627', '74600', 'Produces output'], ['74629', '74627', 'Builds AI systems'], ['74612', '74631', 'Discuss criteria and progress'], ['74606', '74633', 'Talks to customers'],
    ['74635', '74621', 'Checks company functions and legality'], ['74635', '74637', 'Informs about profit'], ['74631', '74639', 'Shares updates, coordinates priorities, discusses timelines'], ['74639', '74635', 'Communicates timelines, goals and budgets'],
  ],
  labels: true,
  orig: ['assets/stakeholder.webp', 1400, 839, 'Stakeholder map · original board'],
};
const ECO = {
  vb: [1560, 560, 3840, 3920],
  rings: [[3468, 2525, 1740, '#eafdff'], [3468, 2525, 1564, '#cfe6e8'], [3468, 2525, 1247, '#b5d6d9'], [3468, 2525, 925, '#9cc7cb']],
  quad: [['AI prompting & development', 3468, 700], ['Legal & compliance', 5290, 2525, 90], ['Product management', 3468, 4400], ['Design & research', 1650, 2525, -90]],
  groups: { dev: ['Developer', '#1a4b50'], actor: ['Actors', '#2a77b0'], tool: ['Tools', '#ffecbd'], art: ['Artifacts', '#3dadff'], proc: ['Processes', '#ffc2ec'] },
  nodes: [
    ['74699', 'dev', 3474, 2527, 746, 746, 'Developer', 'E'], ['74700', 'tool', 4414, 3622, 304, 304, 'Communication Platforms: Gmail, Slack, Microsoft', 'E', '#dcccff'], ['74701', 'tool', 3234, 2231, 304, 304, 'AI Platforms: Copilot, Gemini, ChatGPT, Claude Code', 'E'],
    ['74702', 'tool', 2664, 1994, 230, 230, 'Jira', 'E'], ['74703', 'tool', 4060, 1517, 259, 259, 'Database Management Systems', 'E'], ['74704', 'tool', 2328, 2963, 230, 230, 'Storyboarding Platforms', 'E'],
    ['74705', 'tool', 3444, 1454, 240, 240, 'VS Code', 'E'], ['74707', 'tool', 2986, 1717, 230, 230, 'IDE', 'E'], ['74708', 'actor', 2498, 2513, 276, 276, 'UX Designer', 'E'],
    ['74710', 'actor', 3866, 3719, 304, 304, 'Stakeholders', 'E'], ['74711', 'actor', 4613, 2736, 230, 230, 'CSO', 'E'], ['74712', 'actor', 3328, 3891, 269, 269, 'Project Managers', 'E'],
    ['74715', 'actor', 2160, 2211, 262, 262, 'UX Researcher', 'E'], ['74717', 'actor', 2707, 3190, 269, 269, 'UI Designer', 'E'], ['74719', 'actor', 4881, 2402, 269, 269, 'Legal Department', 'E'],
    ['74721', 'art', 4386, 2542, 304, 125, 'FinOps', 'R'], ['74722', 'art', 4110, 3340, 232, 125, 'DevOps', 'R'], ['74724', 'art', 3904, 2634, 304, 196, 'AI Company Policies', 'R'],
    ['74727', 'art', 2849, 2296, 243, 157, 'Architecture Diagrams', 'R'], ['74728', 'art', 3222, 3000, 183, 70, 'Epics', 'R'], ['74729', 'actor', 3831, 3040, 280, 280, 'Team Lead', 'E'],
    ['74732', 'actor', 4505, 2212, 251, 251, 'CDO', 'E'], ['74734', 'proc', 3620, 2232, 243, 150, 'Skill Repositories', 'R'], ['74736', 'art', 4274, 2854, 304, 148, 'Audit Records', 'R'],
    ['74742', 'proc', 4178, 2038, 243, 148, 'Sandbox Testing', 'R'], ['74743', 'proc', 3935, 2233, 243, 107, 'Unit Testing', 'R'], ['74746', 'art', 2986, 2031, 158, 97, 'Tickets', 'R'],
    ['74749', 'art', 4206, 2367, 194, 125, 'API Auth Token', 'R'], ['74751', 'proc', 2669, 1701, 240, 111, 'Kill Switch', 'R'], ['74753', 'actor', 3468, 2854, 268, 268, 'QA Team', 'E'],
    ['74754', 'proc', 3829, 2037, 230, 145, 'AI Harnessing', 'R'], ['74756', 'proc', 4166, 1831, 219, 148, 'AI diagnostic loops', 'R'], ['74758', 'proc', 3639, 3255, 197, 92, 'Test Driven Development', 'R'],
    ['74762', 'actor', 2914, 3654, 304, 304, 'Customers', 'E'], ['74765', 'actor', 3302, 3254, 269, 269, 'Product Manager', 'E'], ['74768', 'art', 3026, 2894, 219, 92, 'Feature Specs', 'R'],
    ['74770', 'actor', 4275, 3146, 219, 219, 'CTO', 'E'], ['74773', 'tool', 4628, 3309, 187, 187, 'Google Suite Tools', 'E', '#dcccff'], ['74782', 'actor', 3766, 1247, 280, 280, 'Engineering Lead', 'E'],
    ['74783', 'art', 3072, 1410, 243, 157, 'Terminal Logs', 'R'], ['74786', 'tool', 3756, 1755, 259, 259, 'Git Hosting Services', 'E'], ['74790', 'actor', 3059, 2616, 269, 269, 'Platform Architect', 'E'],
    ['74794', 'art', 2694, 2815, 243, 157, 'Figma mockups', 'R'], ['74798', 'art', 3069, 3111, 197, 92, 'Project Requirement Docs', 'R'], ['74801', 'art', 3506, 2030, 144, 97, 'Tokens', 'R'],
    ['74804', 'tool', 3363, 1789, 243, 157, 'Code Languages: Java, TypeScript, React', 'R', '#ffc7c2'], ['74807', 'art', 3556, 3622, 240, 155, 'Weekly Reports', 'R'],
  ],
  edges: [
    ['74705', '74703', 'Queries and updates data'], ['74708', '74704', 'Uses to understand user needs'], ['74710', '74712', 'Provides business needs'], ['74715', '74708', 'Gives research to inform'], ['74717', '74704', 'Uses to understand user needs'],
    ['74711', '74719', 'Reports to'], ['74722', '74710', 'Project progress'], ['74721', '74724', 'Informs spend'], ['74700', '74729', 'Shares information and updates'], ['74707', '74703', 'Queries and updates data'],
    ['74732', '74721', 'Manages'], ['74701', '74734', 'Invokes'], ['74719', '74724', 'Ensures legality'], ['74721', '74736', 'Monitors'], ['74711', '74736', 'Reviews'], ['74732', '74736', 'Owns'], ['74724', '74736', 'Sets requirements'],
    ['74743', '74742', 'Tests in a separate environment'], ['74746', '74702', 'Received through'], ['74746', '74701', 'Provides task context'], ['74724', '74749', 'Controls'], ['74751', '74701', 'Interrupts execution'],
    ['74734', '74754', 'Implement'], ['74754', '74756', 'Workflow within'], ['74729', '74758', 'Sets testing approach'], ['74758', '74753', 'Supports'], ['74712', '74729', 'Coordinates work'], ['74715', '74762', 'Talks to'],
    ['74765', '74702', 'Submits'], ['74765', '74704', 'Uses to understand user needs'], ['74700', '74699', 'Receives communication through'], ['74770', '74711', 'Oversees'], ['74710', '74770', 'Shares business priorities'], ['74700', '74773', ''],
    ['74699', '74768', 'Uses'], ['74699', '74728', 'Builds tasks within'], ['74699', '74724', 'Informs AI usage'], ['74699', '74743', 'Tests small chunks of code'], ['74699', '74753', 'Checks output quality'], ['74699', '74701', 'Inputs prompts'],
    ['74705', '74783', 'Runs commands and checks outputs'], ['74707', '74783', ''], ['74705', '74786', 'Pulls and pushes code'], ['74707', '74786', 'Pulls and pushes code'], ['74786', '74703', 'Stores database code'],
    ['74790', '74727', 'Builds'], ['74782', '74729', 'Guides'], ['74794', '74768', 'Informs'], ['74708', '74794', 'Creates'], ['74717', '74794', 'Creates'], ['74765', '74798', 'Creates'], ['74798', '74728', 'Informs'],
    ['74701', '74801', 'Consumes'], ['74746', '74786', 'Links code changes'], ['74804', '74705', 'Code editing and development'], ['74804', '74707', 'Code editing and development'], ['74765', '74807', 'Creates'], ['74729', '74728', 'Creates'],
  ],
  labels: false,
  orig: ['assets/ecosystem.webp', 1400, 947, 'Ecosystem map · original board'],
};
/* ======================================================= Map room */
const darkFill = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 < 140; };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join(''); };
// text measuring, so labels always fit inside their shapes
const mctx = document.createElement('canvas').getContext('2d');
const tw = (t, size, weight = 600) => { mctx.font = `${weight} ${size}px Inter, sans-serif`; return mctx.measureText(t).width; };
function wrapW(text, maxW, size, weight) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && tw(t, size, weight) > maxW) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function fitText(text, maxW, maxH, size, min, weight, lh = 1.18) {
  for (let fs = size; fs >= min; fs -= 2) {
    const lines = wrapW(text, maxW, fs, weight);
    if (lines.length * fs * lh <= maxH && Math.max(...lines.map((l) => tw(l, fs, weight))) <= maxW) return { lines, fs };
  }
  return { lines: wrapW(text, maxW, min, weight), fs: min };
}
function labelEl(x, y, text, fsz) {
  const lines = wrapW(text, fsz * 11, fsz, 500);
  const w = Math.max(...lines.map((l) => tw(l, fsz, 500))) + 26, hh = lines.length * fsz * 1.22 + 14;
  const g = s('g', { class: 'elab', 'pointer-events': 'none' });
  g.append(s('rect', { x: x - w / 2, y: y - hh / 2, width: w, height: hh, rx: 12, fill: '#fffdf8', stroke: '#d9cfbd', 'stroke-width': 3 }), textBlock(x, y, lines, fsz, { fill: '#3b3647', 'font-family': 'Inter, sans-serif', 'font-weight': 500 }));
  return g;
}

const MIND = (() => {
  const K = 4;
  const T = '#6e9e97', D = '#effcfd', O = '#ff9f43', R = '#cde8ff', C = '#163d3a';
  const raw = [
    ['c', 'core', 936, 808, 220, 100, 'Verifying AI-Generated Code Meets Acceptance Criteria Before Sending for Peer Review', C],
    ['kf', 'kf', 922, 419, 110, 30, 'Key Factors', T],
    ['kf1', 'kf', 334, 336, 204, 30, 'Accuracy', D], ['kf2', 'kf', 569, 336, 204, 30, 'Relevance', D], ['kf3', 'kf', 805, 336, 204, 30, 'Context and Understanding', D], ['kf4', 'kf', 1040, 336, 204, 30, 'Prompting and Instructions', D], ['kf5', 'kf', 1277, 336, 204, 30, 'Evaluation and Validation', D],
    ['us', 'us', 434, 512, 90, 30, 'Users', T],
    ['us1', 'us', 302, 445, 196, 30, 'Peer Reviewers / Teammates', D], ['us2', 'us', 570, 445, 200, 30, 'Software Developers / Engineers', D],
    ['wf', 'wf', 1075, 585, 130, 30, 'Workflow Process', T],
    ['wf1', 'wf', 1354, 497, 196, 46, 'Understand user story and its requirements', D], ['wf2', 'wf', 1354, 552, 196, 46, 'Provide context and related information to AI', D], ['wf3', 'wf', 1354, 605, 196, 46, 'Verify AI output against the acceptance criteria', D], ['wf4', 'wf', 1354, 650, 196, 30, 'Make corrections / refine', D], ['wf5', 'wf', 1354, 688, 196, 30, 'Record evidence / assumptions', D], ['wf6', 'wf', 1354, 723, 196, 30, 'Send output for peer review', D],
    ['ch', 'ch', 560, 700, 156, 32, 'Current Challenge', T],
    ['ch1', 'ch', 296, 605, 250, 32, 'Multiple rounds of prompting and rework', D], ['ch2', 'ch', 296, 666, 250, 54, 'Incorrect or incomplete AI-generated code', D], ['ch3', 'ch', 296, 737, 250, 54, 'Additional hours spent fixing and checking the incorrect code', D], ['ch4', 'ch', 296, 808, 250, 54, 'Issues only surface during peer review, causing rework cycles', D],
    ['go', 'go', 795, 996, 164, 34, 'Goal / Desired Outcome', T],
    ['go1', 'go', 516, 947, 260, 54, 'Identify incorrect or incomplete code before sending for peer review', D], ['go2', 'go', 516, 1040, 260, 56, 'Greater confidence when sending code for review', D], ['go3', 'go', 250, 996, 140, 62, 'Reduce rework and debugging time', R],
    ['ao', 'ao', 637, 1215, 140, 34, 'AI-generated Output', T],
    ['ao1', 'ao', 357, 1169, 260, 34, 'Related to the task and its context', D], ['ao2', 'ao', 357, 1215, 260, 34, 'Accurate results', D], ['ao3', 'ao', 357, 1261, 260, 34, 'Meets acceptance criteria', D],
    ['cx', 'cx', 567, 1475, 100, 34, 'Context', O],
    ['cx1', 'cx', 340, 1395, 260, 34, 'User story', D], ['cx2', 'cx', 340, 1449, 260, 34, 'Project requirements / acceptance criteria', D], ['cx3', 'cx', 340, 1502, 260, 34, 'Task-related documentation / runbooks', D], ['cx4', 'cx', 340, 1555, 260, 34, 'Task history', D],
    ['vp', 'vp', 1030, 1282, 140, 30, 'Verification Process', T],
    ['vp1', 'vp', 1169, 1329, 192, 54, 'Review and verify the generated AI output', D], ['vp2', 'vp', 1169, 1389, 192, 44, 'Check against acceptance criteria', D], ['vp3', 'vp', 1169, 1433, 192, 30, 'Refine prompts if needed', D], ['vp4', 'vp', 1169, 1477, 192, 44, 'Conduct tests for several edge cases', D], ['vp5', 'vp', 1169, 1529, 192, 44, 'Prompt AI to conduct and generate tests', D],
    ['ho', 'ho', 1220, 908, 156, 44, 'Human Oversight', O],
    ['ho1', 'ho', 1475, 844, 196, 30, 'Developer’s judgement', D], ['ho2', 'ho', 1475, 886, 196, 30, 'Dev testing', D], ['ho3', 'ho', 1475, 929, 196, 30, 'Multiple quality checks', D], ['ho4', 'ho', 1475, 971, 196, 30, 'Feedback loop', D], ['ho5', 'ho', 1690, 867, 112, 40, 'Domain Expertise', R],
    ['va', 'va', 1255, 1178, 80, 30, 'Value', T],
    ['va1', 'va', 1438, 1124, 180, 46, 'Increase in confidence in using AI', D], ['va2', 'va', 1438, 1178, 180, 30, 'Higher productivity', D], ['va3', 'va', 1438, 1222, 180, 30, 'Better quality in AI output', D],
  ];
  const nodes = raw.map(([id, g, x, y, w, h, t, f]) => [id, g, x * K, y * K, w * K, h * K, t, 'R', f]);
  const kids = (p, n) => Array.from({ length: n }, (_, i) => [p, p + (i + 1), '']);
  const edges = [
    ...['kf', 'us', 'wf', 'ch', 'go', 'ao', 'va'].map((t) => ['c', t, '']),
    ...kids('kf', 5), ...kids('us', 2), ...kids('wf', 6), ...kids('ch', 4), ...kids('go', 2), ...kids('ao', 3), ...kids('cx', 4), ...kids('vp', 5), ...kids('ho', 4), ...kids('va', 3),
    ['wf', 'ho', 'Supports', 'o'], ['cx', 'ao', 'Supports', 'o'], ['ao', 'vp', 'Checked by', 'o'], ['c', 'vp', 'Supports', 'o'],
    ['go1', 'go3', '', 'b'], ['go2', 'go3', '', 'b'], ['ho5', 'ho1', '', 'b'], ['ho5', 'ho2', '', 'b'],
  ];
  return {
    key: 'm', vb: [160 * K, 290 * K, 1660 * K, 1320 * K], rings: [], nodes, edges,
    groups: { core: ['Core problem', C], kf: ['Key factors', T], us: ['Users', T], wf: ['Workflow', T], ch: ['Current challenge', T], go: ['Goal', T], ao: ['AI-generated output', T], vp: ['Verification', T], va: ['Value', T], ho: ['Human oversight', O], cx: ['Context', O] },
    orig: ['assets/mindmap.webp', 3000, 2628, 'Mind map · original board'],
    title: 'Mind map',
  };
})();
STAKE.key = 's'; ECO.key = 'e';

function buildMap(M) {
  const [vx, vy, vw, vh] = M.vb;
  const isS = M === STAKE;
  const svg = s('svg', { viewBox: M.vb.join(' '), width: vw, height: vh, role: 'img', 'aria-label': isS ? 'Interactive stakeholder map' : 'Interactive ecosystem map' });
  const mk = 'ar' + M.key;
  svg.append(s('defs', {}, s('marker', { id: mk, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#7d7690' }))));
  const bg = s('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'transparent' });
  svg.append(bg);
  const rg = s('g');
  M.rings.forEach(([cx, cy, r, f]) => rg.append(s('circle', { cx, cy, r, fill: f || 'rgba(107,76,230,0.035)', stroke: f ? 'none' : '#d8cdf3', 'stroke-width': 8, 'stroke-dasharray': f ? null : '28 22' })));
  svg.append(rg);
  if (M.quad) M.quad.forEach(([t, x, y, rot]) => svg.append(s('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 60, 'font-weight': 700, fill: '#3f858c', 'font-family': 'Inter, sans-serif', transform: rot ? `rotate(${rot} ${x} ${y})` : null, 'letter-spacing': 3 }, t.toUpperCase())));
  const byId = {};
  M.nodes.forEach((n) => (byId[n[0]] = { id: n[0], g: n[1], x: n[2], y: n[3], w: n[4], h: n[5], t: n[6], shape: n[7] || 'R', fill: n[8] || M.groups[n[1]][1] }));
  const clipPt = (n, tx, ty) => {
    const dx = tx - n.x, dy = ty - n.y;
    if (n.shape === 'E') { const d = Math.hypot(dx, dy) || 1; return [n.x + (dx / d) * (n.w / 2 + 6), n.y + (dy / d) * (n.w / 2 + 6)]; }
    const k = Math.min((n.w / 2 + 6) / Math.abs(dx || 1e-6), (n.h / 2 + 6) / Math.abs(dy || 1e-6));
    return [n.x + dx * k, n.y + dy * k];
  };
  const eg = s('g'), allLabs = s('g', { class: 'labs-all' }), ng = s('g'), topLabs = s('g');
  const edgeEls = [];
  const fsz = isS ? 26 : 30;
  M.edges.forEach(([a, b, lab, dash]) => {
    const A = byId[a], Bn = byId[b];
    if (!A || !Bn) return;
    const [x1, y1] = clipPt(A, Bn.x, Bn.y), [x2, y2] = clipPt(Bn, A.x, A.y);
    const g = s('g', { class: 'ed' });
    g.append(s('path', { d: `M${x1} ${y1} L${x2} ${y2}`, stroke: dash === 'o' ? '#f39a43' : dash === 'b' ? '#5aa9e6' : '#9b94ad', 'stroke-width': dash ? 5 : 4, 'stroke-dasharray': dash ? '18 14' : null, fill: 'none', 'marker-end': `url(#${mk})` }));
    eg.append(g);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (lab) allLabs.append(labelEl(mx, my, lab, fsz));
    edgeEls.push({ a, b, lab, g, mx, my, x1, y1, x2, y2 });
  });
  const nodeEls = {};
  Object.values(byId).forEach((n) => {
    const g = s('g', { class: 'nd', tabindex: 0, role: 'button', 'aria-label': n.t });
    const dark = darkFill(n.fill);
    if (n.shape === 'E') g.append(s('circle', { class: 'shape', cx: n.x, cy: n.y, r: n.w / 2, fill: n.fill, stroke: shade(n.fill, 0.82), 'stroke-width': 4 }));
    else g.append(s('rect', { class: 'shape', x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: Math.min(28, n.h / 3), fill: n.fill, stroke: shade(n.fill, 0.82), 'stroke-width': 4 }));
    const big = n.g === 'core' || n.g === 'dev';
    const wt = big ? 700 : 600;
    const maxW = n.shape === 'E' ? n.w * 0.72 : n.w - 40, maxH = n.shape === 'E' ? n.w * 0.64 : n.h - 28;
    const { lines, fs } = fitText(n.t, maxW, maxH, big ? 70 : isS ? 46 : 40, 16, wt);
    g.append(textBlock(n.x, n.y, lines, fs, { fill: dark ? '#fff' : '#1d1a26', 'font-weight': wt, 'font-family': 'Inter, sans-serif' }));
    g.addEventListener('click', (e) => { e.stopPropagation(); mapSelect(n.id, true); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mapSelect(n.id, true); } });
    ng.append(g);
    nodeEls[n.id] = g;
  });
  svg.append(eg, allLabs, ng, topLabs);
  bg.addEventListener('click', () => mapSelect(null));
  rg.addEventListener('click', () => mapSelect(null));
  return { svg, byId, nodeEls, edgeEls, M, topLabs, fsz };
}
let MAP = null, mapPZ = null;
const mapC = $('#mapC'), mapVp = $('#mapVp'), mapSide = $('#mapSide'), mapLegend = $('#mapLegend');
const maps = {};
function showMap(which) {
  const M = which === 'stake' ? STAKE : which === 'eco' ? ECO : MIND;
  maps[which] = maps[which] || buildMap(M);
  MAP = maps[which];
  mapC.replaceChildren(MAP.svg);
  $('#mapTitle').textContent = which === 'stake' ? 'Stakeholder map' : which === 'eco' ? 'Ecosystem map' : 'Mind map';
  if (!mapPZ) mapPZ = new PZ(mapVp, mapC, M.vb[2], M.vb[3], { max: 9 });
  else { mapPZ.resize(M.vb[2], M.vb[3]); mapPZ.fit(false); }
  mapGroups.clear();
  mapLegend.replaceChildren(...Object.entries(M.groups).map(([k, [t, c]]) => {
    const b = h('button', { class: 'lg', 'data-g': k }, h('i', { style: `background:${c}` }), t);
    b.addEventListener('click', () => mapGroupSel(k));
    return b;
  }));
  mapSelect(null);
}
// place each connection label along its line where it covers no highlighted node and no other label
function topLabels(edges) {
  const fsz = MAP.fsz, placed = [];
  const obs = Object.values(MAP.byId).filter((n) => MAP.nodeEls[n.id].classList.contains('hl')).map((n) => {
    const k = n.shape === 'E' ? 0.36 : 0.5; return { l: n.x - n.w * k, r: n.x + n.w * k, t: n.y - n.h * k, b: n.y + n.h * k };
  });
  const ov = (A, B) => Math.max(0, Math.min(A.r, B.r) - Math.max(A.l, B.l)) * Math.max(0, Math.min(A.b, B.b) - Math.max(A.t, B.t));
  const els = edges.filter((e) => e.lab).map((e) => {
    const lines = wrapW(e.lab, fsz * 11, fsz, 500);
    const w = Math.max(...lines.map((l) => tw(l, fsz, 500))) + 26, hh = lines.length * fsz * 1.22 + 14;
    const dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    let best = null;
    const cands = [];
    for (const tt of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) for (const off of [0, 1, -1, 2, -2]) cands.push([e.x1 + dx * tt + nx * off * hh * 0.75, e.y1 + dy * tt + ny * off * hh * 0.75, Math.abs(off) * w * 1.2 + Math.abs(tt - 0.5) * w * 3]);
    const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
    for (const rad of [hh * 1.4, hh * 2.2, w * 0.65, w * 0.9]) for (let a = 0; a < 360; a += 30) cands.push([mx + Math.cos((a * Math.PI) / 180) * rad, my + Math.sin((a * Math.PI) / 180) * rad, w * 3 + rad * 3]);
    for (const [cx, cy, pen] of cands) {
      const R = { l: cx - w / 2 - 6, r: cx + w / 2 + 6, t: cy - hh / 2 - 6, b: cy + hh / 2 + 6 };
      const score = obs.reduce((s, o) => s + ov(R, o), 0) * 40 + placed.reduce((s, o) => s + ov(R, o), 0) * 50 + pen;
      if (!best || score < best.score) best = { score, cx, cy, R };
    }
    placed.push(best.R);
    return labelEl(best.cx, best.cy, e.lab, fsz);
  });
  MAP.topLabs.replaceChildren(...els);
}
const mapGroups = new Set();
function mapGroupSel(k) {
  const keep = new Set(mapGroups);
  keep.has(k) ? keep.delete(k) : keep.add(k);
  mapSelect(null);
  if (!keep.size) return;
  keep.forEach((g) => mapGroups.add(g));
  $$('.lg', mapLegend).forEach((b) => b.classList.toggle('on', mapGroups.has(b.dataset.g)));
  const ids = new Set(Object.values(MAP.byId).filter((n) => mapGroups.has(n.g)).map((n) => n.id));
  MAP.svg.classList.add('focus');
  Object.entries(MAP.nodeEls).forEach(([id, el]) => el.classList.toggle('hl', ids.has(id)));
  const hl = MAP.edgeEls.filter((e) => ids.has(e.a) || ids.has(e.b));
  hl.forEach((e) => { e.g.classList.add('hl'); MAP.nodeEls[e.a].classList.add('hl'); MAP.nodeEls[e.b].classList.add('hl'); });
  topLabels(hl);
  const order = Object.keys(MAP.M.groups).filter((g) => mapGroups.has(g));
  mapSide.innerHTML = `<span class="k">${order.length} group${order.length > 1 ? 's' : ''} selected</span>` + order.map((g) => {
    const [name, col] = MAP.M.groups[g];
    const names = Object.values(MAP.byId).filter((n) => n.g === g).map((n) => n.t);
    return `<div class="grp"><h5><i style="background:${col}"></i>${esc(name)}<small>${names.length}</small></h5><p class="map-empty">${names.map(esc).join(' · ')}</p></div>`;
  }).join('') + `<p class="map-empty">Click more groups above to add them, or click a group again to remove it. Their connections are highlighted on the map.</p>`;
  mapSide.append(h('button', { class: 'pbtn', onclick: () => { mapSelect(null); } }, 'Clear groups'));
}
function mapSelect(id, zoom) {
  if (!MAP) return;
  if (tourOn) tourEnd(true);
  const svg = MAP.svg;
  Object.values(MAP.nodeEls).forEach((el) => el.classList.remove('hl', 'sel'));
  MAP.edgeEls.forEach((e) => e.g.classList.remove('hl'));
  MAP.topLabs.replaceChildren();
  if (!id) {
    svg.classList.remove('focus');
    mapGroups.clear();
    $$('.lg', mapLegend).forEach((b) => b.classList.remove('on'));
    const isS = MAP.M === STAKE;
    if (MAP.M === MIND) { mapSide.innerHTML = `<span class="k">Mind map · final</span><h4>One problem in the middle, ten branches around it.</h4><p class="map-empty">Teal branches are themes, orange ones are sub-themes, and pale boxes are the inputs under them. Dashed lines show what supports what.</p><p class="map-empty"><b>Tap a branch</b> to follow it, or the legend chips above to see one or more themes together.</p><p class="map-empty">Try <b>Verification Process</b> or <b>Current Challenge</b>.</p>`; return; }
    mapSide.innerHTML = `<span class="k">${isS ? 'Stakeholder map' : 'Ecosystem map'}</span><h4>${isS ? 'Three rings around one goal: high quality AI outputs.' : 'The developer at the center of actors, tools, artifacts and processes.'}</h4><p class="map-empty">${isS ? 'The closer a role sits to the center, the more directly it shapes AI output. Engineers query it, QA checks it, and policy decides how it can be used.' : 'Four areas surround the developer: AI prompting and development, legal and compliance, product management, and design and research.'}</p><p class="map-empty"><b>Tap a node</b> to see who it connects to, or the legend chips above to see one or more groups together.</p><p class="map-empty">Try <b>${isS ? 'Quality Assurance' : 'Developer'}</b> or <b>${isS ? 'AI Company Policies' : 'Tickets'}</b>.</p>`;
    return;
  }
  const n = MAP.byId[id];
  svg.classList.add('focus');
  MAP.nodeEls[id].classList.add('hl', 'sel');
  const rel = MAP.edgeEls.filter((e) => e.a === id || e.b === id);
  rel.forEach((e) => { e.g.classList.add('hl'); MAP.nodeEls[e.a].classList.add('hl'); MAP.nodeEls[e.b].classList.add('hl'); });
  topLabels(rel);
  mapSide.innerHTML = `<span class="k">${esc(MAP.M.groups[n.g][0])}</span><h4>${esc(n.t)}</h4><p class="map-empty">${rel.length} connection${rel.length === 1 ? '' : 's'}</p>`;
  const list = h('div', { class: 'rel' });
  rel.forEach((e) => {
    const out = e.a === id, other = MAP.byId[out ? e.b : e.a];
    const b = h('button', {}, h('small', {}, (out ? '→ ' : '← ') + (e.lab || 'connects to')), other.t);
    b.addEventListener('click', () => mapSelect(other.id, true));
    list.append(b);
  });
  mapSide.append(list, h('button', { class: 'pbtn', onclick: () => { mapSelect(null); mapPZ.fit(); } }, 'Clear'));
  if (zoom) {
    const pts = [n, ...rel.map((e) => MAP.byId[e.a === id ? e.b : e.a])];
    const x0 = Math.min(...pts.map((p) => p.x - p.w / 2)), x1 = Math.max(...pts.map((p) => p.x + p.w / 2));
    const y0 = Math.min(...pts.map((p) => p.y - p.h / 2)), y1 = Math.max(...pts.map((p) => p.y + p.h / 2));
    mapPZ.focus(x0 - MAP.M.vb[0], y0 - MAP.M.vb[1], x1 - x0, y1 - y0, 900, 40);
  }
}
$('#mapOrig').addEventListener('click', () => { const [src, w, hh, t] = MAP.M.orig; openLB(src, w, hh, t); });

const JR = [
  { n: 'Receive Task', c: '#f2502a', obj: 'Understand the assigned task and what “done” looks like.', a: ['Receive the ticket/user story in Jira or Azure DevOps, with acceptance criteria attached.', 'Review the task’s scope and expected outcome.', 'Note priority based on sprint plan or business impact.'], tp: ['Desktop/Laptop', 'Jira (or an equivalent)', 'Gmail/Slack'], ac: ['Product Owner/Manager', 'Other Engineers/ Developers'], p: ['Task requirements can be unclear at assignment, making it hard to know what “done” looks like.', 'Priority isn’t always communicated clearly, so it’s unclear what to tackle first.'], g: ['Clear picture of what needs to be done, from the start.', 'Ticketing tools keep task history and context in one place.'], w: ['Neutral', 0], b: ['Neutral', 0] },
  { n: 'Understand Requirements', c: '#ff9a3c', obj: 'Clarify the acceptance criteria before writing any code.', a: ['Read the acceptance criteria and break down the expected functionality.', 'Mark anything unclear or ambiguous.', 'Clarify with the product owner, manager, or team lead if needed.'], tp: ['Desktop/Laptop', 'Jira / Azure DevOps', 'Team chat'], ac: ['Product Owner/Manager', 'Team Lead'], p: ['Ambiguous acceptance criteria make correctness hard to judge later.', 'Going back to the product owner or team lead for clarification adds delay.'], g: ['Acceptance criteria give a concrete standard to check against later.', 'Flagging ambiguity early avoids building the wrong thing.'], w: ['Neutral', -0.08], b: ['Straightforward', 0.26] },
  { n: 'Gather Context', c: '#ffc83d', dk: 1, obj: 'Collect the code, docs, and context the AI needs to be useful.', a: ['Check existing documentation / runbooks for the process.', 'Review relevant code and existing patterns tied to the task.', 'Identify dependencies and any data-sensitivity constraints.'], tp: ['Desktop/Laptop', 'VS Code (or other IDE)', 'Company codebase', 'Confluence / internal docs'], ac: ['Software Developer'], p: ['Missing code or task context leads to irrelevant AI output.', 'Existing documentation and runbooks are sometimes outdated or incomplete.'], g: ['Context gathered up front means the AI’s first output is more likely to be usable.'], w: ['Focused', 0.1], b: ['Tedious', -0.3] },
  { n: 'Prepare AI Input', c: '#6bd66f', dk: 1, obj: 'Package the task, criteria, and constraints into one clear prompt.', a: ['Give the AI the task, acceptance criteria, and gathered context.', 'Include relevant code, expected output, and known constraints.', 'Remove or generalize anything sensitive before sharing it.'], tp: ['Desktop/Laptop', 'VS Code (or other IDE)', 'AI Chat Interface'], ac: ['AI Agent', 'Software Developer'], p: ['Can’t paste proprietary or confidential data into non-enterprise AI tools; sanitizing context takes time.', 'Deciding how much context to include is important: too little and the output misses the mark.'], g: ['A well-structured, specific prompt produces a far more useful AI response.', 'Sanitizing proprietary data forces a cleaner, more precise problem statement.'], w: ['Engaged', 0.32], b: ['Repetitive', -0.34] },
  { n: 'Generate Code', c: '#5ed6cf', dk: 1, obj: 'Use AI to generate code that addresses the task.', a: ['AI generates code addressing the prompt.', 'Scan the first output for anything off.', 'Iterate on the prompt if the result misses the intent.'], tp: ['Desktop/Laptop', 'VS Code (or other IDE)', 'AI Chat Interface'], ac: ['AI Agent', 'Software Developer'], p: ['AI loses context in long sessions; vague prompts produce low-quality output.'], g: ['AI accelerates the first working draft of the code.', 'Iterating on the prompt is faster than rewriting code by hand.'], w: ['Encouraged', 0.8], b: ['Draining', -0.6], note: 'Biggest lift: the AI drafts the code instead of writing it by hand.' },
  { n: 'Verify Against Acceptance Criteria', c: '#3ba8f5', obj: 'Check the generated code against the acceptance criteria.', a: ['Compare the generated code against the acceptance criteria, line by line.', 'Run local tests / sample data to confirm behavior.', 'Cross-check with a second AI tool or a manual read-through when unsure.'], tp: ['Desktop/Laptop', 'VS Code (or other IDE)', 'AI Chat Interface', 'Local Test Environment'], ac: ['AI Agent', 'Software Developer'], p: ['Output can look correct but still contain wrong logic or syntax errors; it has to be checked line by line.', 'Cross-checking with a second AI tool or a manual read-through takes extra time beyond the first pass.'], g: ['Acceptance criteria give a clear, objective way to catch incorrect or incomplete output early.', 'Running local tests catches issues before anyone else sees the code.'], w: ['Cautious', -0.12], b: ['Assured', 0.17], note: 'Checking by hand felt better here than checking AI output.' },
  { n: 'Correct & Retest', c: '#8b5cf6', obj: 'Fix whatever doesn’t meet criteria, then re-verify it.', a: ['Identify exactly which criterion the output fails to meet.', 'Refine the prompt, add context, or manually correct the code.', 'Re-run tests to confirm the fix actually closes the gap.'], tp: ['Desktop/Laptop', 'VS Code (or other IDE)', 'AI Chat Interface', 'Test Environment'], ac: ['AI Agent', 'Software Developer'], p: ['Pinpointing exactly which criterion failed, then fixing it, costs real debugging and rework time.', 'Re-running tests after every fix adds another cycle before the code is ready again.'], g: ['Catching issues here avoids a failed peer review and a slower rework cycle later.'], w: ['Strained', -1.2], b: ['Frustrated', -1.43], note: 'The lowest point of the journey.' },
  { n: 'Send for Peer Review', c: '#ff4fb0', obj: 'Submit verified code for peer review with confidence.', a: ['Confirm the acceptance criteria is addressed.', 'Attach test results / validation evidence to the submission.', 'Open a pull request and send it for peer review.'], tp: ['Desktop/Laptop', 'Jira (or an equivalent)', 'Github'], ac: ['Software Developer', 'Peer Reviewer(s)'], p: ['Uncertainty about whether every criterion was really met can make developers hesitant to submit.'], g: ['Confidence that the code meets requirements before a reviewer ever sees it.', 'Attaching test and validation evidence speeds up the reviewer’s job too.'], w: ['Confident', 0.82], b: ['Relieved', 0.1] },
];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/* ---------- Ecosystem: "My focus" tour of the AI prompting & development quadrant */
const ECX = 3468, ECY = 2525, ECR = 1740;
const QUAD_IDS = ECO.nodes.filter(([id, , x, y]) => { const a = (Math.atan2(y - 2525, x - 3468) * 180) / Math.PI, d = Math.hypot(x - 3468, y - 2525); return id === '74699' || (a >= -137 && a <= -43 && d < 1740); }).map((n) => n[0]);
const TOUR = [
  { k: 'My focus', t: 'AI prompting & development', p: 'Of the four areas around the developer, my project sits in the top one: where the developer, the AI platforms and the code meet. Everything else is dimmed.', nodes: QUAD_IDS, edges: [], box: 'wedge' },
  { k: 'Step 1 of 4', t: 'The task goes in', p: 'A ticket carries the task, and its context, into the AI platform. The developer adds prompts on top. This is where the acceptance criteria enter, if anyone pastes them in.', nodes: ['74746', '74701', '74699', '74702'], edges: [['74746', '74701'], ['74699', '74701'], ['74746', '74702']] },
  { k: 'Step 2 of 4', t: 'The AI produces code', p: 'The platform consumes tokens, invokes skill repositories and can be interrupted by a kill switch. What comes out looks finished.', nodes: ['74701', '74801', '74734', '74751', '74754'], edges: [['74701', '74801'], ['74701', '74734'], ['74751', '74701'], ['74734', '74754']] },
  { k: 'Step 3 of 4', t: 'The developer checks it', p: 'Checking happens through unit tests, sandbox testing and the QA team: separate steps, after the code exists, and none of them tied to the task’s criteria by default.', nodes: ['74699', '74743', '74742', '74753'], edges: [['74699', '74743'], ['74743', '74742'], ['74699', '74753']] },
  { k: 'Step 4 of 4', t: 'The missing link', p: 'Feature specs sit outside this loop. Nothing connects what the AI produced back to the specs the task was written against. That gap is where SpecSight sits.', nodes: ['74701', '74768', '74699', '74746'], edges: [['74699', '74768']], gap: true },
];
let tourOn = false, tourI = 0, tourBusy = false;
const focusCard = $('#focusCard'), ecoBtn = $('#ecoFocus');
function addEcoExtras(map) {
  if (map.wedge) return;
  const P = (deg) => [ECX + ECR * Math.cos((deg * Math.PI) / 180), ECY + ECR * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = P(-135), [x2, y2] = P(-45);
  const wedge = s('path', { class: 'wedge', d: `M${ECX} ${ECY} L${x1} ${y1} A${ECR} ${ECR} 0 0 1 ${x2} ${y2} Z`, fill: 'rgba(107,76,230,.10)', stroke: '#6b4ce6', 'stroke-width': 12, 'stroke-dasharray': '40 26' });
  map.svg.insertBefore(wedge, map.svg.children[3]);
  const A = map.byId['74701'], B = map.byId['74768'];
  const gap = s('g', { class: 'gapl', opacity: 0, 'pointer-events': 'none' });
  const gp = s('path', { d: `M${A.x - 60} ${A.y + 150} C ${A.x - 420} ${A.y + 360} ${B.x - 380} ${B.y - 300} ${B.x - 100} ${B.y - 50}`, fill: 'none', stroke: '#ff8f7e', 'stroke-width': 14, 'stroke-dasharray': '34 22', 'stroke-linecap': 'round' });
  const lx = A.x - 470, ly = (A.y + B.y) / 2 + 10;
  const lab = s('g', {});
  lab.append(s('rect', { x: lx - 300, y: ly - 64, width: 600, height: 128, rx: 30, fill: '#15111f' }));
  lab.append(s('text', { x: lx, y: ly - 18, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 34, 'font-weight': 700, fill: '#86d4c2', 'font-family': 'JetBrains Mono, monospace', 'letter-spacing': 2 }, 'MISSING LINK'));
  lab.append(s('text', { x: lx, y: ly + 26, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 34, 'font-weight': 600, fill: '#fff', 'font-family': 'Inter, sans-serif' }, 'SpecSight checks output vs. specs'));
  gap.append(gp, lab);
  map.svg.append(gap);
  map.wedge = wedge; map.gap = gap; map.gapPath = gp;
}
function tourRender(i, first) {
  tourI = i;
  const st = TOUR[i], map = maps.eco;
  const svg = map.svg;
  Object.values(map.nodeEls).forEach((el) => el.classList.remove('hl', 'sel'));
  map.edgeEls.forEach((e) => e.g.classList.remove('hl'));
  svg.classList.add('focus', 'tour');
  const ids = new Set(st.nodes);
  ids.forEach((id) => map.nodeEls[id] && map.nodeEls[id].classList.add('hl'));
  const hl = map.edgeEls.filter((e) => st.edges.some(([a, b]) => (e.a === a && e.b === b)));
  if (i === 0) map.edgeEls.filter((e) => ids.has(e.a) && ids.has(e.b)).forEach((e) => e.g.classList.add('hl'));
  hl.forEach((e) => e.g.classList.add('hl'));
  topLabels([]);
  svg.classList.toggle('tour0', i === 0);
  const conn = hl.map((e) => `<li><b>${esc(map.byId[e.a].t.split(':')[0])}</b> → <b>${esc(map.byId[e.b].t.split(':')[0])}</b>${e.lab ? `<span>${esc(e.lab)}</span>` : ''}</li>`).join('');
  map.gap.style.transition = 'opacity .6s';
  map.gap.setAttribute('opacity', st.gap ? 1 : 0);
  if (st.gap && !reduce) { const L = 1400; map.gapPath.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1400, easing: 'cubic-bezier(.4,0,.2,1)' }); }
  focusCard.innerHTML = `<div class="k">${esc(st.k)}</div><h4>${esc(st.t)}</h4><p>${esc(st.p)}</p>${conn ? `<ul class="conn">${conn}</ul>` : ''}<div class="nav3"><button data-a="prev" ${i === 0 ? 'disabled style="opacity:.35"' : ''}>←</button><button class="pri" data-a="next">${i === TOUR.length - 1 ? 'Finish' : i === 0 ? 'Explore it →' : 'Next →'}</button><button data-a="exit">Exit</button><div class="pips">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
  $$('[data-a]', focusCard).forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.a;
    if (a === 'prev' && tourI > 0) tourRender(tourI - 1);
    else if (a === 'next') { if (tourI < TOUR.length - 1) tourRender(tourI + 1); else tourEnd(); }
    else if (a === 'exit') tourEnd();
  }));
  focusCard.classList.remove('hide');
  mapSide.classList.add('hide');
  if (!first) focusCard.animate([{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: reduce ? 1 : 420, easing: 'ease-out' });
  // camera: keep the subject clear of the card
  const vb = ECO.vb;
  let x0, y0, x1, y1;
  if (st.box === 'wedge') { x0 = ECX - ECR * 0.75; x1 = ECX + ECR * 0.75; y0 = ECY - ECR - 40; y1 = ECY + 120; }
  else {
    const pts = st.nodes.map((id) => map.byId[id]);
    x0 = Math.min(...pts.map((p) => p.x - p.w / 2)) - 60; x1 = Math.max(...pts.map((p) => p.x + p.w / 2)) + 60;
    y0 = Math.min(...pts.map((p) => p.y - p.h / 2)) - 60; y1 = Math.max(...pts.map((p) => p.y + p.h / 2)) + 60;
    if (st.gap) x0 -= 520;
  }
  let w = x1 - x0, hh = y1 - y0;
  tourBusy = true;
  mapPZ.focus(x0 - vb[0], y0 - vb[1], w, hh, reduce ? 1 : 1100, 24, () => { tourBusy = false; });
}
function tourStart() {
  if (!maps.eco || MAP !== maps.eco) return;
  tourOn = true;
  ecoBtn.classList.add('on');
  ecoBtn.textContent = '★ My focus · on';
  tourRender(0, true);
}
function tourEnd(silent) {
  if (!tourOn) return;
  tourOn = false;
  ecoBtn.classList.remove('on');
  ecoBtn.textContent = '★ My focus';
  focusCard.classList.add('hide');
  mapSide.classList.remove('hide');
  if (maps.eco) { maps.eco.svg.classList.remove('tour', 'tour0'); maps.eco.gap.setAttribute('opacity', 0); }
  if (!silent) { mapSelect(null); mapPZ.fit(); }
}
ecoBtn.addEventListener('click', () => (tourOn ? tourEnd() : tourStart()));

/* ---------- Journey map: her exact board, with a guided walk */
const JW = 2000, JH = 1599, JCX = [176, 396, 616, 836, 1056, 1276, 1496, 1716], JCW = 204;
let jPZ = null, jSel = -1, jWalk = false, jT = 0;
const jvC = $('#jvC'), jcap = $('#jcap'), jPlayB = $('#jPlay');
const jCols = [];
function buildJV() {
  if (jPZ) return;
  jvC.append(h('img', { src: 'assets/journey.webp', width: JW, height: JH, alt: 'Journey map: The Verify-Before-Review Developer', draggable: 'false' }));
  JCX.forEach((x, i) => {
    const d = h('div', { class: 'jcol-hit', style: `left:${x - 6}px;top:232px;width:${JCW + 12}px;height:1290px`, role: 'button', tabindex: 0, 'aria-label': JR[i].n });
    d.addEventListener('click', (e) => { e.stopPropagation(); jStop(); jPhase(jSel === i ? -1 : i); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jStop(); jPhase(jSel === i ? -1 : i); } });
    jvC.append(d);
    jCols.push(d);
  });
  jPZ = new PZ($('#jvVp'), jvC, JW, JH, { max: 8, pad: 10 });
  jPZ.onuser = () => jStop();
  jvC.addEventListener('click', (e) => { if (e.target === jvC || e.target.tagName === 'IMG') { jStop(); jPhase(-1, true); } });
}
function jIntro() { jcap.style.borderTop = ''; jcap.innerHTML = `<div class="k" style="color:var(--ac)">Journey map · final</div><h4>The Verify-Before-Review Developer</h4><p>Eight phases from receiving a task to sending it for peer review. Click a phase column to zoom into it, or press <b>Walk the journey</b>.</p>`; }
const dotC = (c) => `<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:6px"></i>`;
function jCaption(html, accent) {
  jcap.innerHTML = html;
  jcap.style.borderTop = accent ? `4px solid ${accent}` : '';
  jcap.classList.remove('hide');
  if (!reduce) jcap.animate([{ opacity: 0.3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
}
function jPhase(i, fit) {
  jSel = i;
  jCols.forEach((c, k) => c.classList.toggle('on', k === i));
  if (i < 0) { jIntro(); if (fit !== false) jPZ.fit(); return; }
  const p = JR[i];
  jCaption(`<div class="k" style="color:${p.c}">${dotC(p.c)}Phase ${String(i + 1).padStart(2, '0')} of 08</div><h4>${esc(p.n)}</h4><p>${esc(p.obj)}</p><div class="emo"><span>With AI: ${esc(p.w[0])}</span><span class="b">Before AI: ${esc(p.b[0])}</span></div><p style="margin-top:8px"><b style="color:var(--fail)">Pain:</b> ${esc(p.p[0])}</p>`, p.c);
  jScan(i);
}
let jScanT = 0;
function jScan(i) {
  clearTimeout(jScanT);
  const wide = jPZ.vw > 760, vw = jPZ.vw, vh = jPZ.vh;
  const k = jPZ.clampS(wide ? Math.min(1.05, Math.max(0.75, vh / 680)) : Math.min(1.6, (vw * 0.86) / JCW));
  const cx = JCX[i] + JCW / 2, sx = vw / 2;
  const top = { s: k, x: sx - cx * k, y: 10 - 222 * k };
  const bottom = { s: k, x: top.x, y: vh - (wide ? 10 : vh * 0.42) - 1525 * k };
  jPZ.user = true;
  jPZ.to(top, reduce ? 1 : 1000, () => { jScanT = setTimeout(() => { if (jSel === i) jPZ.to(bottom, reduce ? 1 : 3200); }, 500); });
}
function jEmotion() {
  jCols.forEach((c) => c.classList.remove('on'));
  jSel = -1;
  jCaption(`<div class="k" style="color:var(--ac)">The emotion curve</div><h4>Confidence drops right where checking happens.</h4><p>With AI, confidence climbs while the AI drafts the code, turns cautious at <b>Verify</b>, and hits its lowest point at <b>Correct &amp; Retest</b>. That dip is the moment SpecSight is built for.</p>`);
  const wide = jPZ.vw > 760;
  jPZ.focus(150, 790, 1820, 280, reduce ? 1 : 1100, 10);
}
const JSTEPS = [
  () => { jCols.forEach((c) => c.classList.remove('on')); jSel = -1; jCaption(`<div class="k" style="color:var(--ac)">Journey map · final</div><h4>The Verify-Before-Review Developer</h4><p>Eight phases from receiving a task to sending it for peer review, with the actions, touchpoints, emotions, pains and gains in each.</p>`); jPZ.fit(); return 3600; },
  ...JR.map((_, i) => () => { jPhase(i); return 5200; }),
  () => { jEmotion(); return 6000; },
];
function jStop() { clearTimeout(jScanT); if (!jWalk) return; jWalk = false; clearTimeout(jT); jPlayB.textContent = '▶ Walk the journey'; jPlayB.classList.remove('on'); }
function jRun(k) {
  if (!jWalk) return;
  if (k >= JSTEPS.length) { jStop(); jPhase(-1); return; }
  const ms = JSTEPS[k]();
  jT = setTimeout(() => jRun(k + 1), reduce ? ms * 1.5 : ms);
}
jPlayB.addEventListener('click', () => { if (jWalk) { jStop(); return; } jWalk = true; jPlayB.textContent = '■ Stop'; jPlayB.classList.add('on'); jRun(0); });
$('#jFit').addEventListener('click', () => { jStop(); jPhase(-1); });

/* ---------- Map list (left) and stage (right) */
const ROOMS = [['stake', 'Stakeholder map', 'Who shapes AI output', 'Phase 1'], ['eco', 'Ecosystem map', 'The developer’s world', 'Phase 1'], ['journey', 'Journey map', 'Ticket to peer review', 'Phase 2'], ['mind', 'Mind map', 'Narrowing the problem', 'Phase 2'], ['flow', 'User flow', 'Verifying before review', 'Phase 2']];
const mlist = $('#mlist');
let roomCur = null;
const roomBtns = ROOMS.map(([k, t, d, ph], i) => {
  const b = h('button', { class: 'mi', role: 'tab', 'aria-selected': 'false' }, h('i', {}, String(i + 1).padStart(2, '0')), h('b', {}, t), h('span', {}, d), h('small', {}, ph));
  b.addEventListener('click', () => showRoom(k));
  mlist.append(b);
  return b;
});
function showRoom(k) {
  if (k === roomCur) return;
  roomCur = k;
  roomBtns.forEach((b, i) => b.setAttribute('aria-selected', ROOMS[i][0] === k));
  const on = roomBtns[ROOMS.findIndex((r) => r[0] === k)];
  if (mlist.scrollWidth > mlist.clientWidth) mlist.scrollTo({ left: on.offsetLeft - 16, behavior: reduce ? 'auto' : 'smooth' });
  tourEnd(true);
  jStop();
  if (typeof flowStop === 'function') flowStop();
  $$('#stage .panel').forEach((p) => {
    const show = p.dataset.panel.split(' ').includes(k);
    if (show && !p.hidden && (k === 'stake' || k === 'eco' || k === 'mind')) { p.getAnimations().forEach((a) => a.cancel()); if (!reduce) p.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.22,.9,.24,1)' }); }
    p.hidden = !show;
  });
  ecoBtn.hidden = k !== 'eco';
  if (k === 'stake' || k === 'eco' || k === 'mind') { showMap(k); if (k === 'eco') addEcoExtras(maps.eco); }
  if (k === 'journey') { buildJV(); requestAnimationFrame(() => { jPZ.fit(false); jPhase(-1, false); }); }
  if (k === 'flow' && typeof flowPZ !== 'undefined') requestAnimationFrame(() => { if (!flowPZ.user) flowPZ.fit(false); });
}
const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
fontsReady.then(() => showRoom('stake'));

/* ======================================================= Flow */
const FN = [
  ['576', 'start', 386, 600, 415, 152, 'START · Entry 1', 'Task assigned', 1],
  ['577', 'proc', 1010, 564, 469, 224, 'Read the user story and acceptance criteria', 'Open the task in Azure DevOps/Jira and note what each criterion asks for', 1],
  ['578', 'dec', 1674, 517, 451, 318, 'Is every acceptance criterion clear and testable?', '', 1],
  ['579', 'proc', 2432, 564, 469, 224, 'Turn each acceptance criterion into a check', 'Write the expected result the code has to show', 1, 'SpecSight reads the task’s five specs and turns each one into tests.'],
  ['580', 'proc', 1665, 982, 469, 224, 'Clarify with the PO or team lead', 'Ask in refinement meetings or message them, then update the criterion', 1, 'Clarify a vague spec inside SpecSight while the other tests keep running.'],
  ['581', 'yes', 2238, 648, 54, 54, 'Yes', '', 1], ['582', 'no', 1872, 862, 54, 54, 'No', '', 1],
  ['585', 'proc', 368, 1552, 469, 224, 'Gather the code context', 'Find the affected files, existing patterns and related tickets', 2],
  ['586', 'dec', 955, 1513, 415, 307, 'Does the context include sensitive data?', '', 2],
  ['588', 'proc', 1631, 1552, 469, 224, 'Write the prompt', 'Task, acceptance criteria, relevant code, constraints and expected output', 2],
  ['589', 'proc', 2208, 1552, 469, 224, 'Generate the code with the AI agent', 'Run the prompt in Copilot, Claude or another agent and open the changes', 2, 'As soon as the agent is done, SpecSight offers “Verify 5 specs”.'],
  ['591', 'dec', 2807, 1511, 415, 307, 'Does the output address the whole task?', '', 2],
  ['593', 'proc', 3502, 1552, 469, 224, 'Refine the prompt', 'Add the missing context or a clearer instruction', 2],
  ['595', 'proc', 929, 1992, 469, 224, 'Redact sensitive data', 'Replace names, keys and customer data with placeholders', 2],
  ['598', 'no', 1457, 1636, 54, 54, 'No', '', 2], ['601', 'yes', 1135, 1863, 54, 54, 'Yes', '', 2], ['604', 'no', 3324, 1639, 54, 54, 'No', '', 2], ['607', 'yes', 2987, 1931, 54, 54, 'Yes', '', 2],
  ['611', 'start', 426, 2456, 415, 152, 'START · Entry 2', 'Reviewer feedback', 3],
  ['612', 'proc', 967, 2420, 469, 224, 'Review the edited or new code', 'Read the difference line by line and note any assumptions the AI made', 3, 'Highlights where it broke in the code, with a plain-language reason.'],
  ['614', 'proc', 1563, 2420, 469, 224, 'Run each test in the DEV environment', 'AI-suggested tests and edge cases; compare actual vs. expected', 3, 'Every test runs in the background in a sandboxed copy, with a recording.'],
  ['616', 'dec', 2185, 2378, 415, 307, 'Does every check pass?', '', 3],
  ['618', 'proc', 2843, 2420, 469, 224, 'Record the evidence for each acceptance criterion', 'Test results, screenshots and anything not tested', 3, 'The Proof Capsule keeps the evidence for every spec, including what wasn’t tested.'],
  ['619', 'proc', 2158, 2902, 469, 224, 'Find the cause and fix it', 'Fix it yourself, or re-prompt the AI with the failing check', 3, 'Fix by agent with the reason, or investigate in VS Code first and fix it yourself.'],
  ['622', 'yes', 2679, 2504, 55, 55, 'Yes', '', 3], ['625', 'no', 2365, 2729, 54, 54, 'No', '', 3],
  ['630', 'proc', 513, 3409, 469, 224, 'Open the pull request', 'Summarize the changes, the evidence for each criterion and known limits', 4, 'Create the pull request with the SpecSight summary already in it.'],
  ['631', 'proc', 1090, 3409, 469, 224, 'Request review from teammates', 'Share the pull request with the assigned reviewers', 4],
  ['633', 'end', 1685, 3445, 415, 152, 'END', 'Ready for peer review', 4],
];
const FE = [
  ['576', '577', 'h'], ['577', '578', 'h'], ['578', '581', 'h'], ['581', '579', 'h'], ['578', '582', 'v'], ['582', '580', 'v'], ['580', '577', 'L'], ['579', '585', 'v'],
  ['585', '586', 'h'], ['586', '598', 'h'], ['598', '588', 'h'], ['586', '601', 'v'], ['601', '595', 'v'], ['595', '588', 'L'], ['588', '589', 'h'], ['589', '591', 'h'],
  ['591', '604', 'h'], ['604', '593', 'h'], ['593', '589', 'U'], ['591', '607', 'v'], ['607', '612', 'v'],
  ['611', '612', 'h'], ['612', '614', 'h'], ['614', '616', 'h'], ['616', '622', 'h'], ['622', '618', 'h'], ['616', '625', 'v'], ['625', '619', 'v'], ['619', '614', 'L'], ['618', '630', 'v'],
  ['630', '631', 'h'], ['631', '633', 'h'],
];
const STAGES = [
  ['Stage 1', 'Understand the task and set up the checks', [340, 440, 3840, 800]],
  ['Stage 2', 'Write the prompt and generate the code', [340, 1330, 3840, 920]],
  ['Stage 3', 'Verify against the acceptance criteria', [340, 2310, 3840, 850]],
  ['Stage 4', 'Confirm readiness and send for peer review', [340, 3240, 3840, 470]],
];
const WALK = ['576', '577', '578', '581', '579', '585', '586', '598', '588', '589', '591', '607', '612', '614', '616', '625', '619', '614', '616', '622', '618', '630', '631', '633'];
const FVB = [300, 200, 3980, 3560];
const flowNodes = {};
const flowSvg = (function () {
  const [vx, vy, vw, vh] = FVB;
  const svg = s('svg', { viewBox: FVB.join(' '), width: vw, height: vh, role: 'img', 'aria-label': 'Interactive user flow' });
  svg.append(s('defs', {}, s('marker', { id: 'fa', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#4a4558' }))));
  const bg = s('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'transparent' });
  svg.append(bg);
  svg.append(s('rect', { x: 332, y: 246, width: 3897, height: 144, rx: 40, fill: '#e9e3ff' }), s('text', { x: 2280, y: 318, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 60, 'font-weight': 700, fill: '#1d1a26', 'font-family': 'Bricolage Grotesque, Inter, sans-serif' }, 'User flow: verifying AI-generated code before peer review'));
  STAGES.forEach(([k, t, r], i) => {
    svg.append(s('rect', { x: r[0], y: r[1] + 10, width: r[2], height: r[3] - 20, rx: 36, fill: i % 2 ? 'rgba(255,255,255,.55)' : 'rgba(233,227,255,.35)', stroke: '#e6e0f5', 'stroke-width': 3 }));
    svg.append(s('text', { x: r[0] + r[2] - 40, y: r[1] + 64, 'text-anchor': 'end', 'font-size': 36, 'font-weight': 700, fill: '#1d1a26', 'font-family': 'Inter, sans-serif' }, `${k}: ${t}`));
  });
  const by = {};
  FN.forEach((n) => (by[n[0]] = { id: n[0], k: n[1], x: n[2], y: n[3], w: n[4], h: n[5], t: n[6], d: n[7], st: n[8], ss: n[9] }));
  const cx = (n) => n.x + n.w / 2, cy = (n) => n.y + n.h / 2;
  const side = (n, sd) => sd === 'r' ? [n.x + n.w, cy(n)] : sd === 'l' ? [n.x, cy(n)] : sd === 't' ? [cx(n), n.y] : [cx(n), n.y + n.h];
  const eg = s('g');
  FE.forEach(([a, b, t]) => {
    const A = by[a], Bn = by[b];
    let d;
    if (t === 'h') {
      const fwd = cx(Bn) > cx(A);
      const [x1, y1] = side(A, fwd ? 'r' : 'l'), [x2, y2] = side(Bn, fwd ? 'l' : 'r');
      const mx = (x1 + x2) / 2;
      d = Math.abs(y1 - y2) < 4 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx} V${y2} H${x2}`;
    } else if (t === 'v') {
      const dn = cy(Bn) > cy(A);
      const [x1, y1] = side(A, dn ? 'b' : 't'), [x2, y2] = side(Bn, dn ? 't' : 'b');
      const my = Math.abs(y2 - y1) > 400 ? y2 - 90 : (y1 + y2) / 2;
      d = Math.abs(x1 - x2) < 4 ? `M${x1} ${y1} V${y2}` : `M${x1} ${y1} V${my} H${x2} V${y2}`;
    } else if (t === 'L') {
      const left = cx(Bn) < cx(A);
      const [x1, y1] = side(A, left ? 'l' : 'r');
      const up = cy(Bn) < cy(A);
      const [x2, y2] = side(Bn, up ? 'b' : 't');
      d = `M${x1} ${y1} H${x2} V${y2}`;
    } else if (t === 'U') {
      const [x1, y1] = side(A, 't'), [x2, y2] = side(Bn, 't');
      const yy = Math.min(y1, y2) - 70;
      d = `M${x1} ${y1} V${yy} H${x2} V${y2}`;
    }
    eg.append(s('path', { d, fill: 'none', stroke: '#4a4558', 'stroke-width': 5, 'marker-end': 'url(#fa)', 'stroke-linejoin': 'round' }));
  });
  svg.append(eg);
  const ng = s('g');
  Object.values(by).forEach((n) => {
    const g = s('g', { class: 'fn nd' + (n.ss ? ' ss' : ''), tabindex: n.k === 'yes' || n.k === 'no' ? null : 0, role: 'button', 'aria-label': n.t });
    const X = cx(n), Y = cy(n);
    if (n.k === 'start' || n.k === 'end') {
      g.append(s('rect', { class: 'shape', x: n.x, y: n.y, width: n.w, height: n.h, rx: 76, fill: '#f9a390', stroke: '#e5846f', 'stroke-width': 4 }));
      g.append(s('text', { x: X, y: Y - 26, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 26, 'font-weight': 700, fill: '#5a1f12', 'font-family': 'JetBrains Mono, monospace', 'letter-spacing': 2 }, n.t.toUpperCase()));
      g.append(s('text', { x: X, y: Y + 20, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 38, 'font-weight': 700, fill: '#1d1a26', 'font-family': 'Inter, sans-serif' }, n.d));
    } else if (n.k === 'proc') {
      g.append(s('rect', { class: 'shape', x: n.x, y: n.y, width: n.w, height: n.h, rx: 22, fill: '#b180a3', stroke: '#93648a', 'stroke-width': 4 }));
      const tl = wrap(n.t, 24), dl = wrap(n.d, 34);
      const tot = tl.length * 38 + 14 + dl.length * 31;
      let y0 = Y - tot / 2;
      const tt = s('text', { 'text-anchor': 'middle', 'font-family': 'Inter, sans-serif', fill: '#fff' });
      tl.forEach((l, i) => tt.append(s('tspan', { x: X, y: y0 + 30 + i * 38, 'font-size': 33, 'font-weight': 700 }, l)));
      y0 += tl.length * 38 + 14;
      dl.forEach((l, i) => tt.append(s('tspan', { x: X, y: y0 + 24 + i * 31, 'font-size': 25, 'fill-opacity': 0.88 }, l)));
      g.append(tt);
    } else if (n.k === 'dec') {
      g.append(s('polygon', { class: 'shape', points: `${X},${n.y} ${n.x + n.w},${Y} ${X},${n.y + n.h} ${n.x},${Y}`, fill: '#ccb5ff', stroke: '#a88ae8', 'stroke-width': 4 }));
      g.append(textBlock(X, Y, wrap(n.t, 17), 29, { fill: '#1d1a26', 'font-weight': 700, 'font-family': 'Inter, sans-serif' }));
    } else {
      g.append(s('circle', { class: 'shape', cx: X, cy: Y, r: n.w / 2 + 14, fill: '#ffdab7', stroke: '#e9b88a', 'stroke-width': 3 }));
      g.append(s('text', { x: X, y: Y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 24, 'font-weight': 700, fill: '#5a3a12', 'font-family': 'Inter, sans-serif' }, n.t));
    }
    if (n.ss) {
      const bx = n.x + n.w - 18, byy = n.y - 4;
      const b = s('g', { class: 'ssb', transform: `translate(${bx} ${byy})` });
      b.append(s('circle', { r: 46, fill: '#1d1a26', stroke: '#86d4c2', 'stroke-width': 6 }));
      b.append(s('path', { d: 'M-30 0 C -16 -20 16 -20 30 0 C 16 20 -16 20 -30 0 Z', fill: 'none', stroke: '#c4b5fd', 'stroke-width': 5 }));
      b.append(s('circle', { r: 10, fill: '#86d4c2' }));
      g.append(b);
    }
    if (n.k !== 'yes' && n.k !== 'no') {
      g.addEventListener('click', (e) => { e.stopPropagation(); flowStop(); flowFocusNode(n.id, true); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flowStop(); flowFocusNode(n.id, true); } });
    }
    ng.append(g);
    flowNodes[n.id] = { n, g };
  });
  svg.append(ng);
  svg.append(textBlock(1960, 3666, wrap('Reviewer feedback comes back through Entry 2 at the start of Stage 3, so the changes are checked the same way again.', 70), 26, { fill: '#4a4558', 'font-family': 'Inter, sans-serif', 'font-style': 'italic' }));
  bg.addEventListener('click', () => { flowStop(); flowCap(null); });
  return svg;
})();
$('#flowC').append(flowSvg);
const flowPZ = new PZ($('#flowVp'), $('#flowC'), FVB[2], FVB[3], { max: 10, pad: 14 });
const capEl = $('#flowCap');
const eyeGlyph = '<svg viewBox="0 0 100 64" aria-hidden="true"><path d="M6 32 C 28 4 72 4 94 32 C 72 58 28 58 6 32 Z" fill="none" stroke="#c4b5fd" stroke-width="7"/><circle cx="50" cy="32" r="13" fill="#86d4c2"/></svg>';
let ssMode = false;
function flowCap(id) {
  Object.values(flowNodes).forEach(({ g }) => g.classList.remove('cur'));
  if (!id) { capEl.innerHTML = `<div class="k">User flow</div><h4>Four stages, from task to peer review.</h4><p>Click any step to read it, press <b>Play the path</b> to walk the main route, or show where SpecSight steps in.</p>`; return; }
  const { n, g } = flowNodes[id];
  g.classList.add('cur');
  const kind = { start: 'Entry point', end: 'End', proc: 'Step', dec: 'Decision' }[n.k];
  capEl.innerHTML = `<div class="k">Stage ${n.st} · ${kind}</div><h4>${esc(n.k === 'start' || n.k === 'end' ? n.d : n.t)}</h4>${n.d && n.k === 'proc' ? `<p>${esc(n.d)}</p>` : ''}${n.ss ? `<div class="ss">${eyeGlyph}<span><b>SpecSight:</b> ${esc(n.ss)}</span></div>` : ''}`;
  
}
function flowFocusNode(id, zoom, dur = 950) {
  const { n } = flowNodes[id];
  flowCap(id);
  if (!zoom) return;
  const W = Math.max(1500, n.w * 3.2), H = Math.max(900, n.h * 3.4);
  const vpw = flowPZ.vw, shift = 0, vshift = 0;
  flowPZ.focus(n.x + n.w / 2 - W / 2 - FVB[0] + shift, n.y + n.h / 2 - H / 2 - FVB[1] + vshift, W, H, dur, 20);
}
const stBox = $('#flowStages');
const stBtns = STAGES.map(([k, t, r], i) => {
  const b = h('button', { class: 'pbtn', title: t }, k);
  b.addEventListener('click', () => { flowStop(); stBtns.forEach((x) => x.classList.toggle('on', x === b)); flowCap(null); flowPZ.focus(r[0] - FVB[0], r[1] - FVB[1], r[2], r[3], 1000, 14); });
  stBox.append(b);
  return b;
});
const allB = h('button', { class: 'pbtn' }, 'Whole flow');
allB.addEventListener('click', () => { flowStop(); stBtns.forEach((x) => x.classList.remove('on')); flowCap(null); flowPZ.fit(); });
stBox.prepend(allB);
let walkT = 0, walkI = 0, walking = false;
const playBtn = $('#flowPlay');
function flowStop() { if (!walking) return; walking = false; clearTimeout(walkT); playBtn.textContent = '▶ Play the path'; Object.values(flowNodes).forEach(({ g }) => g.classList.remove('walk')); }
function walkStep() {
  if (!walking) return;
  const id = WALK[walkI];
  Object.values(flowNodes).forEach(({ g }) => g.classList.remove('walk'));
  flowNodes[id].g.classList.add('walk');
  if (flowNodes[id].n.k === 'yes' || flowNodes[id].n.k === 'no') { const n = flowNodes[id].n; flowPZ.focus(n.x - 700 - FVB[0], n.y - 450 - FVB[1], 1400, 900, 700, 20); }
  else flowFocusNode(id, true, 800);
  walkI++;
  if (walkI >= WALK.length) { walkT = setTimeout(() => { flowStop(); flowPZ.fit(); flowCap(null); }, 2600); return; }
  walkT = setTimeout(walkStep, flowNodes[id].n.k === 'yes' || flowNodes[id].n.k === 'no' ? 1100 : 2100);
}
playBtn.addEventListener('click', () => { if (walking) { flowStop(); return; } walking = true; walkI = 0; playBtn.textContent = '■ Stop'; stBtns.forEach((x) => x.classList.remove('on')); walkStep(); });
flowPZ.onuser = () => flowStop();
$('#flowSS').addEventListener('click', (e) => {
  ssMode = !ssMode;
  flowSvg.classList.toggle('ssmode', ssMode);
  e.currentTarget.classList.toggle('on', ssMode);
  if (ssMode) { flowStop(); flowPZ.fit(); capEl.innerHTML = `<div class="k">Where SpecSight steps in</div><h4>8 of the steps</h4><p>Steps with the eye badge are the ones SpecSight takes over or speeds up. Tap one to see how.</p>`;  }
  else flowCap(null);
});


/* ======================================================= Sketch-to-screen studio */
const STEPS = [
  { v: 'Version 1', k: 's1', t: 'Sketches' }, { v: 'Version 1', k: 'l1', t: 'Low fidelity' }, { v: 'Version 1', k: 'm1', t: 'Mid fidelity' }, { v: 'Version 1', k: 'h1', t: 'High fidelity' },
  { v: 'Usability test', k: 'turn', t: 'What testing changed' },
  { v: 'Version 2', k: 's2', t: 'Sketches' }, { v: 'Version 2', k: 'l2', t: 'Low fidelity' }, { v: 'Version 2', k: 'm2', t: 'Mid fidelity' }, { v: 'Version 2', k: 'h2', t: 'High fidelity' },
  { v: 'Final', k: 'fi', t: 'SpecSight' },
];
const DARKSETS = new Set(['h1', 'h2', 'fi']);
const AUTO_MS = 4200, TURN_MS = 9000, IDLE_MS = 9000;
let SCR = null, stI = 0, scI = 0, stView = 'one', stLast = -1e9, stT0 = performance.now(), stIn = false, stHeld = false;
const screenEl = $('#screen'), film = $('#film'), sAll = $('#sAll'), turnEl = $('#turn'), sOne = $('#sOne'), tlEl = $('#tl');
const scrSrc = (it) => 'assets/screens/' + it.f;
const stList = () => (STEPS[stI].k === 'turn' ? [] : SCR[STEPS[stI].k]);
function stUser() { stLast = performance.now(); stT0 = performance.now(); }
const tlBtns = [];
let lastV = '';
STEPS.forEach((st, i) => {
  if (st.v !== lastV && st.k !== 'turn') { tlEl.append(h('div', { class: 'tl-v' }, st.v)); lastV = st.v; }
  if (st.k === 'turn') lastV = '';
  const b = h('button', { class: 'tls' + (st.k === 'turn' ? ' test' : '') + (st.k === 'fi' ? ' fin' : '') }, h('i'), h('span', {}, st.k === 'turn' ? 'Usability test' : st.t), h('small', {}, ''));
  b.addEventListener('click', () => { stUser(); stGo(i, 0, 1); });
  tlEl.append(b);
  tlBtns.push(b);
});
function stGo(i, k = 0, dir = 1) {
  const changed = i !== stI || !film.childElementCount;
  stI = (i + STEPS.length) % STEPS.length;
  const st = STEPS[stI];
  tlBtns.forEach((b, j) => { b.classList.toggle('on', j === stI); b.classList.toggle('done', j < stI); });
  const on = tlBtns[stI];
  if (tlEl.scrollWidth > tlEl.clientWidth + 4) tlEl.scrollTo({ left: on.offsetLeft - tlEl.clientWidth / 2 + on.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  if (st.k === 'turn') {
    $('#sVer').textContent = 'Usability test · between versions';
    $('#sCnt').textContent = '';
    sOne.hidden = true; sAll.hidden = true; turnEl.hidden = false;
    $('#sView').style.visibility = 'hidden';
    turnEl.classList.remove('play');
    void turnEl.offsetWidth;
    requestAnimationFrame(() => turnEl.classList.add('play'));
    countDown();
    stT0 = performance.now();
    return;
  }
  turnEl.hidden = true;
  $('#sView').style.visibility = '';
  sOne.hidden = stView !== 'one'; sAll.hidden = stView !== 'all';
  if (changed) {
    const list = stList();
    screenEl.classList.toggle('dark', DARKSETS.has(st.k));
    film.replaceChildren(...list.map((it, j) => { const b = h('button', { class: 'fm', 'aria-label': `${it.n} ${it.t}` }, h('img', { src: scrSrc(it), alt: '', loading: 'lazy' }), h('i')); b.addEventListener('click', () => { stUser(); stShow(j, j > scI ? 1 : -1); }); return b; }));
    sAll.replaceChildren(...list.map((it, j) => { const b = h('button', { class: 'sg', style: `animation-delay:${Math.min(j, 16) * 30}ms` }, h('img', { src: scrSrc(it), alt: it.t, loading: 'lazy' }), h('div', {}, h('small', {}, `${it.n}`), it.t)); b.addEventListener('click', () => { stUser(); stSetView('one'); stShow(j, 1, true); }); return b; }));
  }
  stShow(k, dir, true);
}
function countDown() {
  const el = $('#tNew');
  if (reduce) { el.textContent = '17'; return; }
  const t0 = performance.now();
  const tick = (now) => { const p = Math.min(1, (now - t0 - 900) / 1100); const v = Math.round(28 - 11 * Math.max(0, ease(Math.max(0, p)))); el.textContent = v; if (p < 1 && !turnEl.hidden) requestAnimationFrame(tick); };
  el.textContent = '28';
  requestAnimationFrame(tick);
}
function stShow(k, dir = 1, force) {
  const list = stList();
  if (!list.length) return;
  k = (k + list.length) % list.length;
  if (k === scI && !force && screenEl.querySelector('img')) return;
  scI = k;
  const it = list[k], st = STEPS[stI];
  const old = $$('img', screenEl);
  const im = h('img', { src: scrSrc(it), alt: `${st.v}, ${st.t}: ${it.t}`, class: 'in', draggable: 'false' });
  screenEl.append(im);
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => im.classList.remove('in')));
  if (im.complete) go(); else { im.onload = go; im.onerror = go; }
  old.forEach((o) => { o.classList.add('out'); setTimeout(() => o.remove(), 850); });
  $('#sVer').textContent = `${st.v} · ${st.t}`;
  $('#sCnt').textContent = `${String(k + 1).padStart(2, '0')} / ${list.length}`;
  tlBtns[stI].querySelector('small').textContent = `${k + 1}/${list.length}`;
  tlBtns.forEach((b, j) => { if (j !== stI && STEPS[j].k !== 'turn') b.querySelector('small').textContent = SCR[STEPS[j].k].length; });
  $('#sNum').textContent = String(k + 1).padStart(2, '0');
  $('#sTitle').textContent = it.t;
  $('#sDesc').textContent = it.d || (st.k.startsWith('s') ? 'Hand-drawn sketch.' : '');
  const cap = $('#scap > div');
  cap.classList.remove('anim'); void cap.offsetWidth; cap.classList.add('anim');
  $$('.fm', film).forEach((b, j) => b.classList.toggle('on', j === k));
  const t = film.children[k];
  if (t) film.scrollTo({ left: t.offsetLeft - film.clientWidth / 2 + t.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  const nx = list[(k + 1) % list.length];
  if (nx) { const p = new Image(); p.src = scrSrc(nx); }
  stT0 = performance.now();
}
function stStep(d) {
  const st = STEPS[stI];
  if (st.k === 'turn') { d > 0 ? stGo(stI + 1, 0, 1) : stGo(stI - 1, SCR[STEPS[stI - 1].k].length - 1, -1); return; }
  const list = stList();
  if (scI + d >= list.length) stGo(stI + 1, 0, 1);
  else if (scI + d < 0) { const pi = (stI - 1 + STEPS.length) % STEPS.length; stGo(pi, STEPS[pi].k === 'turn' ? 0 : SCR[STEPS[pi].k].length - 1, -1); }
  else stShow(scI + d, d);
}
function stSetView(v) {
  stView = v;
  $$('#sView button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (STEPS[stI].k === 'turn') return;
  sOne.hidden = v !== 'one';
  sAll.hidden = v !== 'all';
}
$$('#sView button').forEach((b) => b.addEventListener('click', () => { stUser(); stSetView(b.dataset.v); }));
$('#sPrev').addEventListener('click', () => { stUser(); stStep(-1); });
$('#sNext').addEventListener('click', () => { stUser(); stStep(1); });
function stHold(v) { stHeld = v; screenEl.classList.toggle('hold', v); stT0 = performance.now(); }
screenEl.addEventListener('click', () => { stHold(!stHeld); if (!stHeld) stLast = -1e9; });
screenEl.addEventListener('dblclick', () => {
  stHold(true);
  const st = STEPS[stI], list = stList();
  openLB(scrSrc(list[scI]), list[scI].w || 1600, list[scI].h || 1000, `${st.v} · ${st.t} · ${list[scI].t}`, { list: list.map((it) => [scrSrc(it), it.w || 1600, it.h || 1000, `${st.v} · ${st.t} · ${it.t}`]), i: scI });
});
let stSw = null;
screenEl.addEventListener('touchstart', (e) => { stSw = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
screenEl.addEventListener('touchend', (e) => { if (!stSw) return; const dx = e.changedTouches[0].clientX - stSw[0], dy = e.changedTouches[0].clientY - stSw[1]; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { e.preventDefault(); stUser(); stStep(dx < 0 ? 1 : -1); } stSw = null; });
new IntersectionObserver(([en]) => { stIn = en.isIntersecting; stT0 = performance.now(); }, { threshold: 0.35 }).observe($('#sbox'));
function stTick(now) {
  const isTurn = STEPS[stI].k === 'turn';
  const can = SCR && !stHeld && stIn && (stView === 'one' || isTurn) && !$('#lb').classList.contains('open') && now - stLast > IDLE_MS && !reduce;
  const bar = !isTurn && film.children[scI] ? film.children[scI].querySelector('i') : null;
  if (!can) { if (bar) bar.style.transform = 'scaleX(0)'; stT0 = now; }
  else {
    const p = (now - stT0) / (isTurn ? TURN_MS : AUTO_MS);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, p)})`;
    if (p >= 1) stStep(1);
  }
  requestAnimationFrame(stTick);
}
fetch('screens.json').then((r) => r.json()).then((d) => { SCR = d; tlBtns.forEach((b, j) => { if (STEPS[j].k !== 'turn') b.querySelector('small').textContent = SCR[STEPS[j].k].length; else b.querySelector('small').textContent = '28→17'; }); stGo(0, 0, 1); requestAnimationFrame(stTick); }).catch(() => { $('#sTitle').textContent = 'Screens could not load. Refresh the page to try again.'; });

/* ======================================================= Usability testing: what testers said */
const AV = { P1: ['#d9497a', 'Participant 1'], P2: ['#2f7fd1', 'Participant 2'], P3: ['#d9822b', 'Participant 3'], IN: ['#8a6d12', 'Course instructor'] };
const UF = [
  ['h', 'Actions don’t look like actions', [['P1', '“Mark for clarification” doesn’t look clickable. It doesn’t read as a button.'], ['P2', 'Make “Mark for clarification” a real button.'], ['P2', '“Add a criteria” is hard to see. Make it more prominent.'], ['IN', 'Purple button with white text isn’t accessible enough. Check the contrast.']], 'Clarify Spec 3, Fix by agent and Update Spec 3 are now full buttons with strong contrast.'],
  ['h', 'Too many steps', [['P2', 'Reduce clicks. Don’t split one action into several steps.'], ['P3', 'Too many steps.'], ['P1', 'Too many clicks to reach the final page.'], ['P3', 'Run the test cases in the background, and let the user open and interact with any one of them only if they want to.']], 'One click on Verify runs every test in the background. Open one only if you want to. The flow went from 28 screens to 17.'],
  ['h', 'I lose track of where I am', [['P2', 'Where does the process end? Give an overview of what I’m doing.'], ['P3', 'The going back button is hard to see.'], ['P1', 'Not every step is clickable, and you can’t go back in some places.'], ['P2', 'Too many things to do before the end. How do I get back to the editor?']], '“Back · VS Code” is always in the top bar, next to a live status line: 3 of 5 specs verified.'],
  ['h', 'Colours don’t carry one meaning', [['IN', 'Each colour should mean one thing. Don’t reuse a colour for different things.'], ['P2', 'Give every colour a reason; check the colour hierarchy.'], ['P2', 'Colour-code with a legend.'], ['IN', 'Grey text is hard to see.']], 'Mint passed, coral broke, amber needs you. One meaning each, with a legend on the full map.'],
  ['m', 'Too much on screen', [['P1', 'Too much information on some screens.'], ['P3', 'Too much text everywhere.'], ['P2', 'Put what needs attention at the top, so changes are noticed.'], ['P1', 'Information hierarchy needs work.']], 'Each screen leads with the one thing that needs you: “Needs a fix” or “Needs clarification”.'],
  ['m', 'Labels don’t match how developers think', [['P1', 'The abbreviation “AC” for Acceptance Criteria isn’t obvious. Consider other wording, maybe “Spec”.'], ['P1', 'Unclear whether a scenario is a user scenario or a test case for the code.'], ['P2', 'Keep the wording simple.']], 'One word, “Spec”, everywhere. Each spec has a one-line meaning on the lens.'],
  ['m', 'Let me choose AI or my own fix', [['P2', 'Show the AI suggestion first, then a “Fix with agent” button. Small fixes can be done by hand.'], ['P1', 'The “Edit code manually” button may not be needed.'], ['P1', 'Hard to see how the task relates to the specific code.']], '“Fix by agent” or “Investigate in VS Code first”, with the reason for the fix shown first.'],
  ['k', 'What worked', [['P3', 'Liked the code highlights. They are easy to understand.'], ['P3', 'The summary is good: it explains what happened and what changed.'], ['P2', 'Liked the small overview of the whole code showing where the error is.'], ['P1', 'The code indications are good and easy to understand.']], 'Kept and sharpened: “Where it broke” highlights, test recordings and the Proof Capsule summary.'],
];
const PRC = { h: ['High priority', 'var(--fail-hi)'], m: ['Medium priority', 'var(--wait-hi)'], k: ['Keep', 'var(--pass-hi)'] };
const ufList = $('#ufList'), ufBody = $('#ufBody');
const ufBtns = UF.map(([pr, t, c], i) => {
  const b = h('button', { class: 'uf', role: 'tab', 'aria-selected': 'false' }, h('i', { style: `background:${PRC[pr][1]}` }), h('span', {}, t), h('small', {}, c.length));
  b.addEventListener('click', () => ufShow(i));
  ufList.append(b);
  return b;
});
function ufShow(i) {
  const [pr, t, c, now] = UF[i];
  ufBtns.forEach((b, k) => b.setAttribute('aria-selected', k === i));
  ufBody.innerHTML = `<span class="pr ${pr}">${PRC[pr][0]}</span><h3>${esc(t)}</h3><div class="bubbles">${c.map(([w, q], k) => `<div class="bub" style="animation-delay:${k * 90}ms"><span class="av" style="background:${AV[w][0]}">${w}</span><div class="tx"><small>${AV[w][1]}</small>${esc(q)}</div></div>`).join('')}</div><div class="uf-change" style="animation-delay:${c.length * 90 + 120}ms">${EYEG}<div><div class="k">${pr === 'k' ? 'Kept in SpecSight' : 'What changed in SpecSight'}</div><p>${esc(now)}</p></div></div>`;
  const on = ufBtns[i];
  if (ufList.scrollWidth > ufList.clientWidth + 4) ufList.scrollTo({ left: on.offsetLeft - 12, behavior: reduce ? 'auto' : 'smooth' });
}
ufShow(0);
new IntersectionObserver(([en], o) => {
  if (!en.isIntersecting) return;
  o.disconnect();
  setTimeout(() => { $('#utW').style.width = (22 / 34) * 100 + '%'; $('#utS').style.width = (12 / 34) * 100 + '%'; }, 200);
  const el = $('#utNum');
  if (reduce) return;
  const t0 = performance.now();
  const tick = (now) => { const p = Math.min(1, (now - t0) / 1300); el.textContent = Math.round(34 * ease(p)); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}, { threshold: 0.3 }).observe($('#utStats'));

/* ======================================================= Why an eye: anatomy + states */
const labEye = new Eye($('#labEye'), { mood: 'idle', statuses: ['pass', 'fail', 'wait', 'idle', 'pass'] });
const eyeDiag = $('#eyeDiag'), leaders = $('#leaders');
const LABS = { lid: $('.lab[data-c="lid"]', eyeDiag), iris: $('.lab[data-c="iris"]', eyeDiag), pupil: $('.lab[data-c="pupil"]', eyeDiag), lower: $('.lab[data-c="lower"]', eyeDiag) };
// anchor points in the eye's own viewBox (-4 -14 108 86)
const anchor = (c) => {
  const e = labEye.cur, cy = 32, o = e.o, sm = e.s;
  const ix = 50 + e.lx * 15, iy = cy + e.ly * 7 - sm * 4;
  if (c === 'lid') return [36, cy - 30 * o * 0.78 + e.tilt * 3];
  if (c === 'iris') return [ix + 12.5, iy - 9];
  if (c === 'pupil') return [ix + 3, iy + 4];
  return [40, cy + (24 * o * (1 - sm) - 15 * sm * Math.min(1, o * 1.6)) * 0.74];
};
const LPOS = { lid: [0, -0.38], iris: [1, -0.3], pupil: [1, 0.34], lower: [0, 0.42] };
const lpaths = {};
Object.keys(LABS).forEach((c) => { const g = s('g'); lpaths[c] = { p: s('path', { fill: 'none', stroke: 'rgba(196,181,253,.55)', 'stroke-width': 1.3 }), d: s('circle', { r: 3.4, fill: '#c4b5fd' }), d2: s('circle', { r: 2.4, fill: '#c4b5fd' }) }; g.append(lpaths[c].p, lpaths[c].d, lpaths[c].d2); leaders.append(g); });
function layoutLabels() {
  const host = $('#labEye svg');
  if (!host) return;
  const dr = eyeDiag.getBoundingClientRect(), er = host.getBoundingClientRect();
  const midY = er.top - dr.top + er.height / 2;
  Object.entries(LABS).forEach(([c, el]) => {
    const [side, oy] = LPOS[c];
    el.style.top = Math.max(0, midY + oy * er.height * 1.25 - el.offsetHeight / 2) + 'px';
    el.style.left = side ? '' : '0';
    el.style.right = side ? '0' : '';
  });
}
function drawLeaders() {
  const host = $('#labEye svg');
  if (!host || getComputedStyle(leaders).display === 'none') return;
  const dr = eyeDiag.getBoundingClientRect(), er = host.getBoundingClientRect();
  const kx = er.width / 108, ky = er.height / 86;
  Object.entries(LABS).forEach(([c, el]) => {
    const [ax, ay] = anchor(c);
    const px = er.left - dr.left + (ax + 4) * kx, py = er.top - dr.top + (ay + 14) * ky;
    const lr = el.getBoundingClientRect();
    const side = LPOS[c][0];
    const lx = side ? lr.left - dr.left - 10 : lr.right - dr.left + 10, ly = lr.top - dr.top + 10;
    const ex = side ? Math.max(px + 16, lx - 26) : Math.min(px - 16, lx + 26);
    const { p, d, d2 } = lpaths[c];
    p.setAttribute('d', `M${lx} ${ly} H${ex} L${px} ${py}`);
    d.setAttribute('cx', px); d.setAttribute('cy', py);
    d2.setAttribute('cx', lx); d2.setAttribute('cy', ly);
  });
}
let eyeVis = false;
new IntersectionObserver(([en]) => { eyeVis = en.isIntersecting; if (eyeVis) { layoutLabels(); (function lp() { if (!eyeVis) return; drawLeaders(); requestAnimationFrame(lp); })(); } }).observe(eyeDiag);
addEventListener('resize', layoutLabels);
fontsReady.then(layoutLabels);
const ESTATES = [
  ['squint', 'Reading', 'Reading the specs', ['idle', 'idle', 'idle', 'idle', 'idle'], 'lid'],
  ['focus', 'Testing', 'Running each test', ['pass', 'run', 'run', 'idle', 'idle'], 'iris'],
  ['curious', 'Needs you', 'A spec is unclear', ['pass', 'pass', 'wait', 'run', 'idle'], 'iris'],
  ['worried', 'Broke', 'Something failed', ['pass', 'fail', 'wait', 'fail', 'pass'], 'iris'],
  ['happy', 'Verified', 'All specs pass', ['pass', 'pass', 'pass', 'pass', 'pass'], 'lower'],
];
let esI = -1, esUser = 0, esIn = false;
const esBtns = ESTATES.map(([m, t, d, st], i) => {
  const mini = h('div', { class: 'mini' });
  const b = h('button', { class: 'st', 'aria-pressed': 'false' }, mini, h('b', {}, t), h('small', {}, d));
  new Eye(mini, { mood: m, statuses: st });
  b.addEventListener('click', () => { esUser = performance.now(); esSet(i); });
  $('#states').append(b);
  return b;
});
function esSet(i) {
  esI = i;
  const [m, , , st, hotC] = ESTATES[i];
  labEye.setMood(m); labEye.setStatuses(st);
  esBtns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', k === i); });
  Object.entries(LABS).forEach(([c, el]) => el.classList.toggle('hot', c === hotC));
}
new IntersectionObserver(([en]) => { esIn = en.isIntersecting; }, { threshold: 0.4 }).observe($('.eyebox'));
setInterval(() => { if (esIn && performance.now() - esUser > 12000 && !reduce) esSet((esI + 1) % ESTATES.length); }, 3200);

/* ======================================================= Features player: one video, always in step with the list */
const FEAT = [
  ['verify', 'Verify in one click', 'When the agent says it is done, SpecSight offers to check its work against the task’s five specs. One click reads the specs, opens the lens and starts testing.', 'Why', 'Everyone already checks AI work. SpecSight makes the check the next step instead of a separate chore.'],
  ['clarify', 'Clarify a vague spec while tests run', 'Spec 3 was ambiguous. SpecSight shows what it found, you add the missing context, and only that spec re-tests. Nothing waits.', 'Why', 'Unclear criteria are where misreadings start, and testers asked for tests to keep running in the background.'],
  ['recording', 'See exactly what broke', 'Every test is recorded in a sandboxed copy of the app. Step through a broken test to see the moment the result went wrong.', 'Why', 'Reviewers and QA ask how it was tested. The recording answers before they ask.'],
  ['fix', 'Fix by agent, with the reason', 'The suggested fix says which specs it closes and why. Send it to the agent, and the broken specs re-test on their own until all five pass.', 'Why', 'Testers wanted to see the suggestion first. Or choose “Investigate in VS Code first” and fix it yourself.'],
  ['fullmap', 'The full map', 'Zoom out to every spec and every test in one view, then jump straight to the code in VS Code.', 'Why', 'Testers lost track of where they were. The map is the overview they asked for, with a legend for every colour.'],
  ['mine', 'Try your own test case', 'Write a case in plain words, or pick from options. SpecSight runs it like the others, and you can add it to the task’s tests.', 'Why', 'The same requirement gets read differently. Your own case covers what the specs missed.'],
  ['summary', 'Proof Capsule and pull request', 'A summary of every spec, test and fix, including what was not tested. Export it, or create the pull request with it attached.', 'Why', 'Evidence matters at handoff, and the summary was what testers liked most.'],
];
const pv = $('#pv'), pLabel = $('#pLabel'), flist = $('#flist');
pv.muted = true;
let fI = -1, fTok = 0, fIn = false;
const fItems = FEAT.map(([k, t, d, wk, wd], i) => {
  const b = h('button', { class: 'fit', 'aria-pressed': 'false' }, h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), h('b', {}, t), h('div', { class: 'more' }, h('div', {}, h('p', {}, d), h('div', { class: 'why', html: `<b>${esc(wk)}</b>${esc(wd)}` }))), h('i', { class: 'bar2' }));
  b.addEventListener('click', () => fSet(i, true));
  flist.append(b);
  return b;
});
function fSet(i, user) {
  i = (i + FEAT.length) % FEAT.length;
  if (i === fI && !user) return;
  fI = i;
  const tok = ++fTok, [key, t] = FEAT[i];
  fItems.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', k === i); b.querySelector('.bar2').style.transform = 'scaleX(0)'; });
  pLabel.textContent = `SpecSight · ${t}`;
  pv.classList.add('fade');
  pv.pause();
  setTimeout(() => {
    if (tok !== fTok) return;
    pv.poster = `assets/clips/${key}-poster.jpg`;
    pv.src = `assets/clips/${key}.mp4`;
    pv.load();
    const ready = () => {
      if (tok !== fTok) return;
      pv.classList.remove('fade');
      if (fIn) { const p = pv.play(); p && p.catch(() => {}); }
    };
    pv.addEventListener('loadeddata', ready, { once: true });
  }, reduce ? 0 : 260);
  if (user && innerWidth < 960) { const f = $('.pframe'); if (f.getBoundingClientRect().top < 0) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
pv.addEventListener('timeupdate', () => { if (fI >= 0 && pv.duration) fItems[fI].querySelector('.bar2').style.transform = `scaleX(${pv.currentTime / pv.duration})`; });
pv.addEventListener('ended', () => fSet(fI + 1));
new IntersectionObserver(([en]) => {
  fIn = en.isIntersecting;
  if (fIn) { if (fI < 0) fSet(0); else if (!pv.classList.contains('fade')) { const p = pv.play(); p && p.catch(() => {}); } }
  else pv.pause();
}, { threshold: 0.3 }).observe($('.player'));

/* ======================================================= Demo */
$('#demoStart').addEventListener('click', () => {
  const f = h('iframe', { src: 'demo.html', title: 'SpecSight working prototype', allow: 'clipboard-write', loading: 'eager' });
  $('#demoFrame').append(f);
  const c = $('#demoCover');
  c.style.opacity = 0;
  setTimeout(() => c.remove(), 400);
  f.addEventListener('load', () => { try { f.focus(); } catch (e) {} });
});

/* ======================================================= Lightbox */
const lb = $('#lb'), lbC = $('#lbC');
let lbPZ = null, lbReturn = null, lbList = null, lbI = 0;
function lbLoad(src, w, hh, title) {
  $('#lbTitle').textContent = title;
  const im = new Image(); im.src = src; im.width = w; im.height = hh; im.alt = title;
  lbC.replaceChildren(im);
  requestAnimationFrame(() => {
    if (!lbPZ) { lbPZ = new PZ($('#lbVp'), lbC, w, hh, { max: 10 }); $$('.lb-bar [data-z]').forEach((b) => b.addEventListener('click', () => lbPZ.tool(b.dataset.z))); }
    else { lbPZ.resize(w, hh); lbPZ.fit(false); }
  });
}
function openLB(src, w, hh, title, opt) {
  if (!lb.classList.contains('open')) lbReturn = document.activeElement;
  lbList = opt ? opt.list : null;
  lbI = opt ? opt.i : 0;
  $('#lbPrev').hidden = $('#lbNext').hidden = !lbList;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  lbLoad(src, w, hh, title);
  $('#lbClose').focus();
}
function lbStep(d) { if (!lbList) return; lbI = (lbI + d + lbList.length) % lbList.length; lbLoad(...lbList[lbI]); }
$('#lbPrev').addEventListener('click', () => lbStep(-1));
$('#lbNext').addEventListener('click', () => lbStep(1));
function closeLB() {
  lb.classList.remove('open');
  document.body.style.overflow = '';
  if (lbList && lbI !== scI) stShow(lbI, lbI > scI ? 1 : -1);
  lbList = null;
  lbReturn && lbReturn.focus && lbReturn.focus({ preventScroll: true });
}
$('#lbClose').addEventListener('click', closeLB);

flowCap(null);
onScroll();
})();
