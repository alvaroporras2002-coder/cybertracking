import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActivity, summarizeLearning, renderAnalytics } from '../assets/js/analytics.js';
import { getDayCompletion, canStudy } from '../assets/js/progress.js';

const now = new Date(2026, 2, 10, 14, 0, 0);
const at = (offset, hour = 12) => new Date(2026, 2, 10 + offset, hour, 0, 0).toISOString();
const log = (id, offset, minutes, hour) => ({ id, durationMs: minutes * 60000, endedAt: at(offset, hour), dayId: 'w01d1' });
const attempt = (id, score, submittedAt = '2025-01-01T12:00:00Z') => ({ id, score, passed: score >= 80, submittedAt });
const day = { id: 'w01d1', title: 'Computer basics', stage: 'Fundamentals', resources: [{ id: 'r1' }] };

test('empty activity has calendar buckets without invented time or events', () => {
  const result = summarizeActivity({}, { now });
  assert.equal(result.days.length, 7);
  assert.equal(result.heatmap.length, 28);
  assert.equal(result.totalMinutes, 0);
  assert.equal(result.activeDays, 0);
  assert.ok(result.days.every(item => item.minutes === 0 && item.events === 0));
});

test('7 day window includes local midnight boundary and excludes preceding dates', () => {
  const result = summarizeActivity({ studySessions: [log('start', -6, 15, 0), log('old', -7, 80), log('today', 0, 20)] }, { now });
  assert.equal(result.days[0].key, '2026-03-04');
  assert.equal(result.days.at(-1).key, '2026-03-10');
  assert.equal(result.totalMinutes, 35);
  assert.equal(result.activeDays, 2);
  assert.equal(result.heatmap.reduce((sum, item) => sum + item.minutes, 0), 115);
});

test('invalid, negative, future logs and duplicates never inflate measurements', () => {
  const repeated = log('same', 0, 10);
  const state = { studySessions: [repeated, { ...repeated }, log('negative', 0, -5), log('future', 1, 10), log('later-today', 0, 10, 18), { id: 'bad', durationMs: 60000, endedAt: 'not-a-date' }, { id: 'infinite', durationMs: Infinity, endedAt: at(0) }, { id: 'zero', durationMs: 0, endedAt: at(0) }] };
  const result = summarizeActivity(state, { now });
  assert.equal(result.totalMinutes, 10);
  assert.equal(result.totalEvents, 1);
});

test('30 day range spans month boundary and tests count events without adding minutes', () => {
  const state = { studySessions: [log('early', -29, 8), log('outside', -30, 99)], days: { w01d1: { attempts: [attempt('test', 90, at(-1)), attempt('test', 90, at(-1)), attempt('bad-score', 101, at(-1)), attempt('future-test', 90, at(1))] } } };
  const result = summarizeActivity(state, { rangeDays: 30, now });
  assert.equal(result.days[0].key, '2026-02-09');
  assert.equal(result.totalMinutes, 8);
  assert.equal(result.activeDays, 2);
  assert.equal(result.totalEvents, 2);
  assert.equal(result.heatmap.find(item => item.key === '2026-03-09').attemptCount, 1);
});

test('read resources or study minutes alone never claim completed curriculum', () => {
  const state = { studySessions: [log('hours', 0, 120)], days: { w01d1: { resources: { r1: true }, challengePassed: true, attempts: [] } } };
  const result = summarizeLearning([day], state);
  assert.equal(result.completed, 0);
  assert.equal(result.percentage, 0);
  assert.equal(result.averageScore, null);
  assert.equal(result.latestScore, null);
});

test('completion respects all app gates and score average includes weekly reattempts', () => {
  const weekly = { id: 'w01d7', title: 'Weekly review', stage: 'Fundamentals', resources: [] };
  const state = { days: { w01d1: { resources: { r1: true }, challengePassed: true, attempts: [attempt('one', 100), attempt('two', 40, '2025-01-02T12:00:00Z')] }, w01d7: { resources: {}, challengePassed: true, attempts: [attempt('weekly', 80, '2025-01-03T12:00:00Z')] } } };
  const result = summarizeLearning([day, weekly], state);
  assert.equal(result.completed, 2);
  assert.equal(result.averageScore, 220 / 3);
  assert.equal(result.latestScore, 80);
  assert.deepEqual(result.stages, [{ name: 'Fundamentals', completed: 2, total: 2, percentage: 100 }]);
  assert.equal(summarizeLearning([day, weekly], state, id => id !== 'w01d7').completed, 1);
});

