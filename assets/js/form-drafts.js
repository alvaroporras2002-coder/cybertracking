/** Recoverable, browser-local form edits. Only explicit input events call set(). */
export function createFormDrafts({ read, write, onStatus = () => {}, delay = 350, setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date().toISOString() }) {
  const drafts = new Map();
  let queue = Promise.resolve();
  const clone = value => value == null ? null : structuredClone(value);
  const same = (a, b) => {
    const keys = Object.keys(a || {}), other = Object.keys(b || {});
    return keys.length === other.length && keys.every(key => a[key] === b[key]);
  };
  function get(key) { return clone(drafts.get(key)?.record || read(key) || null); }
  function set(key, values) {
    if (!key) return;
    const next = { ...values };
    if (same(next, get(key)?.values)) return;
    let draft = drafts.get(key);
    if (!draft) { draft = { version: 0, timer: null, running: null, error: null }; drafts.set(key, draft); }
    clearTimer(draft.timer);
    draft.record = { values: next, updatedAt: now() };
    draft.version++; draft.error = null;
    onStatus(key, 'pending');
    draft.timer = setTimer(() => { save(key).catch(() => {}); }, delay);
  }
  async function save(key) {
    const draft = drafts.get(key);
    if (!draft) return;
    clearTimer(draft.timer); draft.timer = null;
    if (draft.running) { await draft.running; return save(key); }
    const version = draft.version, record = clone(draft.record);
    onStatus(key, 'saving');
    const result = queue.then(() => write(key, record));
    queue = result.catch(() => {});
    draft.running = result;
    try {
      await result;
      draft.running = null;
      if (drafts.get(key) !== draft) return;
      if (draft.version !== version) return save(key);
      drafts.delete(key); onStatus(key, 'saved');
    } catch (error) {
      draft.running = null; draft.error = error;
      onStatus(key, 'error', error);
      throw error;
    }
  }
  async function flush() {
    // A different form can receive input while an earlier write is awaiting
    // storage. A navigation barrier drains those new keys too.
    while (drafts.size) await Promise.all([...drafts.keys()].map(save));
  }
  function forget(key) {
    const draft = drafts.get(key);
    // A submitter first flushes, then deletes its persisted record in the same
    // transaction as the real save. Never let a late write resurrect it.
    if (draft?.running) throw new Error('Espera a guardar el borrador antes de completar el formulario.');
    clearTimer(draft?.timer); drafts.delete(key);
  }
  return { set, get, flush, forget, pending: () => drafts.size > 0, error: key => drafts.get(key)?.error || null };
}
