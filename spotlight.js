/* Ceylon FC — pointer spotlight.
   Adds a soft light that follows the mouse across cards and panels.
   Paste it once, just before </body>. It does nothing on touch screens,
   and the CSS still looks good without it. */
(() => {
  const SEL = '.card,.panel,.qual-panel,.gm-card,.ko-card,.rank-row,.table-wrap,.news-card,.player-card,' +
              '.predict-card,.staff-card,.sponsor-card,.stat-box,.fixture-row,.result-row,.strip-match,' +
              '.power-row,.leader-row,.motm-card,.gallery-item,.match-row,.roster-row,.hall-card,.honour-stat,.spotlight-card';
  if (matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let frame = 0, lastEvent = null;
  document.addEventListener('pointermove', (e) => {
    lastEvent = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const target = lastEvent.target;
      if (!target || !target.closest) return;
      // update the card under the pointer and every surface around it
      for (let el = target.closest(SEL); el; el = el.parentElement && el.parentElement.closest(SEL)) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (lastEvent.clientX - r.left) + 'px');
        el.style.setProperty('--my', (lastEvent.clientY - r.top) + 'px');
      }
    });
  }, { passive: true });
})();


/* ===== Ceylon FC esports motion layer (appended) ===== */
/* Ceylon FC — esports motion layer v2. Survives the app's innerHTML re-renders. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement, $ = (s, c = document) => c.querySelector(s);
  root.classList.add('fx');
  const mk = (c, h) => { const d = document.createElement('div'); d.className = c; if (h) d.innerHTML = h; document.body.appendChild(d); return d; };
  if (!sessionStorage.getItem('cfc_intro')) {
    sessionStorage.setItem('cfc_intro', '1');
    const i = mk('fx-intro', '<div class="fx-c"><small>Ceylon FC · FC Mobile League</small><span>0</span></div><div class="fx-bar"><i></i></div>');
    const num = i.querySelector('span'), bi = i.querySelector('i'), t0 = performance.now(), D = 1800;
    (function f(t) { const p = Math.min(1, (t - t0) / D), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      num.textContent = Math.round(e * 100); bi.style.transform = 'scaleX(' + e + ')';
      if (p < 1) requestAnimationFrame(f); else { setTimeout(() => i.classList.add('open'), 250); setTimeout(() => i.remove(), 1500); } })(t0);
  }
  let cx = innerWidth / 2, cy = innerHeight / 2, tn = 0;
  addEventListener('pointerdown', e => { cx = e.clientX; cy = e.clientY; }, { passive: true });
  // cursor follower (mouse only)
  if (matchMedia('(pointer:fine)').matches) {
    const cur = mk('fx-cur'); let tx = -99, ty = -99, x = -99, y = -99;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; cur.classList.toggle('big', !!(e.target.closest && e.target.closest('a,button,.card,.news-card,.player-card,input,select'))); }, { passive: true });
    (function l() { x += (tx - x) * .18; y += (ty - y) * .18; cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; requestAnimationFrame(l); })();
  }
  // nav text scramble on hover
  document.addEventListener('pointerover', e => {
    const t = e.target.closest && e.target.closest('.site-tab'); if (!t || t._s) return;
    const n = [...t.childNodes].reverse().find(x => x.nodeType === 3 && x.nodeValue.trim()); if (!n) return;
    t._s = 1; const o = n.nodeValue; let k = 0;
    const iv = setInterval(() => { n.nodeValue = o.replace(/\S/g, (c, j) => j < k ? c : 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.random() * 23 | 0]); if (++k > o.length + 1) { n.nodeValue = o; t._s = 0; clearInterval(iv); } }, 38);
  });
  const bar = mk('fx-progress'), wipe = mk('fx-wipe');
  const EMO = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
  let ghosts = [], tick = 0;
  const onScroll = () => {
    tick = 0;
    const h = root.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')';
    root.classList.toggle('scrolled', scrollY > 24);
    root.style.setProperty('--hs', Math.min(scrollY, 900) * .25 + 'px');
    root.style.setProperty('--ht', Math.min(scrollY, 900) * -.12 + 'px');
    ghosts.forEach(g => { const r = g.getBoundingClientRect(); if (r.bottom > -200 && r.top < innerHeight + 200) g.style.setProperty('--sx', ((r.top / innerHeight - .5) * 220).toFixed(0) + 'px'); });
  };
  addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(onScroll); }, { passive: true });
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    root.style.setProperty('--px', (e.clientX / innerWidth - .5).toFixed(3));
    root.style.setProperty('--py', (e.clientY / innerHeight - .5).toFixed(3));
    const c = e.target.closest && e.target.closest('.card,.news-card,.player-card,.strip-match');
    document.querySelectorAll('.tilt-on').forEach(n => n !== c && n.classList.remove('tilt-on'));
    if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg'); c.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 8 + 'deg'); c.classList.add('tilt-on'); }
  }, { passive: true });
  // magnetic buttons
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const b = e.target.closest && e.target.closest('.btn'); if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--bx', ((e.clientX - r.left - r.width / 2) * .22).toFixed(1) + 'px');
    b.style.setProperty('--by', ((e.clientY - r.top - r.height / 2) * .3).toFixed(1) + 'px');
  }, { passive: true });
  document.addEventListener('pointerout', e => { const b = e.target.closest && e.target.closest('.btn'); if (b) { b.style.setProperty('--bx', '0px'); b.style.setProperty('--by', '0px'); } }, true);
  document.addEventListener('pointerleave', () => document.querySelectorAll('.tilt-on').forEach(n => n.classList.remove('tilt-on')), true);

  const SEL = '.home-panel,.home-section,.panel,.card,.news-card,.player-card,.strip-match,.gm-card,.ko-round,.rank-row,.table-wrap,.motm-card,.hall-card,.about-section,.staff-card,.sponsor-card';
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08, rootMargin: '0px 0px -6% 0px' });
  let lastRoute = null, seeded = false;
  const strip = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (EMO.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(EMO, '').replace(/^\s+/, ''); };
  const split = el => {
    let c = 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), ns = [];
    for (let n; (n = w.nextNode());) ns.push(n);
    ns.forEach(n => { const f = document.createDocumentFragment(); [...n.nodeValue].forEach(ch => { if (ch === ' ') return f.appendChild(document.createTextNode(' ')); const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--c', c++); s.textContent = ch; f.appendChild(s); }); n.replaceWith(f); });
  };
  const wsplit = t => [...t.childNodes].filter(x => x.nodeType === 3 && x.nodeValue.trim()).forEach(n => {
    const f = document.createDocumentFragment();
    n.nodeValue.trim().split(/\s+/).forEach((w, k) => { const o = document.createElement('span'), i = document.createElement('span'); o.className = 'wd'; i.style.setProperty('--w', k); i.textContent = w; o.appendChild(i); f.appendChild(o); f.appendChild(document.createTextNode(' ')); });
    n.replaceWith(f); });
  const enhance = () => {
    const app = $('#app'); if (!app) return;
    app.querySelectorAll('.page-head h2,.page-head p,.section-title,.btn,.hero-kicker,.hero-champ-kicker,.site-tab,.panel h3,.card h3,.tab-btn,.empty-box,.hero-champ').forEach(strip);
    const route = location.hash || '#home', fresh = route !== lastRoute; lastRoute = route;
    const hero = $('.hero-title', app); if (hero && !hero.dataset.sp) { hero.dataset.sp = 1; split(hero); }
    let n = 0;
    app.querySelectorAll('.section-title').forEach(t => {
      if (t.dataset.rv) return; t.dataset.rv = 1;
      t.dataset.ghost = [...t.childNodes].filter(x => x.nodeType === 3).map(x => x.nodeValue).join('').trim();
      wsplit(t); t.classList.add('rv'); if (fresh || !seeded) io.observe(t); else t.classList.add('now', 'in');
    });
    app.querySelectorAll(SEL).forEach(el => {
      if (el.dataset.rv || el.closest('.rv:not(.section-title)')) return; el.dataset.rv = 1; el.classList.add('rv');
      if (fresh || !seeded) { el.style.setProperty('--i', n % 6); el.dataset.d = ['', 'l', 'r', 'z'][n++ % 4]; io.observe(el); } else el.classList.add('now', 'in');
    });
    ghosts = [...app.querySelectorAll('.section-title')]; seeded = true;
    if (!$('.fx-ticker') && $('.home-hero') && (route === '#home' || route === '#' || !location.hash)) {
      const items = ['Ceylon FC', 'FC Mobile League', 'Live fixtures', 'Knockouts', 'Fan zone', 'Season 1'];
      $('.home-hero').after(Object.assign(document.createElement('div'), { className: 'fx-ticker', innerHTML: '<div>' + items.concat(items).map(s => '<span>' + s + '</span>').join('') + '</div>' }));
    }
    const hh = $('.home-hero'); if (hh && !$('.fx-cue', hh)) hh.insertAdjacentHTML('beforeend', '<div class="fx-cue" aria-hidden="true"><span>Scroll</span><i></i></div>');
    const tk = $('.fx-ticker'); if (tk && !$('.fx-ticker.rev')) { const r = tk.cloneNode(true); r.classList.add('rev'); tk.after(r); }
    onScroll();
  };
  let pend = 0;
  new MutationObserver(() => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; enhance(); }); }).observe($('#app') || document.body, { childList: true });
  addEventListener('hashchange', () => {
    const type = tn++ % 3; root.classList.add('swap');
    if (type === 0) { wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go'); }
    else if (type === 1) { const s = mk('fx-slats', '<i></i>'.repeat(7)); [...s.children].forEach((c, k) => c.style.animationDelay = k * 55 + 'ms'); setTimeout(() => s.remove(), 1400); }
    else { const c = mk('fx-circle'); c.style.setProperty('--cx', cx + 'px'); c.style.setProperty('--cy', cy + 'px'); setTimeout(() => c.remove(), 1200); }
    setTimeout(() => scrollTo(0, 0), 420);
    setTimeout(() => { root.classList.remove('swap'); document.querySelectorAll('#app .rv:not(.now)').forEach(e => { e.classList.remove('in'); io.observe(e); }); }, 520);
  });
  enhance();
})();
