/* =====================================================================
   Termipest — comportamiento de la página
   Bootstrap JS (bundle) se encarga del Offcanvas y del Carousel del hero.
   Aquí solo va lo propio, en funciones pequeñas e independientes:
     analytics · menú · carrusel hero · carrusel servicios · proceso · plagas → formulario
     formulario · apariciones al hacer scroll · botón "volver arriba"
   ===================================================================== */
(function () {
  'use strict';

  const WHATSAPP_NUMBER = '50230836237';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Analítica (sin proveedor todavía) ----------
     Cada elemento con data-track="evento" envía { event, location }.
     Si más adelante se instala Google Tag Manager, window.dataLayer ya existirá y
     recibirá los eventos sin tocar este código. Además se emite un CustomEvent. */
  function track(event, detail) {
    const payload = Object.assign({ event: event }, detail || {});
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
    document.dispatchEvent(new CustomEvent('termipest:track', { detail: payload }));
  }

  function initClickTracking() {
    document.addEventListener('click', function (e) {
      const el = e.target.closest('[data-track]');
      if (el) track(el.dataset.track, { location: el.dataset.trackLocation || '' });
    });
  }

  function initViewTracking() {
    const targets = document.querySelectorAll('[data-track-view]');
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        track(entry.target.dataset.trackView, { location: entry.target.id });
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- Utilidad: ir a una sección y dejar el foco ahí (accesibilidad) ---------- */
  function goToSection(hash) {
    const target = hash && hash.length > 1 ? document.querySelector(hash) : null;
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    history.pushState(null, '', hash);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /* ---------- Menú móvil (Offcanvas de Bootstrap) ----------
     Bootstrap no cierra el panel al tocar un enlace interno: lo cerramos y, cuando
     terminó de cerrarse, llevamos a la sección (si no, el bloqueo de scroll lo impide). */
  function initMenu() {
    const menu = document.getElementById('menuPrincipal');
    if (!menu || !window.bootstrap) return;
    menu.addEventListener('click', function (e) {
      const link = e.target.closest('a[href^="#"]');
      if (!link || !menu.classList.contains('show')) return;
      e.preventDefault();
      menu.addEventListener('hidden.bs.offcanvas', function () {
        goToSection(link.getAttribute('href'));
      }, { once: true });
      bootstrap.Offcanvas.getOrCreateInstance(menu).hide();
    });
  }

  /* ---------- Carrusel del hero (Bootstrap Carousel) ----------
     Se pausa con el mouse encima, con el foco de teclado dentro, fuera de pantalla,
     con la pestaña oculta o con el botón de pausa. Con "reducir movimiento" arranca pausado. */
  function initHeroCarousel() {
    const el = document.getElementById('heroCarousel');
    if (!el || !window.bootstrap) return;

    const INTERVAL = 5000;
    el.style.setProperty('--hero-interval', INTERVAL + 'ms');
    const carousel = bootstrap.Carousel.getOrCreateInstance(el, {
      interval: INTERVAL, ride: false, pause: false, touch: true, keyboard: true, wrap: true
    });
    const inner = el.querySelector('.carousel-inner');
    const toggle = el.querySelector('.hero-toggle');
    const state = { user: reduceMotion, hover: false, focus: false, offscreen: false };
    let running = null;

    function apply() {
      const shouldRun = !state.user && !state.hover && !state.focus && !state.offscreen && !document.hidden;
      el.classList.toggle('is-stopped', state.user);
      toggle.setAttribute('aria-label', state.user ? 'Reanudar fotos' : 'Pausar fotos');
      if (shouldRun === running) return;
      running = shouldRun;
      if (shouldRun) {
        el.classList.remove('is-running');
        void el.offsetWidth; // reinicia la barra de progreso junto con el temporizador
        el.classList.add('is-running');
        carousel.cycle();
      } else {
        el.classList.remove('is-running');
        carousel.pause();
      }
      // patrón de carrusel accesible: anunciar cambios solo cuando no avanza solo
      inner.setAttribute('aria-live', shouldRun ? 'off' : 'polite');
    }

    toggle.addEventListener('click', function () { state.user = !state.user; apply(); });
    if (canHover) {
      el.addEventListener('mouseenter', function () { state.hover = true; apply(); });
      el.addEventListener('mouseleave', function () { state.hover = false; apply(); });
    }
    el.addEventListener('focusin', function (e) { state.focus = e.target.matches(':focus-visible'); apply(); });
    el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) { state.focus = false; apply(); } });
    document.addEventListener('visibilitychange', apply);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.offscreen = !entries[0].isIntersecting; apply();
      }, { threshold: 0.3 }).observe(el);
    }
    apply();
  }

  /* ---------- Carrusel de servicios (propio) ----------
     Tarjeta central destacada + vecinas asomando, con scroll-snap nativo (táctil gratis).
     Autoplay: la barra del punto activo se llena con CSS y, al terminar, pasa a la siguiente.

     Bucle infinito: se agrega una copia completa de las 8 tarjetas antes y otra después
       [copias 01–08] [originales 01–08] [copias 01–08]
     Al pasar de 08 a 01 se avanza hacia la copia de 01 (movimiento continuo a la derecha) y, cuando
     el desplazamiento terminó, se mueve el scroll exactamente una vuelta: como copia y original son
     idénticas, el salto no se ve. Las copias son aria-hidden y no entran al tab; contador, puntos y
     anuncios usan siempre la posición lógica 0–7. */
  function initServiceCarousel() {
    const root = document.querySelector('.svc-root');
    if (!root) return;
    const track = root.querySelector('.svc-track');
    const originals = Array.from(track.querySelectorAll('.segment-card'));
    const dots = Array.from(root.querySelectorAll('.svc-dot'));
    const counter = root.querySelector('.svc-current');
    const live = root.querySelector('[data-svc-live]');
    const toggle = root.querySelector('[data-svc="toggle"]');
    const n = originals.length;
    if (n < 2) return;

    // No se usa `inert` a propósito: bloquearía el clic en la tarjeta lateral (que a veces es una copia).
    function makeClone(card) {
      const c = card.cloneNode(true);
      c.classList.add('is-clone');
      c.setAttribute('aria-hidden', 'true');
      ['role', 'aria-roledescription', 'aria-label'].forEach(function (a) { c.removeAttribute(a); });
      c.querySelectorAll('a, button, [tabindex]').forEach(function (el) { el.setAttribute('tabindex', '-1'); });
      c.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
      // Las copias no repiten encabezados: Google renderiza el JS y vería cada h3 tres veces.
      c.querySelectorAll('h3').forEach(function (h) {
        const d = document.createElement('div');
        d.className = h.className;
        d.innerHTML = h.innerHTML;
        h.replaceWith(d);
      });
      return c;
    }
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    originals.forEach(function (c) { before.appendChild(makeClone(c)); after.appendChild(makeClone(c)); });
    track.insertBefore(before, track.firstChild);
    track.appendChild(after);
    const cards = Array.from(track.querySelectorAll('.segment-card')); // 3n tarjetas físicas

    let pos = -1;          // índice físico (0…3n-1) de la tarjeta centrada
    let logical = -1;      // 0…n-1: lo que muestran contador, puntos y lector de pantalla
    let announced = -1;
    let activeSince = 0;
    let centers = [];
    let half = 0;
    let loopWidth = 0;     // distancia exacta de una vuelta (n tarjetas)
    let gliding = false;   // desplazamiento programado en curso: el scroll no decide la tarjeta activa
    let gestureFrom = -1;  // tarjeta lógica al empezar un gesto (dedo / trackpad); -1 = sin gesto

    function measure() {
      half = track.clientWidth / 2;
      centers = cards.map(function (c) { return c.offsetLeft + c.offsetWidth / 2; });
      loopWidth = centers[n] - centers[0];
    }
    function nearest() {
      const x = track.scrollLeft + half;
      let best = 0;
      for (let i = 1; i < cards.length; i++) if (Math.abs(centers[i] - x) < Math.abs(centers[best] - x)) best = i;
      return best;
    }
    function announce() {
      if (logical === announced) return;
      announced = logical;
      live.textContent = originals[logical].getAttribute('aria-label');
    }
    function setActive(p, byUser) {
      if (p !== pos) {
        if (pos >= 0) cards[pos].classList.remove('is-active');
        pos = p;
        cards[p].classList.add('is-active');
        activeSince = performance.now();
      }
      const i = p % n;
      if (i !== logical) {
        if (logical >= 0) dots[logical].removeAttribute('aria-current');
        logical = i;
        dots[i].setAttribute('aria-current', 'true');
        counter.textContent = String(i + 1).padStart(2, '0');
        if (!byUser) announced = -1; // el autoplay no se anuncia (evita ruido en lectores de pantalla)
      }
      if (byUser) announce();
    }

    // Salto invisible de una copia a su original (o al revés): mueve el scroll exactamente una vuelta.
    function jump(dir) {
      const from = cards[pos];
      const to = cards[pos + dir * n];
      // solo estas dos tarjetas cambian sin transición; las demás terminan la suya normalmente
      track.classList.add('is-jumping');
      from.classList.add('is-swapping');
      to.classList.add('is-swapping');
      from.classList.remove('is-active');
      to.classList.add('is-active');
      pos += dir * n;
      track.scrollLeft += dir * loopWidth;
      void track.offsetWidth; // aplica el cambio sin transiciones antes de volver a activarlas
      from.classList.remove('is-swapping');
      to.classList.remove('is-swapping');
      track.classList.remove('is-jumping');
    }
    function normalize() {
      if (pos < n) jump(1);
      else if (pos >= 2 * n) jump(-1);
    }

    function moveTo(p, byUser) {
      gestureFrom = -1; // los movimientos con botones/puntos se anuncian en setActive
      setActive(p, byUser);
      const left = centers[p] - half;
      if (reduceMotion || Math.abs(track.scrollLeft - left) < 1) {
        track.scrollLeft = left;
        settleSoon(0);
        return;
      }
      gliding = true;
      track.classList.add('is-gliding');
      track.scrollTo({ left: left, behavior: 'smooth' });
    }
    // anterior / siguiente / autoplay: primero se vuelve a la zona original (si hace falta), luego se avanza
    function step(delta, byUser) { normalize(); moveTo(pos + delta, byUser); }
    // puntos: de las tres copias de esa tarjeta, ir a la más cercana (08 → 01 avanza uno, no retrocede siete)
    function goToLogical(i, byUser) {
      normalize();
      let best = i + n;
      [i, i + 2 * n].forEach(function (c) { if (Math.abs(c - pos) < Math.abs(best - pos)) best = c; });
      moveTo(best, byUser);
    }

    // Fin de cualquier desplazamiento (programado, dedo o trackpad): fijar la activa y, si quedó en
    // una copia, saltar a la original. Se espera a que la tarjeta termine su transición de escala.
    let settleTimer = 0;
    function settleSoon(ms) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, ms === undefined ? 140 : ms);
    }
    function settle() {
      if (state.touching) return; // al soltar el dedo se vuelve a programar
      const wait = 620 - (performance.now() - activeSince);
      if (wait > 0 && (pos < n || pos >= 2 * n)) { settleSoon(wait); return; }
      gliding = false;
      setActive(nearest(), false);
      if (gestureFrom >= 0 && logical !== gestureFrom) announce(); // swipe: anunciar solo si cambió de servicio
      gestureFrom = -1;
      normalize();
      track.classList.remove('is-gliding');
    }

    // --- pausa / reproducción ---
    const state = { user: reduceMotion, hover: false, focus: false, offscreen: true, touching: false };
    function sync() {
      root.classList.toggle('is-running', !state.user);
      root.classList.toggle('is-stopped', state.user);
      root.classList.toggle('is-paused', state.hover || state.focus || state.offscreen || state.touching || document.hidden);
      toggle.setAttribute('aria-label', state.user ? 'Reproducir carrusel' : 'Pausar carrusel');
    }
    function restartProgress() {
      const d = dots[logical];
      d.removeAttribute('aria-current'); void d.offsetWidth; d.setAttribute('aria-current', 'true');
    }
    dots.forEach(function (d) {
      d.addEventListener('animationend', function (e) {
        if (e.animationName !== 'bar-fill' || state.user || root.classList.contains('is-paused')) return;
        step(1, false);
      });
    });

    // --- controles ---
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-svc]');
      if (btn) {
        const action = btn.dataset.svc;
        if (action === 'prev') step(-1, true);
        else if (action === 'next') step(1, true);
        else { state.user = !state.user; if (!state.user) restartProgress(); sync(); }
        return;
      }
      const dot = e.target.closest('.svc-dot');
      if (dot) { goToLogical(dots.indexOf(dot), true); return; }
      const card = e.target.closest('.segment-card');
      if (card && !card.classList.contains('is-active')) moveTo(cards.indexOf(card), true);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1, true); }
    });

    // --- desplazamiento manual (dedo, trackpad): la tarjeta más cercana al centro pasa a ser la activa ---
    let raf = 0;
    track.addEventListener('scroll', function () {
      settleSoon();
      if (gliding || raf) return;
      raf = requestAnimationFrame(function () { raf = 0; setActive(nearest(), false); });
    }, { passive: true });
    // Chrome también dispara scrollend cuando un desplazamiento interrumpe a otro (clics rápidos):
    // en ese caso se ignora y decide el temporizador, que solo vence cuando el scroll realmente se detuvo.
    if ('onscrollend' in window) {
      track.addEventListener('scrollend', function () {
        if (!gliding || Math.abs(track.scrollLeft - (centers[pos] - half)) < 2) settleSoon(0);
      });
    }
    track.addEventListener('wheel', function () { if (gestureFrom < 0) gestureFrom = logical; }, { passive: true });
    let touchTimer = 0;
    track.addEventListener('touchstart', function () {
      clearTimeout(touchTimer);
      state.touching = true;
      if (gestureFrom < 0) gestureFrom = logical;
      if (gliding) { gliding = false; track.classList.remove('is-gliding'); } // el dedo manda: vuelve el snap
      sync();
    }, { passive: true });
    function touchDone() {
      touchTimer = setTimeout(function () { state.touching = false; sync(); settleSoon(); }, 700);
    }
    track.addEventListener('touchend', touchDone, { passive: true });
    track.addEventListener('touchcancel', touchDone, { passive: true });

    if (canHover) {
      root.addEventListener('mouseenter', function () { state.hover = true; sync(); });
      root.addEventListener('mouseleave', function () { state.hover = false; sync(); });
    }
    root.addEventListener('focusin', function (e) { state.focus = e.target.matches(':focus-visible'); sync(); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { state.focus = false; sync(); } });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.offscreen = !entries[0].isIntersecting; sync();
      }, { threshold: 0.35 }).observe(track);
    } else {
      state.offscreen = false;
    }

    // --- cambios de tamaño (se ignoran los cambios de alto de la barra del navegador en móvil) ---
    let lastWidth = track.clientWidth;
    let resizeRaf = 0;
    window.addEventListener('resize', function () {
      if (resizeRaf || track.clientWidth === lastWidth) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0; lastWidth = track.clientWidth; measure();
        // recolocar en la misma tarjeta lógica, sin animación
        track.classList.add('is-jumping');
        track.scrollLeft = centers[pos] - half;
        void track.offsetWidth;
        track.classList.remove('is-jumping');
        settleSoon();
      });
    });

    measure();
    setActive(n, false); // primera tarjeta original (01)
    track.scrollLeft = centers[n] - half;
    sync();
  }

  /* ---------- Proceso "Cómo trabajamos" (línea de tiempo) ----------
     Los textos de los 4 pasos están siempre en el HTML: aquí solo se cambia qué paso se destaca.
     Escritorio: avance automático; la línea amarilla se llena hacia el siguiente paso durante
     --proc-interval y, al terminar (animationend), se activa ese paso; después del 04 vuelve al 01.
     Se pausa con el mouse encima, el foco de teclado dentro, fuera de pantalla o con la pestaña oculta.
     Clic o Enter/Espacio en un número: activa ese paso y reinicia el tiempo desde ahí. ← → mueven el foco.
     Móvil (línea vertical): sin autoplay; se destaca el paso que cruza el centro de la pantalla.
     Con "reducir movimiento" no hay autoplay ni desplazamientos; el clic sigue funcionando. */
  function initProcess() {
    const root = document.querySelector('[data-proc]');
    if (!root) return;
    const steps = Array.from(root.querySelectorAll('.proc-step'));
    const nodes = steps.map(function (s) { return s.querySelector('.proc-node'); });
    const n = steps.length;
    const desktop = window.matchMedia('(min-width: 992px)');
    const state = { hover: false, focus: false, offscreen: !!window.IntersectionObserver };
    let active = -1;
    let scrollIO = null;

    function setActive(i, restart) {
      steps.forEach(function (s, k) { s.classList.toggle('is-done', k < i); });
      if (i !== active) {
        if (active >= 0) { steps[active].classList.remove('is-active'); nodes[active].removeAttribute('aria-current'); }
        active = i;
        steps[i].classList.add('is-active');
        nodes[i].setAttribute('aria-current', 'step');
      } else if (restart) { // mismo paso: reinicia su línea de avance
        steps[i].classList.remove('is-active');
        void steps[i].offsetWidth;
        steps[i].classList.add('is-active');
      }
    }
    function sync() {
      root.classList.toggle('is-running', desktop.matches && !reduceMotion);
      root.classList.toggle('is-paused', state.hover || state.focus || state.offscreen || document.hidden);
    }
    // móvil: el paso que pasa por la franja central de la pantalla queda activo
    function watchScroll(on) {
      if (scrollIO) { scrollIO.disconnect(); scrollIO = null; }
      if (!on || !('IntersectionObserver' in window)) return;
      scrollIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) setActive(steps.indexOf(entry.target), false); });
      }, { rootMargin: '-45% 0px -45% 0px' });
      steps.forEach(function (s) { scrollIO.observe(s); });
    }
    function applyMode() { watchScroll(!desktop.matches); sync(); }

    root.addEventListener('animationend', function (e) {
      if (e.animationName !== 'proc-advance' || e.target !== steps[active]) return;
      setActive((active + 1) % n, false);
    });
    root.addEventListener('click', function (e) {
      const node = e.target.closest('.proc-node');
      if (node) setActive(nodes.indexOf(node), true);
    });
    root.addEventListener('keydown', function (e) {
      const i = nodes.indexOf(e.target);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      e.preventDefault();
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      nodes[j].focus();
      setActive(j, true);
    });
    if (canHover) {
      root.addEventListener('mouseenter', function () { state.hover = true; sync(); });
      root.addEventListener('mouseleave', function () { state.hover = false; sync(); });
    }
    root.addEventListener('focusin', function (e) { state.focus = e.target.matches(':focus-visible'); sync(); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { state.focus = false; sync(); } });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.offscreen = !entries[0].isIntersecting; sync();
      }, { threshold: 0.35 }).observe(root);
    }
    if (desktop.addEventListener) desktop.addEventListener('change', applyMode);
    else desktop.addListener(applyMode);

    root.classList.add('is-ready');
    setActive(0, false);
    applyMode();
  }

  /* ---------- Tarjetas de plagas y servicios → formulario con el dato ya marcado ---------- */
  function initPrefill() {
    const pest = document.getElementById('qf-plaga');
    const property = document.getElementById('qf-propiedad');
    document.addEventListener('click', function (e) {
      const el = e.target.closest('[data-prefill-pest], [data-prefill-property]');
      if (!el) return;
      selectOption(pest, el.dataset.prefillPest);
      selectOption(property, el.dataset.prefillProperty);
    });
    function selectOption(select, value) {
      if (!select || !value) return;
      const match = Array.from(select.options).some(function (o) { return o.value === value; });
      if (!match) return;
      select.value = value;
      select.classList.remove('is-invalid');
      select.removeAttribute('aria-invalid');
    }
  }

  /* ---------- Formulario de cotización ----------
     Validación en el navegador solo para ayudar a la persona: el servidor DEBE volver a validar todo.
     Sin endpoint configurado (data-endpoint vacío) no se envía nada: modo de prueba + opción WhatsApp. */
  function initQuoteForm() {
    const form = document.getElementById('quoteForm');
    if (!form) return;

    const renderedAt = Date.now();
    const MIN_FILL_MS = 2500; // nadie llena 4 campos en menos de 2.5 s: señal de bot
    const submitBtn = form.querySelector('.quote-submit');
    const status = form.querySelector('.form-status');
    const statusTitle = status.querySelector('.form-status-title');
    const statusText = status.querySelector('.form-status-text');
    const statusWa = status.querySelector('.form-status-wa');
    const honeypot = form.elements.sitio_web;
    let sending = false;

    function normalizePhone(value) {
      let digits = value.replace(/\D/g, '');
      if (digits.length === 11 && digits.indexOf('502') === 0) digits = digits.slice(3);
      return digits;
    }
    const rules = {
      nombre: function (v) { const t = v.trim(); return t.length >= 2 && t.length <= 80; },
      telefono: function (v) { return /^[2-7]\d{7}$/.test(normalizePhone(v)); },
      tipo_propiedad: function (v) { return v !== ''; },
      plaga: function (v) { return v !== ''; },
      mensaje: function (v) { return v.length <= 500; }
    };

    function validateField(field) {
      const rule = rules[field.name];
      if (!rule) return true;
      const ok = rule(field.value);
      field.classList.toggle('is-invalid', !ok);
      if (ok) field.removeAttribute('aria-invalid'); else field.setAttribute('aria-invalid', 'true');
      return ok;
    }
    function validateAll() {
      let firstInvalid = null;
      Object.keys(rules).forEach(function (name) {
        const field = form.elements[name];
        if (field && !validateField(field) && !firstInvalid) firstInvalid = field;
      });
      return firstInvalid;
    }
    // corregir en vivo solo los campos que ya se marcaron como inválidos
    form.addEventListener('input', function (e) { if (e.target.classList.contains('is-invalid')) validateField(e.target); });
    form.addEventListener('change', function (e) { if (e.target.classList.contains('is-invalid')) validateField(e.target); });

    function setLoading(on) {
      sending = on;
      submitBtn.disabled = on;
      submitBtn.classList.toggle('is-loading', on);
      submitBtn.setAttribute('aria-busy', on ? 'true' : 'false');
    }
    function whatsappLink(data) {
      const lines = [
        'Hola Termipest, quisiera solicitar una cotización.',
        'Nombre: ' + data.nombre,
        'Tipo de lugar: ' + data.tipo_propiedad,
        'Plaga: ' + data.plaga
      ];
      if (data.mensaje) lines.push('Detalles: ' + data.mensaje);
      return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
    }
    // todo el texto se inserta con textContent: nunca se interpreta como HTML
    function showStatus(kind, title, text, waHref) {
      status.dataset.state = kind;
      statusTitle.textContent = title;
      statusText.textContent = text;
      statusWa.hidden = !waHref;
      if (waHref) statusWa.href = waHref;
      status.hidden = false;
    }
    function collect() {
      return {
        nombre: form.elements.nombre.value.trim(),
        telefono: normalizePhone(form.elements.telefono.value),
        tipo_propiedad: form.elements.tipo_propiedad.value,
        plaga: form.elements.plaga.value,
        mensaje: form.elements.mensaje.value.trim(),
        origen: 'landing-termipest',
        pagina: location.pathname // inicio, casas o industrial: quien recibe el lead sabe desde dónde llegó
      };
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (sending) return; // evita doble envío

      // anti-spam: campo trampa lleno o envío instantáneo → se simula éxito y no se envía nada
      if (honeypot.value || Date.now() - renderedAt < MIN_FILL_MS) {
        showStatus('success', '¡Solicitud recibida!', 'Gracias. Te contactaremos pronto.');
        return;
      }

      const firstInvalid = validateAll();
      if (firstInvalid) { firstInvalid.focus(); return; }

      const data = collect();
      const endpoint = (form.dataset.endpoint || '').trim();

      if (!endpoint) {
        showStatus('dev', 'Formulario en modo de prueba',
          'Este formulario todavía no está conectado, así que tu solicitud no se envió. Para no perderla, envíala por WhatsApp con un clic:',
          whatsappLink(data));
        track('submit_quote', { location: 'formulario', mode: 'sin-endpoint' });
        return;
      }

      setLoading(true);
      const controller = new AbortController();
      const timeout = setTimeout(function () { controller.abort(); }, 15000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'omit',
          signal: controller.signal
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const firstName = data.nombre.split(' ')[0];
        showStatus('success', '¡Solicitud enviada!', 'Gracias, ' + firstName + '. Te contactaremos pronto por WhatsApp o teléfono.');
        track('submit_quote', { location: 'formulario' });
        form.reset();
      } catch (err) {
        showStatus('error', 'No pudimos enviar tu solicitud',
          'Revisa tu conexión e inténtalo de nuevo. Si prefieres, envíanos los mismos datos por WhatsApp:',
          whatsappLink(data));
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    });
  }

  /* ---------- Apariciones al hacer scroll ---------- */
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-scale');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Botón "volver arriba": aparece cuando el hero sale de pantalla (sin escuchar el scroll) ---------- */
  function initToTop() {
    const btn = document.querySelector('.to-top');
    const hero = document.querySelector('.hero, .legal-hero');
    if (!btn || !hero || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      btn.classList.toggle('show', !entries[0].isIntersecting);
    }).observe(hero);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      const brand = document.querySelector('.navbar-brand');
      if (brand) brand.focus({ preventScroll: true });
    });
  }

  function init() {
    initClickTracking();
    initViewTracking();
    initMenu();
    initHeroCarousel();
    initServiceCarousel();
    initProcess();
    initPrefill();
    initQuoteForm();
    initReveal();
    initToTop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
