/* Termipest v4 · movimiento ligado al scroll (estilo "páginas de producto").
   - El contenido vive completo en el HTML; este archivo solo agrega movimiento.
   - Sin librerías: un solo listener de scroll con requestAnimationFrame que escribe --p (0→1)
     en cada bloque [data-sc]. El CSS decide qué hacer con ese número.
   - Si algo falla, el CSS por defecto muestra todo en su estado final. */
(function () {
  'use strict';
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.warn('[termipest-motion]', e); } }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  var items = [];
  var ticking = false;

  /* modos:
     view   → 0 cuando el bloque asoma por abajo, 1 cuando sale por arriba
     sticky → 0 cuando el contenedor alto toca el borde superior, 1 cuando termina (para escenas fijas)
     exit   → 0 con el bloque arriba del todo, 1 cuando ya salió */
  function measure(it, vh) {
    var r = it.el.getBoundingClientRect();
    if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
    var p;
    if (it.mode === 'sticky') p = clamp(-r.top / Math.max(1, r.height - vh));
    else if (it.mode === 'exit') p = clamp(-r.top / Math.max(1, r.height));
    else p = clamp((vh - r.top) / (vh + r.height));
    if (Math.abs(p - it.last) < 0.0005) return;
    it.last = p;
    it.el.style.setProperty('--p', p.toFixed(4));
    it.el.style.setProperty('--e', ease(p).toFixed(4));
    if (it.cb) it.cb(p);
  }
  function update() {
    ticking = false;
    var vh = window.innerHeight;
    for (var i = 0; i < items.length; i++) measure(items[i], vh);
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  function register(el, cb) {
    var it = { el: el, mode: el.getAttribute('data-sc') || 'view', last: -1, cb: cb || null };
    items.push(it);
    return it;
  }

  /* Frase que se va encendiendo palabra por palabra. */
  function initStatement() {
    document.querySelectorAll('[data-words]').forEach(function (box) {
      var target = box.querySelector('.statement-text');
      if (!target) return;
      var words = [];
      // envuelve cada palabra sin perder <strong>
      Array.prototype.slice.call(target.childNodes).forEach(function (node) {
        var isStrong = node.nodeType === 1;
        var text = node.textContent;
        var frag = document.createDocumentFragment();
        text.split(/(\s+)/).forEach(function (w) {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
          var s = document.createElement('span');
          s.className = 'w' + (isStrong ? ' w-strong' : '');
          s.textContent = w;
          frag.appendChild(s);
          words.push(s);
        });
        target.replaceChild(frag, node);
      });
      box.classList.add('is-split');
      var lit = -1;
      register(box, function (p) {
        var n = Math.round(clamp((p - 0.08) / 0.72) * words.length);
        if (n === lit) return;
        lit = n;
        for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', i < n);
      });
    });
  }

  /* Pasos del proceso: la foto fija del lado cambia según el paso que está al centro. */
  function initScrolly() {
    var root = document.querySelector('[data-scrolly]');
    if (!root || !('IntersectionObserver' in window)) return;
    var steps = Array.prototype.slice.call(root.querySelectorAll('.sx-step'));
    var shots = Array.prototype.slice.call(root.querySelectorAll('.sx-shot'));
    var bar = root.querySelector('.sx-bar i');
    var count = root.querySelector('[data-sx-n]');
    function set(i) {
      steps.forEach(function (s, k) { s.classList.toggle('is-on', k === i); s.classList.toggle('is-past', k < i); });
      shots.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
      if (count) count.textContent = '0' + (i + 1);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) set(steps.indexOf(en.target)); });
    }, { rootMargin: '-48% 0px -48% 0px' });
    steps.forEach(function (s) { io.observe(s); });
    root.classList.add('is-live');
    set(0);
    register(root, function (p) { if (bar) bar.style.transform = 'scaleY(' + p.toFixed(4) + ')'; });
  }

  /* Números que cuentan (solo la parte numérica; el texto "Casi", "+", "años" se respeta). */
  function initCount() {
    var els = document.querySelectorAll('[data-count-up]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, raw = el.textContent;
        var m = raw.match(/([\d,]+)/);
        if (!m) return;
        var end = parseInt(m[1].replace(/,/g, ''), 10), t0 = null, dur = 1300;
        (function step(t) {
          if (!t0) t0 = t;
          var k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
          el.textContent = raw.replace(m[1], v.toLocaleString('en-US'));
          if (k < 1) requestAnimationFrame(step); else el.textContent = raw;
        })(performance.now());
      });
    }, { threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  }

  function boot() {
    document.documentElement.classList.add('motion');
    safe(initStatement);
    safe(initScrolly);
    safe(initCount);
    safe(function () {
      document.querySelectorAll('[data-sc]').forEach(function (el) {
        if (!items.some(function (it) { return it.el === el; })) register(el);
      });
    });
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    window.addEventListener('load', request);
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { safe(boot); });
  else safe(boot);
})();
