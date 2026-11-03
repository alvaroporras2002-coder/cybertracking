import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, matchesSearch, highlightText, searchWeeks, selectNotebookDays, recentNoteDays, selectLearnerNavigation } from '../assets/js/learner-tools.js';

const days = [
  { id: 'w01d1', title: 'Qué es una computadora', topics: ['Hardware y software'], resources: [{ title: 'Computer basics' }] },
  { id: 'w01d2', title: 'Diagnóstico del sistema', topics: ['Memoria y CPU'], resources: [{ title: 'Herramientas de diagnóstico' }] },
  { id: 'w01d3', title: 'Redes domésticas', topics: ['Dirección IP'], resources: [{ title: 'Ethernet' }] },
];
const ids = items => items.map(item => item.id);

test('search ignores case and composed or decomposed accents in either direction', () => {
  assert.equal(normalizeSearch('DIAGNÓSTICO'), 'diagnostico');
  assert.equal(normalizeSearch('Direccio\u0301n'), 'direccion');
  assert.ok(matchesSearch('Diagnóstico del sistema', 'DIAGNOSTICO'));
  assert.ok(matchesSearch('diagnostico', 'DIAGNÓSTICO'));
  assert.ok(matchesSearch('Direccio\u0301n IP', ' dirección '));
  assert.ok(!matchesSearch('Memoria', 'disco'));
});

test('highlight maps accents back to original characters and always escapes untrusted input', () => {
  assert.equal(highlightText('Diagnóstico y DIAGNOSTICO', 'diagnostico'), '<mark>Diagnóstico</mark> y <mark>DIAGNOSTICO</mark>');
  assert.equal(highlightText('🙂 Direccio\u0301n IP', 'direccion'), '🙂 <mark>Direccio\u0301n</mark> IP');
  assert.equal(highlightText('Cafe\u0301', 'cafe'), '<mark>Cafe\u0301</mark>');
  assert.equal(highlightText('<img src=x onerror="alert(1)">', '<img'), '<mark>&lt;img</mark> src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(highlightText('<script>danger</script>', 'missing'), '&lt;script&gt;danger&lt;/script&gt;');
  assert.equal(highlightText('<script>danger</script>', ''), '&lt;script&gt;danger&lt;/script&gt;');
  assert.equal(highlightText('aaaa', 'aa'), '<mark>aaaa</mark>');
});

test('week search exposes matching sessions across titles, topics and resources with stage filtering', () => {
  const weeks = [{ title: 'Fundamentos', stage: 'Base informática', days }, { title: 'Otra semana', stage: 'Seguridad', days: [{ id: 'w02d1', title: 'Amenazas', topics: [] }] }];
  assert.deepEqual(searchWeeks(weeks, { query: 'diagnostico' })[0].matchingDayIds, ['w01d2']);
  assert.deepEqual(searchWeeks(weeks, { query: 'direccion' })[0].matchingDayIds, ['w01d3']);
  assert.deepEqual(searchWeeks(weeks, { query: 'Computer basics' })[0].matchingDayIds, ['w01d1']);
  assert.equal(searchWeeks(weeks, { query: 'informatica' })[0].contextMatch, true);
  assert.equal(searchWeeks(weeks, { query: 'diagnostico', stage: 'Seguridad' }).length, 0);
  assert.equal(searchWeeks(weeks, { query: 'missing' }).length, 0);
  assert.equal(searchWeeks(weeks).length, 2);
  assert.deepEqual(searchWeeks(weeks)[0].matchingDayIds, []);
});

test('notebook includes favorites without notes and filters open doubts and evidence', () => {
  const state = { days: {
    w01d1: { favorite: true },
    w01d2: { doubts: [{ text: '¿Por qué?', resolved: true }] },
    w01d3: { doubts: [{ text: 'Cómo probar DNS', resolved: false }], evidence: [{ title: 'Captura', name: 'resolución.txt', content: 'Diagnóstico DNS seguro' }] },
  } };
  assert.deepEqual(ids(selectNotebookDays(days, state, { sort: 'course' })), ids(days));
  assert.deepEqual(ids(selectNotebookDays(days, state, { filter: 'favorites' })), ['w01d1']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { filter: 'open-doubts' })), ['w01d3']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { filter: 'evidence' })), ['w01d3']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { query: 'resolucion.txt' })), ['w01d3']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { query: 'diagnostico DNS' })), ['w01d3']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { query: 'por que' })), ['w01d2']);
});

test('recent notes use actual edit times rather than curriculum position or navigation', () => {
  const state = { days: {
    w01d1: { notes: 'Most recent edit', notesEditedAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
    w01d2: { notes: 'Earlier note', notesEditedAt: '2026-10-02T10:00:00Z', updatedAt: '2026-10-05T10:00:00Z' },
    w01d3: { notes: 'Legacy note', updatedAt: '2026-10-03T10:00:00Z' },
  } };
  const original = structuredClone(state);
  assert.deepEqual(ids(selectNotebookDays(days, state)), ['w01d1', 'w01d3', 'w01d2']);
  assert.deepEqual(ids(selectNotebookDays(days, state, { sort: 'oldest' })), ['w01d2', 'w01d3', 'w01d1']);
  assert.deepEqual(ids(recentNoteDays(days, state)), ['w01d1', 'w01d3']);
  assert.deepEqual(state, original);
  const undated = { days: { w01d1: { notes: 'Legacy A' }, w01d3: { notes: 'Legacy C' } } };
  assert.deepEqual(ids(selectNotebookDays(days, undated)), ['w01d1', 'w01d3']);
  assert.equal(undated.days.w01d1.notesEditedAt, undefined);
});

test('resume can point to a preview without moving the first pending lesson', () => {
  const state = { lastActivity: { dayId: 'w01d3', tab: 'notes', visitedAt: '2026-10-04T10:00:00Z' } };
  const nav = selectLearnerNavigation(days, state, day => day.id === 'w01d1');
  assert.equal(nav.nextDay, days[1]);
  assert.equal(nav.resumeDay, days[2]);
  assert.equal(nav.resumeTab, 'notes');
  assert.equal(nav.complete, false);
  assert.equal(nav.completed, 1);
  assert.equal(nav.total, 3);
});

test('complete course has no invented pending lesson and invalid activity is harmless', () => {
  const nav = selectLearnerNavigation(days, { lastActivity: { dayId: 'deleted', tab: 'quiz' } }, () => true);
  assert.equal(nav.nextDay, null);
  assert.equal(nav.complete, true);
  assert.equal(nav.resumeDay, null);
  assert.equal(nav.resumeTab, 'learn');
  assert.equal(selectLearnerNavigation(days, { lastActivity: { dayId: 'w01d1', tab: '<script>' } }, () => false).resumeTab, 'learn');
  assert.equal(selectLearnerNavigation([], {}, () => true).complete, false);
});
