/** Decorative effects only. No application state, measurements, or tracking. */
export function initMotion({ enabled = true } = {}) {
  const canvas = document.getElementById('particles');
  const query = value => typeof window.matchMedia === 'function' ? window.matchMedia(value) : { matches: false };
  const media = query('(prefers-reduced-motion: reduce)');
  const pointer = query('(hover: hover) and (pointer: fine)');
  const listenMedia = (target, callback) => {
    if (target.addEventListener) target.addEventListener('change', callback);
    else target.addListener?.(callback);
    return () => {
      if (target.removeEventListener) target.removeEventListener('change', callback);
      else target.removeListener?.(callback);
    };
  };
  const ctx = canvas?.getContext('2d');
  const raf = callback => requestAnimationFrame(callback);
  const cancel = handle => cancelAnimationFrame(handle);
  let desired = Boolean(enabled), frame = 0, width = 0, height = 0, last = 0;
  let points = [], currentRoot = null, pointerCleanup = null, destroyed = false;
  const counters = new Map();
  const entrances = new Set();
  function active() { return desired && !media.matches && !document.hidden && !destroyed; }
  function finishCounters() {
    for (const [element, record] of counters) { cancel(record.frame); element.textContent = record.final; }
    counters.clear();
  }
  function stopEntrances() { for (const animation of entrances) animation.cancel(); entrances.clear(); }
  function resize() {
    if (!canvas || !ctx) return;
    width = window.innerWidth; height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = width < 740 ? 14 : 32;
    points = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * .011, vy: -(Math.random() * .012 + .006),
      radius: Math.random() * 1.1 + .55, phase: Math.random() * Math.PI * 2, color: i % 3
    }));
  }
  function draw(time) {
    if (!active() || !ctx) { frame = 0; return; }
    frame = raf(draw); if (time - last < 1000 / 30) return;
    const delta = Math.min(time - last || 33, 60); last = time;
    ctx.clearRect(0, 0, width, height);
    const light = document.documentElement.dataset.theme === 'light';
    const colors = light ? ['105,91,212', '27,153,170', '211,111,109'] : ['165,151,255', '92,216,216', '245,163,151'];
    for (const p of points) {
      p.x += p.vx * delta; p.y += p.vy * delta;
      if (p.y < -5) p.y = height + 5; if (p.x < -5) p.x = width + 5; if (p.x > width + 5) p.x = -5;
      const opacity = (light ? .18 : .27) + Math.sin(time / 1900 + p.phase) * .07;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colors[p.color]},${opacity})`; ctx.fill();
    }
    if (width > 740) for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j], distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 130) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(${colors[0]},${(1 - distance / 130) * (light ? .09 : .12)})`;
      ctx.lineWidth = .65; ctx.stroke();
    }
  }
  function count(element) {
    const value = Number(element.dataset.count); if (!Number.isFinite(value)) return;
    const decimals = Math.max(0, Math.min(2, Number(element.dataset.countDecimals) || 0));
    const prefix = element.dataset.countPrefix || '', suffix = element.dataset.countSuffix || '';
    const format = n => `${prefix}${n.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    const final = format(value);
    if (!active() || value === 0) { element.textContent = final; return; }
    const record = { frame: 0, final }, start = performance.now();
    const tick = time => {
      if (!element.isConnected || !active()) { element.textContent = final; counters.delete(element); return; }
      const progress = Math.min(1, (time - start) / 700);
      element.textContent = format(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) record.frame = raf(tick); else { element.textContent = final; counters.delete(element); }
    };
    counters.set(element, record); record.frame = raf(tick);
  }
  function attachTilt(root) {
    pointerCleanup?.(); pointerCleanup = null;
    if (!root || !active() || !pointer.matches || window.innerWidth < 900) return;
    let target = null;
    const reset = () => { if (target) { target.style.removeProperty('--pointer-x'); target.style.removeProperty('--pointer-y'); target = null; } };
    const move = event => {
      const next = event.target.closest?.('[data-tilt], .hero-isometric');
      if (!next || !root.contains(next)) { reset(); return; }
      if (target && target !== next) reset(); target = next;
      const rect = next.getBoundingClientRect();
      next.style.setProperty('--pointer-x', `${((event.clientX - rect.left) / rect.width - .5) * 5}deg`);
      next.style.setProperty('--pointer-y', `${((event.clientY - rect.top) / rect.height - .5) * -4}deg`);
    };
    root.addEventListener('pointermove', move, { passive: true }); root.addEventListener('pointerleave', reset);
    pointerCleanup = () => { reset(); root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', reset); };
  }
  function refresh(root = document.getElementById('main-content')) {
    finishCounters(); stopEntrances(); currentRoot = root; if (!root) return;
    root.querySelectorAll('[data-count]').forEach(count);
    if (active()) {
      const cards = root.querySelectorAll('.command-hero, .welcome-strip, .chart-card, .card, .route-banner, .section-heading');
      [...cards].slice(0, 24).forEach((element, index) => {
        if (typeof element.animate !== 'function') return;
        const animation = element.animate([{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 480, delay: Math.min(index * 30, 280), easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'backwards' });
        entrances.add(animation); animation.onfinish = () => entrances.delete(animation);
      });
    }
    attachTilt(root);
  }
  function sync() {
    cancel(frame); frame = 0;
    document.documentElement.dataset.motion = desired && !media.matches ? 'on' : 'off';
    document.documentElement.dataset.visibility = document.hidden ? 'hidden' : 'visible';
    if (canvas) canvas.hidden = !desired || media.matches;
    if (active() && ctx) { last = 0; frame = raf(draw); }
    else { ctx?.clearRect(0, 0, width, height); finishCounters(); stopEntrances(); pointerCleanup?.(); pointerCleanup = null; }
  }
  const visibility = () => { sync(); if (!document.hidden) attachTilt(currentRoot); };
  const mediaChange = () => { sync(); if (active()) refresh(currentRoot); };
  const onResize = () => { resize(); sync(); attachTilt(currentRoot); };
  resize(); sync();
  window.addEventListener('resize', onResize, { passive: true }); document.addEventListener('visibilitychange', visibility);
  const removeMedia = listenMedia(media, mediaChange), removePointer = listenMedia(pointer, mediaChange);
  return {
    update(value) { const next = Boolean(value); if (destroyed || next === desired) return; desired = next; sync(); if (active()) refresh(currentRoot); },
    refresh,
    destroy() {
      destroyed = true; cancel(frame); finishCounters(); stopEntrances(); pointerCleanup?.();
      document.documentElement.dataset.motion = 'off';
      window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', visibility);
      removeMedia(); removePointer();
      ctx?.clearRect(0, 0, width, height);
    }
  };
}
