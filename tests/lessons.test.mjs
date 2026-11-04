import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonLibrary, validateLessonWeek } from '../assets/js/lessons.js';
import { renderLessonDiagram, renderProfessorLesson, lessonCheckFeedback } from '../assets/js/lessons-ui.js';

function fixture(number = 1) {
  const prefix = `w${String(number).padStart(2, '0')}`;
  const expected = { number, title: `Week ${number}`, days: Array.from({ length: 7 }, (_, index) => ({ id: `${prefix}d${index + 1}`, title: `Day ${index + 1}`, topics: [`Topic ${index + 1}`] })) };
  const visual = { type: 'flow', title: 'Observe, compare, verify', items: [{ label: 'Observe', detail: 'Record the input.' }, { label: 'Compare', detail: 'Check the expected state.' }, { label: 'Verify', detail: 'Repeat the observation.' }], caption: 'Order matters for this example.' };
  const value = {
    version: '2.0.0', week: number, title: expected.title, overview: 'A teaching overview.', objectives: ['Observe', 'Compare', 'Verify'], sources: [{ id: 'official', title: 'Official reference', url: 'https://learn.microsoft.com/' }],
    days: expected.days.map(day => ({ dayId: day.id, title: day.title, lead: 'Learn from a concrete observation.', sections: [{ topic: day.topics[0], explanation: ['An original explanation of the concept.', 'A second explanation applies it to a specific situation.'], analogy: 'An analogy with its limits.', keyPoints: ['One', 'Two', 'Three'], visual: structuredClone(visual) }], workedExample: { title: 'A resolved example', scenario: 'Observe a test machine.', steps: Array.from({ length: 3 }, (_, index) => ({ action: `Action ${index + 1}`, reason: 'This separates facts from guesses.', result: `Observed state ${index + 1}` })), result: 'The evidence supports this result.', visual: structuredClone(visual) }, practice: { task: 'Try a different input.', steps: ['Prepare', 'Observe', 'Record'], expected: 'A result that can be checked.', console: { language: 'text', code: 'show <input>', output: '<output>', explanation: 'This is a fictitious output.' } }, check: { question: 'Which is an observation?', options: [{ id: 'a', text: 'An unsupported conclusion' }, { id: 'b', text: 'The recorded result' }, { id: 'c', text: 'A guess' }], correct: 'b', explanation: 'An observation can be reproduced.' }, mistakes: [{ myth: 'A guess is proof.', correction: 'Record an observation first.' }], recap: ['Explain the input.', 'Explain the method.', 'Explain the limit.'], glossary: [{ term: 'Observation', definition: 'A recorded state.' }, { term: 'Hypothesis', definition: 'An explanation to test.' }] }))
  };
  return { expected, value };
}

test('the authored lesson loader fetches only the requested week, shares pending requests and caches complete lessons', async () => {
  const first = fixture(1), last = fixture(52); let calls = 0, release;
  const library = createLessonLibrary({ weeks: [first.expected, last.expected] }, { baseUrl: 'https://example.com/lessons/', fetcher: async url => {
    calls++; assert.match(url.href, /week-52\.json/); await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => last.value };
  } });
  const one = library.loadWeek(52), two = library.loadWeek('52');
  assert.equal(calls, 1); assert.equal(library.getWeek(1), null); assert.equal(library.getDay('w52d1'), null, 'nothing is exposed before full validation');
  release(); assert.equal(await one, await two);
  assert.equal(library.getDay('w52d7').dayId, 'w52d7');
  await library.loadWeek(52); assert.equal(calls, 1, 'cached lessons do not need another network call');
  await assert.rejects(library.loadWeek('../1'), /no existe/);
  assert.equal(library.getDay('unknown'), null);
});

test('invalid or unavailable authored weeks expose no partial day and can be retried', async () => {
  const { expected, value } = fixture(); let mode = 'network', calls = 0;
  const library = createLessonLibrary({ weeks: [expected] }, { fetcher: async () => {
    calls++; if (mode === 'network') return { ok: false };
    const data = structuredClone(value); if (mode === 'invalid') data.days[6].sections = [];
    return { ok: true, json: async () => data };
  } });
  await assert.rejects(library.loadWeek(1), /conexión/); assert.equal(library.getWeek(1), null);
  mode = 'invalid'; await assert.rejects(library.loadWeek(1), /temas/); assert.equal(library.getDay('w01d1'), null);
  mode = 'valid'; await library.loadWeek(1); assert.equal(library.getDay('w01d1').title, 'Day 1'); assert.equal(calls, 3);
});

test('lesson validation ties every topic to the curriculum and rejects incomplete models or unsafe source links', () => {
  const { expected, value } = fixture(); assert.equal(validateLessonWeek(value, expected), value);
  for (const edit of [data => { data.days[0].sections[0].topic = 'Another topic'; }, data => { data.days[0].workedExample.steps[1].reason = ''; }, data => { data.days[0].check.correct = 'missing'; }, data => { data.sources[0].url = 'javascript:alert(1)'; }, data => { data.days[6].sections[0].visual.items[2] = null; }]) {
    const data = structuredClone(value); edit(data); assert.throws(() => validateLessonWeek(data, expected), /clase no es válida/);
  }
});

test('teaching diagrams and worked examples escape content while retaining accessible topic navigation and reference steps', () => {
  const { value } = fixture(); const lesson = value.days[0]; lesson.sections[0].explanation[0] = '<script>do-not-run</script>'; lesson.sections[0].visual.items[0].label = '<img src=x onerror=bad>';
  const html = renderProfessorLesson(lesson, { week: 1, sources: value.sources });
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;script&gt;do-not-run&lt;/script&gt;'));
  assert.match(html, /data-lesson-anchor="lesson-w01d1-topic-0"/); assert.match(html, /aria-labelledby="lesson-w01d1-diagram-0-title"/);
  assert.match(html, /Por qué:/); assert.match(html, /Qué obtienes:/); assert.match(html, /&lt;input&gt;/); assert.match(html, /lesson-check-form/);
  assert.match(html, /href="#day\/w01d1\/resources"/); assert.match(html, /href="#week\/01\/w01d1"/);
  const compare = renderLessonDiagram({ ...lesson.sections[0].visual, type: 'compare' }, 'comparison');
  assert.ok(!compare.includes('diagram-connector'), 'comparison categories must not imply an ordered transmission');
  const cycle = renderLessonDiagram({ ...lesson.sections[0].visual, type: 'cycle' }, 'cycle');
  assert.match(cycle, /Vuelve al primer paso/); assert.ok(!compare.includes('diagram-return'));
});

test('formative checks explain both correct and incorrect decisions without modifying lesson or learner records', () => {
  const { value } = fixture(); const lesson = value.days[0], original = structuredClone(lesson);
  assert.equal(lessonCheckFeedback(lesson, '').valid, false);
  assert.equal(lessonCheckFeedback(lesson, 'a').correct, false);
  const correct = lessonCheckFeedback(lesson, 'b'); assert.equal(correct.correct, true); assert.match(correct.text, /An observation can be reproduced/);
  assert.deepEqual(lesson, original);
});
