/* ==========================================================================
   Hsoja · Portafolio — interacciones suaves
   - Sin dependencias, sin eval, sin innerHTML, sin red, sin almacenamiento.
   - Un único bucle requestAnimationFrame que solo corre mientras algo se mueve.
   - Todo el movimiento usa transform/opacity y se desactiva con prefers-reduced-motion.
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

  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
  const motionOK = () => !reduceMQ.matches;

  /* ======================================================================
     1. REVELADO AL HACER SCROLL (fade-up suave)
     ====================================================================== */
  const revealEls = $$('[data-reveal]');
  revealEls.forEach((el) => {
    const d = Number(el.dataset.delay || 0);
    if (Number.isFinite(d)) el.style.setProperty('--d', String(clamp(d, 0, 8))); // CSSOM: permitido por la CSP
  });

  if (!motionOK() || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ======================================================================
     2. NAVEGACIÓN: sombra al hacer scroll + sección activa
     ====================================================================== */
  const nav = $('[data-nav]');
  const links = $$('[data-nav-link]');

    const shadow = () => { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8); };
  shadow();
  window.addEventListener('scroll', shadow, { passive: true });

  if ('IntersectionObserver' in window && links.length) {
    const map = new Map();
    links.forEach((a) => {
      const id = (a.getAttribute('href') || '').slice(1);
      const sec = id ? document.getElementById(id) : null;
      if (sec) map.set(sec, a);
    });
    const setActive = (link) => {
      links.forEach((a) => {
        const on = a === link;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    };
    const onScrollNav = () => {
      if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
      if (window.scrollY < 240) setActive(null);   // arriba del todo: ningún enlace activo
    };
    onScrollNav();
    window.addEventListener('scroll', onScrollNav, { passive: true });
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting && window.scrollY >= 240) setActive(map.get(entry.target)); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, sec) => spy.observe(sec));
  }

  /* ======================================================================
     3. HERO: parallax MUY sutil (scroll + puntero) con un solo rAF
     ====================================================================== */
  const hero = $('#top');
  const layers = $$('[data-depth]', hero || document).map((el) => ({
    el,
    depth: Number(el.dataset.depth) || 0,
    x: 0, y: 0,
  })).filter((l) => Number.isFinite(l.depth) && l.depth > 0);

  const pointer = { x: 0, y: 0 };
  let ticking = false;

  const frame = () => {
    ticking = false;
    if (!hero || !motionOK()) return;
    const scroll = clamp(window.scrollY, 0, hero.offsetHeight * 1.3);
    let moving = false;
    layers.forEach((l) => {
      const tx = fineMQ.matches ? pointer.x * l.depth * 0.35 : 0;
      const ty = -scroll * l.depth * 0.0012 + (fineMQ.matches ? pointer.y * l.depth * 0.2 : 0);
      l.x += (tx - l.x) * 0.08;
      l.y += (ty - l.y) * 0.08;
      if (Math.abs(tx - l.x) > 0.05 || Math.abs(ty - l.y) > 0.05) moving = true;
      l.el.style.setProperty('--px', `${l.x.toFixed(2)}px`);
      l.el.style.setProperty('--py', `${l.y.toFixed(2)}px`);
    });
    if (moving) request();
  };
  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };

  if (hero && layers.length) {
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('pointermove', (e) => {
      if (!fineMQ.matches || !motionOK()) return;
      pointer.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
      pointer.y = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
      request();
    }, { passive: true });
    request();
  }

  /* ======================================================================
     4. AVATAR: micro-interacción (la sartén salta al pasar o tocar)
     ====================================================================== */
  const avatar = $('[data-avatar]');
  if (avatar) {
    const pan = $('.avatar__pan', avatar);
    const cook = () => {
      if (!motionOK() || avatar.classList.contains('is-cooking')) return;
      avatar.classList.add('is-cooking');
    };
    if (pan) pan.addEventListener('animationend', () => avatar.classList.remove('is-cooking'));
    avatar.addEventListener('pointerenter', cook);
    avatar.addEventListener('pointerdown', cook);
  }

  /* Los cambios de preferencia de movimiento aplican al instante */
  reduceMQ.addEventListener('change', () => {
    if (!motionOK()) {
      revealEls.forEach((el) => el.classList.add('is-in'));
      layers.forEach((l) => { l.el.style.removeProperty('--px'); l.el.style.removeProperty('--py'); });
    } else {
      request();
    }
  });
})();
