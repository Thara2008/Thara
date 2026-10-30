/* ronaldo.js — type "Ronaldo" anywhere and a "SUIIIIIIIIIII" popup appears.
   Works in any text box/search field, or just on the page with no field focused.
   Click, tap or press Esc to close; it also closes itself after a few seconds. */
(function () {
  'use strict';
  var WORD = 'ronaldo', COOLDOWN = 2500, SHOW_MS = 3800;
  var buf = '', lastShown = 0, current = null, timer = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function close() {
    if (!current) return;
    var node = current;
    current = null;
    clearTimeout(timer);
    node.classList.add('is-out');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
  }

  function show() {
    var now = Date.now();
    if (current || now - lastShown < COOLDOWN) return;
    lastShown = now;

    var root = el('div', 'suiii');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    var card = el('div', 'suiii-card');
    card.appendChild(el('div', 'suiii-num', '7'));

    var word = el('div', 'suiii-word');
    word.setAttribute('aria-label', 'Suiiiiiiiiiii');
    word.appendChild(el('span', null, 'SU'));
    for (var k = 0; k < 11; k++) {
      var i = el('span', 'i', 'I');
      i.style.setProperty('--n', k);
      i.setAttribute('aria-hidden', 'true');
      word.appendChild(i);
    }
    card.appendChild(word);
    card.appendChild(el('div', 'suiii-sub', 'Tap anywhere to close'));
    root.appendChild(card);

    var colours = ['#f2c14e', '#fff2c4', '#74d9a5', '#ffffff', '#f0a93b'];
    for (var c = 0; c < 44; c++) {
      var bit = el('span', 'suiii-bit');
      var angle = Math.random() * Math.PI * 2, dist = 160 + Math.random() * 360;
      bit.style.setProperty('--x', Math.round(Math.cos(angle) * dist) + 'px');
      bit.style.setProperty('--y', Math.round(Math.sin(angle) * dist + 140) + 'px');
      bit.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      bit.style.setProperty('--d', (Math.random() * 0.35).toFixed(2) + 's');
      bit.style.setProperty('--c', colours[c % colours.length]);
      root.appendChild(bit);
    }

    root.addEventListener('click', close);
    document.body.appendChild(root);
    current = root;
    timer = setTimeout(close, SHOW_MS);
  }

  /* typing inside a text field (checked as the value changes, so paste works too) */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || typeof t.value !== 'string' || t.type === 'password') return;
    var has = t.value.toLowerCase().indexOf(WORD) > -1;
    if (has && !t.__suiiiSeen) { t.__suiiiSeen = true; show(); }
    else if (!has) { t.__suiiiSeen = false; }
  }, true);

  /* typing with no field focused */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    buf = (buf + e.key.toLowerCase()).slice(-WORD.length);
    if (buf === WORD) { buf = ''; show(); }
  });
})();
