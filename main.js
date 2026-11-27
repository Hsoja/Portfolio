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

  /* ======================================================================
     5. MICRO-INTERACCIONES (solo mouse + movimiento permitido)
        Hover reveal · botón magnético · tilt 3D · spotlight.
        El subrayado animado de los enlaces es solo CSS.
        En táctil o con prefers-reduced-motion no se activa nada de esto.
     ====================================================================== */
  const fxOK = () => fineMQ.matches && motionOK();
  const lerp = (a, b, t) => a + (b - a) * t;
  const fx = new Set();          // efectos que siguen moviéndose
  let fxTicking = false;
  const fxFrame = () => {
    fxTicking = false;
    fx.forEach((step) => { if (!step()) fx.delete(step); });
    if (fx.size) fxRequest();
  };
  const fxRequest = () => {
    if (fxTicking) return;
    fxTicking = true;
    requestAnimationFrame(fxFrame);
  };
  const fxRun = (step) => { fx.add(step); fxRequest(); };
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const fxResets = [];           // cómo volver a reposo cada efecto

  /* 5.1 HOVER REVEAL: al pasar sobre el nombre de un proyecto aparece, en un
     círculo (clip-path) que sigue al cursor con lerp 0.2, una copia del mockup
     que ya tiene su tarjeta. No hay capturas nuevas: se reutiliza lo existente. */
  const peek = document.createElement('div');
  peek.className = 'peek';
  peek.setAttribute('aria-hidden', 'true');
  document.body.appendChild(peek);
  const peekPos = { x: 0, y: 0, tx: 0, ty: 0, h: 0, on: false };
  const TINT_VARS = ['--tint', '--tint-soft', '--tint-ink', '--tint-fill'];

  const peekStep = () => {
    peekPos.x = lerp(peekPos.x, peekPos.tx, 0.2);
    peekPos.y = lerp(peekPos.y, peekPos.ty, 0.2);
    peek.style.setProperty('--x', `${peekPos.x.toFixed(1)}px`);
    peek.style.setProperty('--y', `${peekPos.y.toFixed(1)}px`);
    return peekPos.on && !(near(peekPos.x, peekPos.tx) && near(peekPos.y, peekPos.ty));
  };
  const peekTarget = (e) => {
    peekPos.tx = e.clientX + 24;                 // arriba a la derecha del cursor: no tapa el nombre
    peekPos.ty = e.clientY - peekPos.h - 12;
  };
  const peekHide = () => {
    if (!peekPos.on) return;
    peekPos.on = false;
    peek.classList.remove('is-on');
  };

  $$('.case').forEach((card) => {
    const name = $('.case__name', card);
    const mock = $('.mock', card);
    if (!name || !mock) return;
    name.addEventListener('pointerenter', (e) => {
      if (!fxOK() || e.pointerType !== 'mouse') return;
      while (peek.firstChild) peek.removeChild(peek.firstChild);   // vaciar nodo a nodo, sin asignar HTML
      peek.appendChild(mock.cloneNode(true));
      const cs = getComputedStyle(card);
      TINT_VARS.forEach((v) => peek.style.setProperty(v, cs.getPropertyValue(v).trim()));
      peekPos.h = peek.offsetHeight;
      peekTarget(e);
      if (!peekPos.on) { peekPos.x = peekPos.tx; peekPos.y = peekPos.ty; }
      peekPos.on = true;
      peekStep();
      peek.classList.add('is-on');
    });
    name.addEventListener('pointermove', (e) => {
      if (!peekPos.on) return;
      peekTarget(e);
      fxRun(peekStep);
    }, { passive: true });
    name.addEventListener('pointerleave', peekHide);
  });
  window.addEventListener('scroll', peekHide, { passive: true });

  /* 5.2 BOTÓN MAGNÉTICO: solo "Ver proyectos" (hero) y el CTA principal de
     Contacto. El botón sigue al cursor ×0.3 y el texto va al revés ×-0.6. */
  const MAG_MAX = 12;   // px: sutil, nunca salta
  $$('.hero__cta > .btn--primary, .connect__btns > .btn--primary').forEach((btn) => {
    const inner = document.createElement('span');
    inner.className = 'mag__inner';
    while (btn.firstChild) inner.appendChild(btn.firstChild);    // mismo contenido, solo envuelto
    btn.appendChild(inner);
    btn.classList.add('is-magnetic');
    const m = { x: 0, y: 0, tx: 0, ty: 0 };
    const step = () => {
      m.x = lerp(m.x, m.tx, 0.2);
      m.y = lerp(m.y, m.ty, 0.2);
      btn.style.setProperty('--mx', `${m.x.toFixed(2)}px`);
      btn.style.setProperty('--my', `${m.y.toFixed(2)}px`);
      inner.style.setProperty('--tx', `${(m.x * -0.6).toFixed(2)}px`);
      inner.style.setProperty('--ty', `${(m.y * -0.6).toFixed(2)}px`);
      return !(near(m.x, m.tx) && near(m.y, m.ty));
    };
    btn.addEventListener('pointermove', (e) => {
      if (!fxOK() || e.pointerType !== 'mouse') return;
      const r = btn.getBoundingClientRect();
      m.tx = clamp((e.clientX - (r.left + r.width / 2)) * 0.3, -MAG_MAX, MAG_MAX);
      m.ty = clamp((e.clientY - (r.top + r.height / 2)) * 0.3, -MAG_MAX, MAG_MAX);
      fxRun(step);
    }, { passive: true });
    btn.addEventListener('pointerleave', () => { m.tx = 0; m.ty = 0; fxRun(step); });
    fxResets.push(() => { m.x = m.y = m.tx = m.ty = 0; step(); });
  });

  /* 5.3 TILT 3D: las 4 tarjetas de proyecto. El tope pedido es 12°; como estas
     tarjetas son grandes y tienen mucho texto, se usan 6° para que se lean bien.
     Para llegar al máximo, cambia TILT_MAX a 12. */
  const TILT_MAX = 6;
  const cases = $$('.case');
  cases.forEach((card) => {
    const t = { rx: 0, ry: 0, trx: 0, try: 0, rect: null };
    const step = () => {
      t.rx = lerp(t.rx, t.trx, 0.12);
      t.ry = lerp(t.ry, t.try, 0.12);
      card.style.setProperty('--rx', `${t.rx.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${t.ry.toFixed(2)}deg`);
      return !(near(t.rx, t.trx) && near(t.ry, t.try));
    };
    card.addEventListener('pointerenter', (e) => {
      if (!fxOK() || e.pointerType !== 'mouse') return;
      t.rect = card.getBoundingClientRect();
      card.classList.add('is-tilting');
    });
    card.addEventListener('pointermove', (e) => {
      if (!fxOK() || e.pointerType !== 'mouse') return;
      if (!t.rect) t.rect = card.getBoundingClientRect();
      const nx = clamp((e.clientX - t.rect.left) / t.rect.width, 0, 1) * 2 - 1;
      const ny = clamp((e.clientY - t.rect.top) / t.rect.height, 0, 1) * 2 - 1;
      t.try = nx * TILT_MAX;
      t.trx = -ny * TILT_MAX;
      fxRun(step);
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      t.trx = 0; t.try = 0; t.rect = null;
      card.classList.remove('is-tilting');
      fxRun(step);
    });
    window.addEventListener('scroll', () => { t.rect = null; }, { passive: true });
    fxResets.push(() => { t.rx = t.ry = t.trx = t.try = 0; step(); card.classList.remove('is-tilting'); });
  });

  /* 5.4 SPOTLIGHT: solo en "Sobre mí". Un resplandor azul claro sigue al
     cursor y resalta la tarjeta de debajo. No oscurece nada. */
  const about = $('#sobre-mi');
  if (about) {
    const aboutCards = $$('.about__list .card', about);
    const s = { x: 0, y: 0 };
    let sQueued = false;
    const paint = () => {
      sQueued = false;
      const r = about.getBoundingClientRect();
      about.style.setProperty('--sx', `${(s.x - r.left).toFixed(0)}px`);
      about.style.setProperty('--sy', `${(s.y - r.top).toFixed(0)}px`);
      aboutCards.forEach((c) => {
        const cr = c.getBoundingClientRect();
        c.style.setProperty('--gx', `${(s.x - cr.left).toFixed(0)}px`);
        c.style.setProperty('--gy', `${(s.y - cr.top).toFixed(0)}px`);
        const under = s.x >= cr.left && s.x <= cr.right && s.y >= cr.top && s.y <= cr.bottom;
        c.classList.toggle('is-under', under);
      });
    };
    about.addEventListener('pointermove', (e) => {
      if (!fxOK() || e.pointerType !== 'mouse') return;
      s.x = e.clientX; s.y = e.clientY;
      about.classList.add('is-lit');
      if (!sQueued) { sQueued = true; requestAnimationFrame(paint); }
    }, { passive: true });
    about.addEventListener('pointerleave', () => {
      about.classList.remove('is-lit');
      aboutCards.forEach((c) => c.classList.remove('is-under'));
    });
    fxResets.push(() => {
      about.classList.remove('is-lit');
      aboutCards.forEach((c) => c.classList.remove('is-under'));
    });
  }

  /* Si cambia la preferencia de movimiento o el tipo de puntero, todo vuelve a reposo */
  const fxResetAll = () => {
    if (fxOK()) return;
    fx.clear();
    peekHide();
    fxResets.forEach((reset) => reset());
  };
  fineMQ.addEventListener('change', fxResetAll);
  reduceMQ.addEventListener('change', fxResetAll);

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
