/* ==========================================================================
   Hsoja · Portfolio — interacciones
   - Sin dependencias, sin eval, sin innerHTML con datos externos, sin red.
   - Un único bucle requestAnimationFrame que solo corre mientras algo se mueve.
   - Todo el movimiento usa transform/opacity (compositor) para mantener 60 fps.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;

  /* Anti-clickjacking: GitHub Pages no permite la cabecera frame-ancestors,
     así que si la página se carga dentro de un iframe ajeno, se oculta. */
  if (window.top !== window.self) {
    root.classList.add('is-framed');
    return;
  }

  root.classList.add('js');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); }; // smoothstep

  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
  const motionOK = () => !reduceMQ.matches;

  /* ---------- Año del footer ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ======================================================================
     1. REVEAL AL SCROLL (IntersectionObserver)
     ====================================================================== */
  $$('[data-reveal]').forEach((el) => {
    const d = Number(el.dataset.delay || 0);
    if (Number.isFinite(d)) el.style.setProperty('--d', String(d)); // CSSOM: permitido por la CSP
  });

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      const dd = e.target.querySelector('dd[data-count]');
      if (dd) countUp(dd);
      revealIO.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  $$('[data-reveal]').forEach((el) => revealIO.observe(el));

  /* Contador animado para las cifras de "Sobre mí" */
  function countUp(el) {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (!Number.isFinite(target) || !motionOK()) return;
    const start = performance.now();
    const dur = 1400;
    const step = (now) => {
      const t = clamp((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ======================================================================
     2. ESTADO GLOBAL + BUCLE DE ANIMACIÓN
     ====================================================================== */
  const nav = $('[data-nav]');
  const progressBar = $('[data-progress]');
  const hero = $('[data-hero]');
  const scene = $('[data-scene]');
  const arches = $$('.arch', scene || document);
  const motes = $$('.mote', scene || document);
  const depthEls = $$('[data-depth]');

  const state = {
    vh: innerHeight,
    heroTop: 0,
    heroH: 1,
    cam: 0,              // posición actual de la cámara (suavizada)
    pointer: { x: 0, y: 0 },   // puntero objetivo normalizado (-1..1)
    look: { x: 0, y: 0 },      // puntero suavizado
    lastP: -1,
  };

  /* ---------- Configuración de la escena del hero ---------- */
  const SPACING = 520;                                   // distancia entre arcos (px)
  const archZ = arches.map((_, i) => -i * SPACING);
  const CAM_MAX = (arches.length - 1) * SPACING + 260;   // la cámara termina frente al portal
  const archOpacity = arches.map(() => -1);

  arches.forEach((a, i) => a.style.setProperty('--z', archZ[i] + 'px'));

  // Motas distribuidas de forma determinista (sin Math.random: render estable)
  motes.forEach((m, i) => {
    const a = i * 2.39996;                               // ángulo áureo
    const r = 260 + (i % 3) * 140;
    m.style.setProperty('--x', Math.cos(a) * r + 'px');
    m.style.setProperty('--y', Math.sin(a) * r * 0.55 - 60 + 'px');
    m.style.setProperty('--z', -(400 + i * 560) + 'px');
  });

  function measure() {
    state.vh = innerHeight;
    if (hero) {
      const r = hero.getBoundingClientRect();
      state.heroTop = r.top + scrollY;
      state.heroH = hero.offsetHeight;
    }
  }

  /* ---------- Proyectos: escenarios 3D ---------- */
  const projects = $$('[data-project]').map((el) => ({
    el,
    stage: $('.project__stage', el),
    device: $('[data-tilt]', el),
    ghost: $('[data-ghost]', el),
    flip: el.classList.contains('project--flip') ? -1 : 1,
    active: false,
    hover: { x: 0, y: 0 },   // puntero objetivo dentro del escenario
    cur: { x: 0, y: 0 },     // suavizado
  }));

  // Solo se calculan los proyectos visibles
  const projIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const p = projects.find((x) => x.el === e.target);
      if (p) p.active = e.isIntersecting;
    });
    tick();
  }, { rootMargin: '20% 0px' });
  projects.forEach((p) => projIO.observe(p.el));

  // Tilt por puntero (solo dispositivos con ratón y si se permite movimiento)
  projects.forEach((p) => {
    if (!p.stage) return;
    p.stage.addEventListener('pointermove', (ev) => {
      if (!fineMQ.matches || !motionOK()) return;
      const r = p.stage.getBoundingClientRect();
      p.hover.x = (ev.clientX - r.left) / r.width - 0.5;
      p.hover.y = (ev.clientY - r.top) / r.height - 0.5;
      tick();
    });
    p.stage.addEventListener('pointerleave', () => { p.hover.x = 0; p.hover.y = 0; tick(); });
  });

  /* ---------- Bucle rAF bajo demanda ---------- */
  let raf = 0;
  function tick() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    const y = scrollY;
    const vh = state.vh;
    const motion = motionOK();
    let moving = false;

    // Barra de progreso + navegación sólida
    const docH = root.scrollHeight - vh;
    if (progressBar) progressBar.style.transform = `scaleX(${docH > 0 ? clamp(y / docH).toFixed(4) : 0})`;
    if (nav) nav.classList.toggle('is-solid', y > 24);

    // Puntero global suavizado
    state.look.x = lerp(state.look.x, state.pointer.x, 0.08);
    state.look.y = lerp(state.look.y, state.pointer.y, 0.08);
    if (Math.abs(state.look.x - state.pointer.x) > 0.001 || Math.abs(state.look.y - state.pointer.y) > 0.001) moving = true;

    /* ----- HERO ----- */
    if (hero && scene) {
      const range = Math.max(1, state.heroH - vh);
      const p = motion ? clamp((y - state.heroTop) / range) : 0;
      const heroVisible = y < state.heroTop + state.heroH;

      if (Math.abs(p - state.lastP) > 0.0005) {
        hero.style.setProperty('--p', p.toFixed(4));
        state.lastP = p;
      }

      if (heroVisible) {
        // Cámara con inercia: se desliza hacia su objetivo
        const camTarget = smooth(p) * CAM_MAX;
        state.cam = motion ? lerp(state.cam, camTarget, 0.11) : 0;
        if (Math.abs(state.cam - camTarget) > 0.5) moving = true;

        const lx = motion ? state.look.x : 0;
        const ly = motion ? state.look.y : 0;
        // El giro pivota sobre un punto ~700px delante de la cámara (efecto órbita, no "cabeceo")
        scene.style.transformOrigin = `50% 44% ${(-700 - state.cam).toFixed(1)}px`;
        scene.style.transform =
          `translate3d(${(-lx * 14).toFixed(2)}px, ${(-ly * 9).toFixed(2)}px, ${state.cam.toFixed(1)}px) ` +
          `rotateX(${(ly * 1.8).toFixed(3)}deg) rotateY(${(lx * 2.8).toFixed(3)}deg)`;

        // Opacidad por profundidad: aparecen en la niebla y se desvanecen al atravesarlos
        const last = arches.length - 1;
        arches.forEach((a, i) => {
          const z = archZ[i] + state.cam;
          const far = smooth((z + 3600) / 1500);
          const near = i === last ? 1 : 1 - smooth((z - 380) / 520);
          const o = Math.round(far * near * 1000) / 1000;
          if (o !== archOpacity[i]) {
            a.style.opacity = String(o);
            a.style.visibility = o < 0.01 ? 'hidden' : 'visible';
            archOpacity[i] = o;
          }
        });

        // Parallax del texto por capas (data-depth = px de desplazamiento)
        depthEls.forEach((el) => {
          const d = Number(el.dataset.depth) || 0;
          el.style.transform = `translate3d(${(lx * d).toFixed(2)}px, ${(ly * d).toFixed(2)}px, 0)`;
        });
      }
    }

    /* ----- PROYECTOS ----- */
    projects.forEach((pr) => {
      if (!pr.active || !pr.device) return;
      const r = pr.el.getBoundingClientRect();
      // t ≈ -1 (arriba) … 0 (centrado) … 1 (abajo)
      const t = clamp((r.top + r.height / 2 - vh / 2) / vh, -1.2, 1.2);

      pr.cur.x = lerp(pr.cur.x, pr.hover.x, 0.1);
      pr.cur.y = lerp(pr.cur.y, pr.hover.y, 0.1);
      if (Math.abs(pr.cur.x - pr.hover.x) > 0.001 || Math.abs(pr.cur.y - pr.hover.y) > 0.001) moving = true;

      const k = motion ? 1 : 0;
      // Al entrar, el escenario llega inclinado hacia atrás y se endereza al centrarse
      const rx = (t * 16 - pr.cur.y * 14) * k;
      const ry = (pr.flip * -8 + pr.flip * t * 10 + pr.cur.x * 18) * k;
      const ty = t * 36 * k;
      pr.device.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      pr.device.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      pr.device.style.setProperty('--ty', ty.toFixed(1) + 'px');

      if (pr.ghost) pr.ghost.style.setProperty('--gy', (t * -140 * k).toFixed(1) + 'px');
    });

    if (moving) tick();
  }

  /* ---------- Eventos ---------- */
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', () => { measure(); tick(); }, { passive: true });
  addEventListener('pointermove', (ev) => {
    if (!fineMQ.matches || !motionOK()) return;
    state.pointer.x = (ev.clientX / innerWidth) * 2 - 1;
    state.pointer.y = (ev.clientY / innerHeight) * 2 - 1;
    tick();
  }, { passive: true });
  reduceMQ.addEventListener?.('change', () => { measure(); state.lastP = -1; tick(); });
  // Las fuentes pueden cambiar la altura del documento: remedir al cargarlas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); tick(); });

  measure();
  tick();

  /* ======================================================================
     3. BOTONES MAGNÉTICOS (microinteracción)
     ====================================================================== */
  $$('[data-magnetic]').forEach((btn) => {
    btn.addEventListener('pointermove', (ev) => {
      if (!fineMQ.matches || !motionOK()) return;
      const r = btn.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      btn.style.setProperty('--mx', (dx * 0.22).toFixed(1) + 'px');
      btn.style.setProperty('--my', (dy * 0.32).toFixed(1) + 'px');
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.setProperty('--mx', '0px');
      btn.style.setProperty('--my', '0px');
    });
  });
})();