test('undated, future or impossible results do not create timeline score points', () => {
  const state = { days: { w01d1: { resources: { r1: true }, challengePassed: true, attempts: [attempt('bad-time', 100, 'invalid'), attempt('future', 100, '2999-01-01T00:00:00Z'), attempt('no-time', 100, null), attempt('negative', -2), attempt('too-high', 200)] } } };
  const result = summarizeLearning([day], state);
  assert.equal(result.attempts.length, 0);
  assert.equal(result.averageScore, null);
});

test('legacy undated passing attempts match completion and unlock rules', () => {
  const next = { id: 'w01d2', resources: [], stage: 'Fundamentals' };
  const state = { days: { w01d1: { resources: { r1: true }, challengePassed: true, attempts: [{ id: 'legacy', score: 100, passed: true }] } } };
  const result = summarizeLearning([day, next], state);
  assert.equal(getDayCompletion(day, state).completed, true);
  assert.equal(canStudy(next.id, [day, next], state), true);
  assert.equal(result.completed, 1);
  assert.equal(result.stages[0].completed, 1);
  assert.equal(result.attempts.length, 0);
  assert.equal(result.averageScore, null);
});

test('render escapes curriculum labels, exposes ranges and keeps empty chart honest', () => {
  const unsafeDay = { ...day, title: '<img src=x onerror=alert(1)>', stage: '<script>alert(1)</script>' };
  const state = { days: { w01d1: { resources: {}, attempts: [attempt('a', 50, at(-1))] } } };
  const html = renderAnalytics(state, [unsafeDay], { now, rangeDays: 30 });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-range="30" aria-pressed="true"/);
  assert.match(html, /data-range="7" aria-pressed="false"/);
  assert.match(html, /aria-label="Minutos de estudio por día/);
  const empty = renderAnalytics({}, Array.from({ length: 364 }, (_, index) => ({ id: `d${index}`, resources: [] })), { now });
  assert.match(empty, /0 de 364 sesiones superadas/);
  assert.match(empty, /Envía una prueba para ver tus resultados\./);
  assert.ok(!empty.includes('<polyline'));
});

test('summaries do not mutate imported state or curriculum objects', () => {
  const state = { days: { w01d1: { resources: { r1: true }, challengePassed: true, attempts: [attempt('complete', 90)] } }, studySessions: [log('study', 0, 20)] };
  const copy = structuredClone(state);
  const days = [structuredClone(day)];
  const dayCopy = structuredClone(days);
  summarizeActivity(state, { now });
  summarizeLearning(days, state);
  renderAnalytics(state, days, { now });
  assert.deepEqual(state, copy);
  assert.deepEqual(days, dayCopy);
});

test('scrollable charts have named keyboard regions and equivalent data tables', () => {
  const unsafeTitle = 'DNS <img src=x onerror=alert(1)>';
  const state = { studySessions: [log('morning', 0, 12), log('afternoon', 0, 23)], days: { w01d1: { attempts: [attempt('score', 85, at(-1))] } } };
  const html = renderAnalytics(state, [{ ...day, title: unsafeTitle }], { now });
  for (const id of ['activity-scroll-help', 'scores-scroll-help']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`class="chart-scroll" role="region" tabindex="0" aria-label="[^"]+" aria-describedby="${id}"`));
  }
  assert.equal((html.match(/<summary>Ver datos en tabla<\/summary>/g) || []).length, 2);
  const activity = html.slice(html.indexOf('<section class="chart-card activity-chart">'), html.indexOf('</section>'));
  assert.match(activity, /<th scope="row">2026-03-10<\/th><td>35<\/td><td>2<\/td><td>0<\/td>/);
  assert.match(activity, /<th scope="row">2026-03-09<\/th><td>0<\/td><td>0<\/td><td>1<\/td>/);
  assert.match(html, /<th scope="row">1<\/th><td>DNS &lt;img src=x onerror=alert\(1\)&gt;<\/td>/);
  assert.match(html, /<td>85%<\/td><td>Aprobada<\/td>/);
  assert.ok(!html.includes('<img'));
  assert.match(activity, /Tiempo registrado<\/div>/, 'manual and timed logs share the same honest label');
});
