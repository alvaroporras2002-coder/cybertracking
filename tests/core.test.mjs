import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, ensureDay, validateState } from '../assets/js/storage.js';
import { getDayCompletion, getCurrentDay, canStudy, getProgress } from '../assets/js/progress.js';
import { createAttempt, scoreAttempt, evaluateChallenge } from '../assets/js/assessments.js';
import { exportBackup, parseBackup, mergeStates } from '../assets/js/backup.js';
const day = { id: 'w01d1', resources: [{ id: 'r1', required: true }, { id: 'r2', required: false }] };
function bank() { return { dayId: 'w01d1', questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i}`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'], explanation: 'Reason', reference: 'https://example.com' })) }; }
test('resources alone do not complete day or bypass practical', () => {
  const state = createDefaultState(); const saved = ensureDay(state, day.id); saved.resources.r1 = true;
  assert.equal(getDayCompletion(day, state).completed, false);
  saved.attempts.push({ id: 'a', score: 100, passed: true });
  assert.equal(getDayCompletion(day, state).completed, false);
  saved.challengePassed = true; assert.equal(getDayCompletion(day, state).completed, true);
  assert.equal(getDayCompletion(day, state, false).completed, false);
});
test('unlock only next sequential day', () => {
  const state = createDefaultState(); const days = [day, { id: 'w01d2', resources: [] }, { id: 'w01d3', resources: [] }];
  assert.equal(canStudy('w01d2', days, state), false);
  Object.assign(ensureDay(state, day.id), { resources: { r1: true }, challengePassed: true, attempts: [{ id: 'a', score: 100, passed: true }] });
  assert.equal(getCurrentDay(days, state).id, 'w01d2');
  assert.equal(canStudy('w01d2', days, state), true); assert.equal(canStudy('w01d3', days, state), false);
  assert.equal(getProgress(days, state).completed, 1);
});
test('quiz randomized snapshots score by option IDs', () => {
  const attempt = createAttempt(bank()); assert.equal(attempt.questions.length, 6);
  const answers = Object.fromEntries(attempt.questions.map(q => [q.id, ['a']]));
  assert.equal(scoreAttempt(attempt, answers).score, 100);
  answers[attempt.questions[0].id] = ['b']; assert.equal(scoreAttempt(attempt, answers).passed, true);
  answers[attempt.questions[1].id] = ['b']; assert.equal(scoreAttempt(attempt, answers).passed, false);
});
test('multi-select is all or nothing', () => {
  const challenge = { correct: ['a', 'c'], explanation: 'Choose both' };
  assert.equal(evaluateChallenge(challenge, ['c', 'a']).passed, true);
  assert.equal(evaluateChallenge(challenge, ['a']).passed, false);
  assert.equal(evaluateChallenge(challenge, ['a', 'b', 'c']).passed, false);
});
test('invalid and future backups reject without mutating original', () => {
  const state = createDefaultState(); const original = structuredClone(state);
  assert.throws(() => validateState({ ...state, schemaVersion: 99 }), /futura/);
  assert.throws(() => parseBackup('{not json'), /JSON/);
  assert.deepEqual(state, original);
});
test('complete backup round-trip preserves attachment bytes and attempts', async () => {
  const state = createDefaultState(); const saved = ensureDay(state, day.id);
  saved.notes = 'A note'; saved.attempts = [{ id: 'try1', score: 83, passed: true }];
  saved.evidence = [{ id: 'f1', name: 'proof.txt', size: 3, type: 'text/plain', dataUrl: 'data:text/plain;base64,YWJj' }];
  const blob = exportBackup(state); const restored = parseBackup(await blob.text());
  assert.deepEqual(restored.days, state.days);
  assert.equal(restored.days.w01d1.evidence[0].dataUrl, 'data:text/plain;base64,YWJj');
});
test('text and link evidence survive complete backup without masquerading as a file', async () => {
  const state = createDefaultState();
  ensureDay(state, day.id).evidence.push({id:'text1',title:'My lab',content:'https://example.com/lab',type:'text'});
  const restored = parseBackup(await exportBackup(state).text());
  assert.equal(restored.days.w01d1.evidence[0].content,'https://example.com/lab');
  assert.equal(restored.days.w01d1.evidence[0].dataUrl,undefined);
});
test('merge retains both notes and deduplicates attempts', () => {
  const a = createDefaultState(), b = createDefaultState();
  const da = ensureDay(a, day.id), db = ensureDay(b, day.id);
  da.notes = 'Local note'; db.notes = 'Backup note';
  da.attempts = [{ id: 'same', score: 100, passed: true }]; db.attempts = [{ id: 'same', score: 100, passed: true }, { id: 'new', score: 40, passed: false }];
  db.resources.r1 = true;
  const merged = mergeStates(a, b);
  assert.match(merged.days.w01d1.notes, /Local note/); assert.match(merged.days.w01d1.notes, /Backup note/);
  assert.equal(merged.days.w01d1.attempts.length, 2); assert.equal(merged.days.w01d1.resources.r1, true);
  assert.equal(a.days.w01d1.notes, 'Local note');
});
test('reject unsafe imported keys and inconsistent attachment length', () => {
  const state = createDefaultState();
  const unsafe = JSON.parse(JSON.stringify(state).replace('"days":{}', '"days":{"__proto__":{}}'));
  assert.throws(() => validateState(unsafe), /claves/);
  ensureDay(state, day.id).evidence.push({ id: 'bad', name: 'bad.txt', size: 50, dataUrl: 'data:text/plain;base64,YWJj' });
  assert.throws(() => validateState(state), /tamaño/);
});
test('malformed imported quiz snapshots are rejected before a view can crash', () => {
  const state = createDefaultState();
  const saved = ensureDay(state, day.id);
  saved.draft = { id:'draft', questions:'not-an-array', answers:{} };
  assert.throws(() => validateState(state), /borrador/);
  saved.draft = createAttempt(bank());
  assert.doesNotThrow(() => validateState(state));
  saved.draft.questions[0].options = null;
  assert.throws(() => validateState(state), /pregunta/);
});
