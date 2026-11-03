import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormDrafts } from '../assets/js/form-drafts.js';
import { createDefaultState, ensureDay, validateState } from '../assets/js/storage.js';
import { exportBackup, parseBackup, mergeStates } from '../assets/js/backup.js';

function fixture(writer) {
  const saved = new Map(), timers = new Map(), statuses = []; let id = 0;
  const drafts = createFormDrafts({
    read: key => saved.get(key), write: writer || (async (key, record) => saved.set(key, record)),
    onStatus: (...args) => statuses.push(args), now: () => '2026-11-03T12:00:00.000Z',
    setTimer: callback => { timers.set(++id, callback); return id; }, clearTimer: id => timers.delete(id)
  });
  return { drafts, saved, timers, statuses };
}

test('independent secondary forms survive a navigation flush without treating untouched values as edits', async () => {
  const { drafts, saved, timers } = fixture();
  saved.set('settings', { values: { name: 'Original', weeklyMinutes: '720' }, updatedAt: '2026-11-02T00:00:00.000Z' });
  drafts.set('settings', { name: 'Original', weeklyMinutes: '720' });
  assert.equal(drafts.pending(), false);
  drafts.set('doubt:w01d1', { text: 'Why does this route fail?' });
  drafts.set('evidence:w01d2', { title: 'Lab', content: 'https://example.com/proof' });
  assert.equal(timers.size, 2);
  await drafts.flush();
  assert.equal(saved.get('doubt:w01d1').values.text, 'Why does this route fail?');
  assert.equal(saved.get('evidence:w01d2').values.content, 'https://example.com/proof');
  assert.equal(drafts.pending(), false);
  const returned = drafts.get('evidence:w01d2'); returned.values.title = 'Modified outside manager';
  assert.equal(drafts.get('evidence:w01d2').values.title, 'Lab');
});

test('failed persistence keeps the latest form input recoverable and retries all pending forms', async () => {
  const saved = new Map(); let fail = true;
  const { drafts } = fixture(async (key, record) => { if (key === 'profile' && fail) throw new Error('Quota unavailable'); saved.set(key, record); });
  drafts.set('profile', { name: 'Álvaro' }); drafts.set('manual-time', { minutes: '35', note: 'DNS lab' });
  await assert.rejects(drafts.flush(), /Quota unavailable/);
  assert.equal(drafts.get('profile').values.name, 'Álvaro');
  assert.match(drafts.error('profile').message, /Quota/);
  fail = false; await drafts.flush();
  assert.equal(saved.get('manual-time').values.minutes, '35');
  assert.equal(saved.get('profile').values.name, 'Álvaro');
  assert.equal(drafts.pending(), false);
});

test('writes serialize and an edit during a write persists before flush completes', async () => {
  let release, running = 0, maximum = 0; const writes = [], saved = new Map();
  const { drafts } = fixture(async (key, record) => {
    maximum = Math.max(maximum, ++running);
    if (record.values.text === 'Earlier') await new Promise(resolve => { release = resolve; });
    saved.set(key, record); writes.push(record.values.text); running--;
  });
  drafts.set('doubt:w01d1', { text: 'Earlier' });
  const first = drafts.flush(); await Promise.resolve();
  drafts.set('doubt:w01d1', { text: 'Latest' }); drafts.set('doubt:w02d1', { text: 'Separate lesson' });
  assert.throws(() => drafts.forget('doubt:w01d1'), /Espera/);
  release(); await first;
  assert.equal(drafts.pending(), false, 'the navigation flush also drains a form first edited during persistence');
  assert.equal(maximum, 1); assert.equal(saved.get('doubt:w01d1').values.text, 'Latest');
  assert.deepEqual(writes.filter(text => text !== 'Separate lesson'), ['Earlier', 'Latest']);
  // Submitters delete persisted data atomically with their actual save, then
  // forget local memory. Flushing afterwards must never re-create the draft.
  saved.delete('doubt:w01d1'); drafts.forget('doubt:w01d1'); await drafts.flush();
  assert.equal(drafts.get('doubt:w01d1'), null);
});

test('legacy schema-1 backups and optional form metadata round-trip without migration', async () => {
  const legacy = createDefaultState();
  assert.doesNotThrow(() => validateState(legacy));
  const state = createDefaultState(); ensureDay(state, 'w01d1').notesEditedAt = '2026-11-03T12:00:00.000Z';
  state.lastActivity = { dayId: 'w01d1', tab: 'notes', visitedAt: '2026-11-03T12:01:00.000Z' };
  state.formDrafts = { 'evidence:w01d1': { values: { title: 'Lab', content: 'https://example.com' }, updatedAt: '2026-11-03T12:02:00.000Z' } };
  assert.deepEqual(parseBackup(await exportBackup(state).text()), state);
  for (const mutate of [s => { s.formDrafts['evidence:w01d1'].values.title = 12; }, s => { s.formDrafts['evidence:w01d1'].updatedAt = 'invalid'; }, s => { s.lastActivity.tab = 'unknown'; }, s => { s.days.w01d1.notesEditedAt = 'yesterday'; }]) {
    const invalid = structuredClone(state); mutate(invalid); assert.throws(() => validateState(invalid));
  }
  const unsafe = structuredClone(state); unsafe.formDrafts = JSON.parse('{"constructor":{"values":{},"updatedAt":"2026-11-03T12:00:00Z"}}');
  assert.throws(() => validateState(unsafe), /claves/);
});

test('backup merge chooses actual latest draft/activity and preserves real note edit timestamps', () => {
  const local = createDefaultState(), incoming = createDefaultState();
  const oldTime = '2026-10-01T12:00:00.000Z', newTime = '2026-11-03T12:00:00.000Z';
  Object.assign(ensureDay(local, 'w01d1'), { notes: 'Local text', notesEditedAt: newTime });
  Object.assign(ensureDay(incoming, 'w01d1'), { notes: 'Backup text', notesEditedAt: oldTime });
  local.formDrafts = { profile: { values: { name: 'Latest name' }, updatedAt: newTime } };
  incoming.formDrafts = { profile: { values: { name: 'Old name' }, updatedAt: oldTime }, cert: { values: { notes: 'Recovered goal' }, updatedAt: oldTime } };
  local.lastActivity = { dayId: 'w02d1', tab: 'practice', visitedAt: newTime };
  incoming.lastActivity = { dayId: 'w01d1', tab: 'learn', visitedAt: oldTime };
  const merged = mergeStates(local, incoming);
  assert.equal(merged.formDrafts.profile.values.name, 'Latest name');
  assert.equal(merged.formDrafts.cert.values.notes, 'Recovered goal');
  assert.deepEqual(merged.lastActivity, local.lastActivity);
  assert.equal(merged.days.w01d1.notesEditedAt, newTime);
  assert.match(merged.days.w01d1.notes, /Backup text/);
  assert.equal(local.formDrafts.cert, undefined);
});
