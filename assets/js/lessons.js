const isText = (value, maximum = 30000) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const isList = (value, minimum = 1, maximum = 30) => Array.isArray(value) && value.length >= minimum && value.length <= maximum;
const strings = (value, minimum = 1, maximum = 30) => isList(value, minimum, maximum) && value.every(item => isText(item));
const visualTypes = new Set(['flow', 'compare', 'layers', 'cycle', 'timeline']);
const fail = message => { throw new Error(`La clase no es válida: ${message}.`); };

function validateVisual(visual) {
  if (!visual || !visualTypes.has(visual.type) || !isText(visual.title) || !isText(visual.caption) || !isList(visual.items, 3, 6) || visual.items.some(item => !item || !isText(item.label, 200) || !isText(item.detail, 3000))) fail('diagrama incompleto');
}

/** Validate a complete week before exposing any of its lessons to the app. */
export function validateLessonWeek(value, expectedWeek) {
  if (!expectedWeek || !value || value.week !== expectedWeek.number || value.title !== expectedWeek.title || !isText(value.version, 40) || !isText(value.overview) || !strings(value.objectives, 3, 8) || !isList(value.sources, 1, 20) || !isList(value.days, expectedWeek.days.length, expectedWeek.days.length)) fail('semana o cobertura incompleta');
  const sourceIds = new Set();
  for (const source of value.sources) {
    if (!source || !isText(source.id, 100) || sourceIds.has(source.id) || !isText(source.title, 500)) fail('referencia incompleta');
    let url; try { url = new URL(source.url); } catch { fail('enlace de referencia'); }
    if (url.protocol !== 'https:' || url.username || url.password) fail('enlace de referencia no permitido');
    sourceIds.add(source.id);
  }
  for (const [index, day] of value.days.entries()) {
    const expected = expectedWeek.days[index];
    if (!day || day.dayId !== expected.id || day.title !== expected.title || !isText(day.lead) || !isList(day.sections, expected.topics.length, expected.topics.length)) fail('sesión o temas diferentes al programa');
    for (const [topicIndex, section] of day.sections.entries()) {
      if (!section || section.topic !== expected.topics[topicIndex] || !strings(section.explanation, 2, 8) || !isText(section.analogy) || !strings(section.keyPoints, 3, 8)) fail(`explicación incompleta en ${day.dayId}`);
      validateVisual(section.visual);
    }
    const example = day.workedExample;
    if (!example || !isText(example.title) || !isText(example.scenario) || !isText(example.result) || !isList(example.steps, 3, 8) || example.steps.some(step => !step || !isText(step.action) || !isText(step.reason) || !isText(step.result))) fail(`ejemplo incompleto en ${day.dayId}`);
    validateVisual(example.visual);
    const practice = day.practice;
    if (!practice || !isText(practice.task) || !strings(practice.steps, 3, 12) || !isText(practice.expected)) fail(`práctica incompleta en ${day.dayId}`);
    if (practice.console && (!isText(practice.console.language, 60) || !isText(practice.console.code) || !isText(practice.console.output) || !isText(practice.console.explanation))) fail('ejemplo de consola incompleto');
    const check = day.check;
    if (!check || !isText(check.question) || !isList(check.options, 3, 6) || !isText(check.explanation)) fail('comprobación incompleta');
    const optionIds = new Set();
    for (const option of check.options) {
      if (!option || !/^[a-zA-Z0-9_-]{1,40}$/.test(option.id) || optionIds.has(option.id) || !isText(option.text)) fail('opciones de comprobación');
      optionIds.add(option.id);
    }
    if (!optionIds.has(check.correct)) fail('respuesta de comprobación desconocida');
    if (!isList(day.mistakes, 1, 8) || day.mistakes.some(item => !item || !isText(item.myth) || !isText(item.correction)) || !strings(day.recap, 3, 8) || !isList(day.glossary, 2, 12) || day.glossary.some(item => !item || !isText(item.term, 200) || !isText(item.definition, 3000))) fail('repaso o vocabulario incompleto');
  }
  return value;
}

/** Static authored lessons: no AI calls or progress mutations at runtime. */
export function createLessonLibrary(curriculum, { fetcher = (...args) => fetch(...args), baseUrl = new URL('../../data/lessons/', import.meta.url) } = {}) {
  const loaded = new Map(), requests = new Map();
  const expected = new Map((curriculum?.weeks || []).map(week => [week.number, week]));
  async function loadWeek(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || !expected.has(number)) throw new Error('La semana solicitada no existe.');
    if (loaded.has(number)) return loaded.get(number);
    if (!requests.has(number)) {
      const request = (async () => {
        const response = await fetcher(new URL(`week-${String(number).padStart(2, '0')}.json?v=2.0.0`, baseUrl));
        if (!response.ok) throw new Error('No se pudo cargar la clase. Comprueba tu conexión y vuelve a intentarlo.');
        const checked = validateLessonWeek(await response.json(), expected.get(number));
        loaded.set(number, checked);
        return checked;
      })();
      requests.set(number, request);
      request.catch(() => { if (requests.get(number) === request) requests.delete(number); });
    }
    return requests.get(number);
  }
  return {
    loadWeek,
    getWeek: number => loaded.get(Number(number)) || null,
    getDay(dayId) {
      if (!/^w(?:0[1-9]|[1-4]\d|5[0-2])d[1-7]$/.test(dayId)) return null;
      return loaded.get(Number(dayId.slice(1, 3)))?.days.find(day => day.dayId === dayId) || null;
    }
  };
}
