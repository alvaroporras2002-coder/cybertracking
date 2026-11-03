/** A separate recoverable draft per lesson. Persistence failures never discard text. */
export function createNoteDrafts({ read, write, onStatus = () => {}, delay = 350, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const drafts = new Map();
  function value(id) { return drafts.get(id)?.text ?? read(id) ?? ''; }
  function set(id, text) {
    if (!id) return;
    text = String(text);
    let draft = drafts.get(id);
    if (!draft && text === (read(id) || '')) return;
    if (!draft) { draft = { text, version: 0, timer: null, running: null, error: null }; drafts.set(id, draft); }
    clearTimer(draft.timer);
    draft.text = text; draft.version++; draft.error = null;
    onStatus(id, 'pending');
    draft.timer = setTimer(() => { save(id).catch(() => {}); }, delay);
  }
  async function save(id) {
    let draft = drafts.get(id);
    if (!draft) return;
    clearTimer(draft.timer); draft.timer = null;
    if (draft.running) { await draft.running; return save(id); }
    const version = draft.version, text = draft.text;
    onStatus(id, 'saving');
    draft.running = Promise.resolve().then(() => write(id, text));
    try {
      await draft.running;
      draft.running = null;
      if (draft.version !== version) return save(id);
      drafts.delete(id); onStatus(id, 'saved');
    } catch (error) {
      draft.running = null; draft.error = error;
      onStatus(id, 'error', error);
      throw error;
    }
  }
  async function flush() { await Promise.all([...drafts.keys()].map(save)); }
  return { set, value, save, flush, pending: () => drafts.size > 0, error: id => drafts.get(id)?.error || null };
}
