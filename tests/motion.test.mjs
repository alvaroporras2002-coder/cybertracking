import test from 'node:test';
import assert from 'node:assert/strict';
import { initMotion } from '../assets/js/motion.js';

function browserFixture({ reduced = false, animationSupport = true } = {}) {
  const nodes = new Set(), animations = [];
  class Emitter {
    listeners = new Map();
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatch(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback(event); }
    listenerCount(type) { return this.listeners.get(type)?.size || 0; }
  }
  class Element extends Emitter {
    constructor(tag = 'button', { editable = false, disabled = false } = {}) {
      super(); this.tag = tag; this.editable = editable; this.disabled = disabled;
      this.attributes = {}; this.dataset = {}; this.isConnected = true;
      this.style = { setProperty() {}, removeProperty() {} };
      if (!animationSupport) this.animate = undefined;
    }
    closest(selector) {
      if (selector.startsWith('input,textarea,select,')) return ['input', 'textarea', 'select'].includes(this.tag) || this.editable ? this : null;
      if (selector === 'button,a,summary') return ['button', 'a', 'summary'].includes(this.tag) ? this : null;
      return null;
    }
    matches(selector) { return selector === this.tag; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getBoundingClientRect() { return { left: 10, top: 20, width: 120, height: 44 }; }
    querySelectorAll() { return []; }
    contains() { return true; }
    focus() { throw new Error('Decorative effects must not move input focus'); }
    remove() { this.isConnected = false; nodes.delete(this); }
    animate(frames, options) {
      const record = {
        element: this, frames, options, cancelled: false,
        cancel() { this.cancelled = true; this.oncancel?.(); },
        finish() { this.onfinish?.(); }
      };
      animations.push(record); return record;
    }
  }
  const media = new Emitter(); media.matches = reduced;
  const pointer = new Emitter(); pointer.matches = true;
  const win = new Emitter();
  Object.assign(win, { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, matchMedia: query => query.includes('reduced-motion') ? media : pointer });
  const doc = new Emitter();
  Object.assign(doc, {
    hidden: false, documentElement: { dataset: {} }, getElementById: () => null,
    createElement: tag => new Element(tag), body: { append(element) { nodes.add(element); } }
  });
  const globals = { window: win, document: doc, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const motion = initMotion({ enabled: true });
  function interaction(target, extra = {}) {
    const calls = { prevented: 0, stopped: 0 };
    return { target, clientX: 64, clientY: 48, detail: 1, button: 0,
      preventDefault() { calls.prevented++; }, stopPropagation() { calls.stopped++; }, calls, ...extra };
  }
  function cleanup() {
    motion.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
  return { motion, doc, win, media, pointer, Element, nodes, animations, interaction, cleanup };
}

test('pointer and keyboard feedback preserve native actions and leave editable or disabled controls alone', () => {
  const f = browserFixture();
  try {
    const root = new f.Element('main');
    for (let i = 0; i < 5; i++) f.motion.refresh(root);
    assert.equal(f.doc.listenerCount('click'), 1, 'route refresh must not duplicate delegated click listeners');
    assert.equal(f.doc.listenerCount('pointerdown'), 1);
    assert.equal(root.listenerCount('pointermove'), 1, 'route refresh must replace the old tilt listener');
    const button = new f.Element('button');
    const event = f.interaction(button);
    f.doc.dispatch('pointerdown', event); f.doc.dispatch('click', event);
    assert.deepEqual(event.calls, { prevented: 0, stopped: 0 });
    assert.equal(f.animations.filter(a => a.element === button).length, 1);
    assert.equal(f.nodes.size, 1);
    assert.equal([...f.nodes][0].attributes['aria-hidden'], 'true');
    const keyboard = f.interaction(new f.Element('a'), { detail: 0, clientX: 0, clientY: 0 });
    f.doc.dispatch('click', keyboard);
    const keyboardRipple = [...f.nodes].at(-1);
    assert.equal(keyboardRipple.style.left, '38px', 'keyboard feedback must use the control center');
    assert.equal(keyboardRipple.style.top, '10px');
    assert.deepEqual(keyboard.calls, { prevented: 0, stopped: 0 });
    const before = f.animations.length;
    const disabled = new f.Element('button', { disabled: true });
    const ariaDisabled = new f.Element('a'); ariaDisabled.setAttribute('aria-disabled', 'true');
    for (const target of [new f.Element('input'), new f.Element('textarea'), new f.Element('select'), new f.Element('div', { editable: true }), disabled, ariaDisabled]) {
      const event = f.interaction(target);
      f.doc.dispatch('pointerdown', event); f.doc.dispatch('click', event);
      assert.deepEqual(event.calls, { prevented: 0, stopped: 0 });
    }
    assert.equal(f.animations.length, before, 'typing, selection and disabled controls must not trigger effects');
    for (const animation of [...f.animations]) animation.finish();
    assert.equal(f.nodes.size, 0, 'completed ripples must be removed');
  } finally { f.cleanup(); }
});

test('reduced motion, hidden pages and destroy stop feedback and remove listeners', () => {
  const f = browserFixture({ reduced: true });
  try {
    const root = new f.Element('main'), button = new f.Element('button');
    f.motion.refresh(root);
    const activate = () => { const event = f.interaction(button); f.doc.dispatch('pointerdown', event); f.doc.dispatch('click', event); };
    activate(); assert.equal(f.animations.length, 0);
    assert.equal(f.doc.documentElement.dataset.motion, 'off');
    f.media.matches = false; f.media.dispatch('change'); activate();
    assert.ok(f.nodes.size > 0);
    f.doc.hidden = true; f.doc.dispatch('visibilitychange');
    assert.equal(f.nodes.size, 0, 'hidden pages must remove in-flight ripples');
    assert.ok(f.animations.every(animation => animation.cancelled));
    const count = f.animations.length; activate();
    assert.equal(f.animations.length, count);
    f.doc.hidden = false; f.doc.dispatch('visibilitychange'); activate();
    assert.ok(f.nodes.size > 0);
    f.media.matches = true; f.media.dispatch('change');
    assert.equal(f.nodes.size, 0, 'system reduced motion must cancel in-flight feedback');
    const afterReduced = f.animations.length; activate(); assert.equal(f.animations.length, afterReduced);
    f.motion.destroy();
    for (const type of ['click', 'pointerdown', 'visibilitychange']) assert.equal(f.doc.listenerCount(type), 0);
    assert.equal(f.win.listenerCount('resize'), 0);
    assert.equal(f.media.listenerCount('change'), 0); assert.equal(f.pointer.listenerCount('change'), 0);
    assert.equal(root.listenerCount('pointermove'), 0); assert.equal(root.listenerCount('pointerleave'), 0);
    assert.equal(f.nodes.size, 0);
    f.motion.update(true); activate(); assert.equal(f.animations.length, afterReduced);
  } finally { f.cleanup(); }
});

test('browsers without the Web Animations API do not leave orphaned ripple elements', () => {
  const f = browserFixture({ animationSupport: false });
  try {
    const event = f.interaction(new f.Element('button'));
    f.doc.dispatch('pointerdown', event); f.doc.dispatch('click', event);
    assert.equal(f.animations.length, 0); assert.equal(f.nodes.size, 0);
    assert.deepEqual(event.calls, { prevented: 0, stopped: 0 });
  } finally { f.cleanup(); }
});
