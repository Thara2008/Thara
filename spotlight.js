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
