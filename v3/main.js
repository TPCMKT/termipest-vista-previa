(function () {
  "use strict";

  var brand = window.__BRAND__ || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.warn("[termipest]", e); } }

  document.documentElement.classList.add("js");

  /* Una sola acción: todos los botones marcados con data-cta van al mismo lugar. */
  function initCta() {
    if (!brand.cta) return;
    $$("[data-cta]").forEach(function (a) { a.setAttribute("href", brand.cta.enlace); });
  }

  /* Menú del celular a pantalla completa. */
  function initMenu() {
    var btn = $("[data-burger]"), nav = $("#menu");
    if (!btn || !nav) return;
    function set(open) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      nav.classList.toggle("open", open);
      document.body.style.overflow = open ? "hidden" : "";
    }
    btn.addEventListener("click", function () { set(btn.getAttribute("aria-expanded") !== "true"); });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 960) set(false); });
  }

  /* Síntomas marcables: cuenta y lleva a la acción. */
  function initChecks() {
    var box = $("[data-checks]"); if (!box) return;
    var out = $("[data-checks-out]", box), n = $("[data-checks-n]", box);
    box.addEventListener("change", function () {
      var c = $$("input:checked", box).length;
      n.textContent = c; out.hidden = c === 0;
    });
  }

  /* Preselecciona plaga o tipo de lugar en el formulario. */
  function initPrefill() {
    var plaga = $("#f-plaga"), lugar = $("#f-lugar");
    function pick(sel, val) {
      if (!sel) return;
      $$("option", sel).forEach(function (o) { if (o.text === val) sel.value = o.value || o.text; });
      var f = sel.closest(".field"); if (f) f.classList.remove("bad");
    }
    $$("[data-pest]").forEach(function (a) { a.addEventListener("click", function () { pick(plaga, a.getAttribute("data-pest")); }); });
    $$("[data-prop]").forEach(function (a) { a.addEventListener("click", function () { pick(lugar, a.getAttribute("data-prop")); }); });
  }

  /* Números que cuentan al aparecer. */
  function initCount() {
    var els = $$("[data-count]"); if (!els.length || reduced || !("IntersectionObserver" in window)) return;
    var fmt = function (v) { return Math.round(v).toLocaleString("en-US"); };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, end = +el.getAttribute("data-count"), t0 = null, dur = 1100;
        (function step(t) {
          if (!t0) t0 = t;
          var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          el.textContent = fmt(end * e);
          if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(end);
        })(performance.now());
      });
    }, { threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* Aparición vertical al bajar, con red de seguridad. */
  function initReveal() {
    var targets = $$(".sec-head, .checks, .pest-row, .step, .gain, .biz, .stats, .sheet, .qa > div, .offer, .cities, .faq, .form, .next");
    if (!("IntersectionObserver" in window)) return;
    targets.forEach(function (el) { el.classList.add("rv"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.05, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) { io.observe(el); });
    setTimeout(function () { targets.forEach(function (el) { el.classList.add("in"); }); }, 6000);
  }

  /* Formulario: validación amable (teléfonos de cualquier país) y modo de prueba sin destino. */
  function initForm() {
    var form = $("#form"); if (!form) return;
    var status = $("[data-status]", form);
    function digits(v) { return (v || "").replace(/\D/g, ""); }
    function validPhone(v) {
      var d = digits(v);
      if (/^\+?502/.test(v.trim()) || d.length === 8) return d.replace(/^502/, "").length === 8;
      return d.length >= 7 && d.length <= 15;
    }
    function check(el) {
      var ok = el.id === "f-tel" ? validPhone(el.value) : el.checkValidity();
      var f = el.closest(".field"); if (f) f.classList.toggle("bad", !ok);
      el.setAttribute("aria-invalid", ok ? "false" : "true");
      return ok;
    }
    $$("input[required], select[required]", form).forEach(function (el) {
      el.addEventListener("blur", function () { if (el.value) check(el); });
      el.addEventListener("change", function () { check(el); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if ($("#f-web", form).value) return;
      var bad = $$("input[required], select[required]", form).filter(function (el) { return !check(el); });
      if (bad.length) { bad[0].focus(); return; }
      var endpoint = form.getAttribute("data-endpoint");
      status.hidden = false;
      if (!endpoint) {
        status.textContent = "Vista previa: el formulario todavía no envía datos. Al publicar el sitio, esta solicitud llegará al equipo de Termipest.";
        return;
      }
      var btn = $("button[type=submit]", form); btn.disabled = true;
      status.textContent = "Enviando…";
      fetch(endpoint, { method: "POST", body: new FormData(form) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); status.textContent = "¡Listo! Te llamamos pronto para darte tu cotización."; })
        .catch(function () { status.textContent = "No se pudo enviar. Llámanos al 2307-4727 y con gusto te atendemos."; })
        .then(function () { btn.disabled = false; });
    });
  }

  function boot() {
    [initCta, initMenu, initChecks, initPrefill, initCount, initReveal, initForm].forEach(safe);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
