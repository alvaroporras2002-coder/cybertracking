import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDefaultState, ensureDay, validateState } from '../assets/js/storage.js';
import { createAttempt, evaluateChallenge, scoreAttempt } from '../assets/js/assessments.js';
import { canStudy, getCurrentDay, getProgress } from '../assets/js/progress.js';
import { loadCurriculum } from '../assets/js/resources.js';

const dataUrl = new URL('../data/', import.meta.url);
const readJson = async url => JSON.parse(await readFile(url, 'utf8'));

test('a learner can cross week four and complete the entire course using the shipped assessments', async () => {
  const curriculum = await readJson(new URL('curriculum.json', dataUrl));
  const days = curriculum.weeks.flatMap(week => week.days);
  const weeks = await Promise.all(curriculum.weeks.map(week => readJson(new URL(`assessments/week-${String(week.number).padStart(2,'0')}.json`, dataUrl))));
  const banks = new Map(weeks.flatMap(week => week.days.map(day => [day.dayId, day])));
  const ready = id => banks.has(id);
  const state = createDefaultState();
  for (const [index, day] of days.entries()) {
    assert.equal(getCurrentDay(days, state, ready)?.id, day.id);
    assert.equal(canStudy(day.id, days, state, ready), true);
    if (index === 28) {
      assert.equal(day.id, 'w05d1', 'the first lesson after the original block must be available');
      assert.equal(canStudy('w05d2', days, state, ready), false, 'new banks must not bypass the completion requirements');
    }
    const bank = banks.get(day.id);
    const saved = ensureDay(state, day.id);
    saved.resources = Object.fromEntries(day.resources.map(resource => [resource.id, true]));
    saved.challengePassed = evaluateChallenge(bank.challenge, bank.challenge.correct).passed;
    const attempt = createAttempt(bank);
    const answers = Object.fromEntries(attempt.questions.map(question => [question.id, question.correct]));
    const result = scoreAttempt(attempt, answers);
    assert.equal(result.passed, true, day.id);
    saved.attempts.push({...attempt, answers, score: result.score, passed: result.passed, submittedAt: result.submittedAt});
  }
  assert.equal(getCurrentDay(days, state, ready), null);
  assert.equal(getProgress(days, state, ready).percentage, 100);
  assert.equal(getProgress(days, state, ready).completed, 364);
  assert.equal(validateState(state).days.w52d7.attempts.length, 1, 'new attempts remain compatible with the existing backup schema');
});

test('the production loader fetches only requested weeks, shares requests and retries failures without exposing partial banks', async t => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let failSix = true, corruptSeven = true;
  globalThis.fetch = async value => {
    const url = new URL(value);
    calls.push(url.pathname);
    if (url.pathname.endsWith('week-06.json') && failSix) {
      failSix = false;
      return {ok: false, status: 503};
    }
    const data = await readJson(fileURLToPath(url));
    if (url.pathname.endsWith('week-07.json') && corruptSeven) {
      corruptSeven = false;
      data.days[3].challenge = null;
    }
    return {ok: true, status: 200, json: async () => data};
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const {banks, loadBank} = await loadCurriculum();
  assert.equal(calls.length, 2, 'startup downloads the curriculum and a small readiness index');
  assert.equal(banks.size, 364);
  assert.equal([...banks.values()].filter(bank => bank.loaded).length, 0);
  const [daily, weekly] = await Promise.all([loadBank('w05d1'), loadBank('w05d7')]);
  assert.equal(daily.loaded, true);
  assert.ok(daily.questions.length >= 8 && weekly.questions.length >= 20);
  assert.equal(calls.filter(path => path.endsWith('week-05.json')).length, 1);
  assert.equal([...banks.values()].filter(bank => bank.loaded).length, 7);
  await loadBank('w05d2');
  assert.equal(calls.length, 3, 'a second lesson in the same week uses the validated in-memory bank');
  await assert.rejects(loadBank('w06d1'), /cargar la prueba/);
  assert.equal(banks.get('w06d1').loaded, false);
  assert.equal((await loadBank('w06d1')).loaded, true);
  await assert.rejects(loadBank('w07d1'), /no es válida/);
  assert.equal(banks.get('w07d1').loaded, false, 'a corrupt week must not partly replace the readiness entries');
  assert.equal((await loadBank('w07d1')).loaded, true);
  await assert.rejects(loadBank('w99d1'), /no existe/);
});
