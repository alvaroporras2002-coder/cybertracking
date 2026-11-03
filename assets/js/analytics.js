import { getDayCompletion } from './progress.js';

// Dates are grouped by the learner's local calendar day. A "7 day" range is
// today and the six preceding days, including across DST/month boundaries.
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = value => new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(value);
const localKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const label = date => date.toLocaleDateString('es', { day: 'numeric', month: 'short' });

function validDate(value) {
  if (value == null || value === '' || (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function referenceDate(value) { return validDate(value) || new Date(); }

function calendarDays(count, now) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    date.setDate(date.getDate() - count + index + 1);
    return { key: localKey(date), label: label(date), date, minutes: 0, studyCount: 0, attemptCount: 0, events: 0 };
  });
}

function studyLogs(state, now) {
  const seen = new Set();
  return (Array.isArray(state?.studySessions) ? state.studySessions : []).flatMap(session => {
    const date = validDate(session?.endedAt);
    const duration = session?.durationMs;
    if (!date || date > now || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return [];
    const id = session.id ? `id:${session.id}` : `${session.dayId}|${date.toISOString()}|${duration}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, date, duration, dayId: session.dayId }];
  });
}

function recordedAttempts(state, days, now) {
  const titles = new Map(days.map(day => [day.id, day.title || day.name || day.id]));
  const seen = new Set();
  return Object.entries(state?.days || {}).flatMap(([dayId, saved]) => {
    return (Array.isArray(saved?.attempts) ? saved.attempts : []).flatMap(attempt => {
      const date = validDate(attempt?.submittedAt ?? attempt?.result?.submittedAt);
      const score = attempt?.score ?? attempt?.result?.percentage ?? attempt?.result?.score;
      if (!date || date > now || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) return [];
      const id = attempt.id ? `id:${attempt.id}` : `${dayId}|${date.toISOString()}|${score}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, dayId, title: titles.get(dayId) || dayId, score, passed: (attempt.passed ?? attempt.result?.passed) === true, submittedAt: date.toISOString(), date }];
    });
  }).sort((a, b) => a.date - b.date);
}

/** Time is the sum of positive, dated focus logs; tests add activity, not minutes. */
export function summarizeActivity(state = {}, { rangeDays = 7, now = new Date() } = {}) {
  now = referenceDate(now);
  rangeDays = rangeDays === 30 ? 30 : 7;
  const days = calendarDays(rangeDays, now);
  const heatmap = calendarDays(28, now);
  const rangeByKey = new Map(days.map(day => [day.key, day]));
  const heatByKey = new Map(heatmap.map(day => [day.key, day]));
  const logs = studyLogs(state, now);
  const attempts = recordedAttempts(state, [], now);
  const add = (date, kind, minutes = 0) => {
    const key = localKey(date);
    for (const bucket of [rangeByKey.get(key), heatByKey.get(key)]) {
      if (!bucket) continue;
      bucket.minutes += minutes;
      bucket[kind]++;
      bucket.events++;
    }
  };
  logs.forEach(log => add(log.date, 'studyCount', log.duration / 60000));
  attempts.forEach(attempt => add(attempt.date, 'attemptCount'));
  return { rangeDays, days, heatmap, totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0), activeDays: days.filter(day => day.events > 0).length, totalEvents: days.reduce((sum, day) => sum + day.events, 0) };
}

function learningSummary(days, state, banksReadyFn, now) {
  const attempts = recordedAttempts(state, days, now);
  // Completion shares the app's progress/unlock rules, including schema-1
  // backups whose passing attempts may lack timestamps. Dates only filter plots.
  const groups = new Map();
  let completed = 0;
  for (const day of days) {
    const ready = typeof banksReadyFn === 'function' ? banksReadyFn(day.id) : banksReadyFn !== false;
    const done = getDayCompletion(day, state, ready).completed;
    if (done) completed++;
    const name = String(day.stage?.name ?? day.stage?.title ?? day.stage ?? 'Ruta de aprendizaje');
    if (!groups.has(name)) groups.set(name, { name, completed: 0, total: 0, percentage: 0 });
    const stage = groups.get(name);
    stage.total++;
    if (done) stage.completed++;
  }
  const stages = [...groups.values()].map(stage => ({ ...stage, percentage: stage.total ? Math.round(stage.completed / stage.total * 100) : 0 }));
  return { completed, total: days.length, percentage: days.length ? Math.round(completed / days.length * 100) : 0, stages, attempts, averageScore: attempts.length ? attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length : null, latestScore: attempts.length ? attempts.at(-1).score : null };
}

export function summarizeLearning(days = [], state = {}, banksReadyFn = () => true) {
  return learningSummary(days, state, banksReadyFn, new Date());
}

function activityChart(activity) {
  const width = 640, height = 210, left = 38, right = 12, top = 18, bottom = 40;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(30, ...activity.days.map(day => day.minutes));
  const ceiling = Math.ceil(maximum / 30) * 30;
  const step = plotWidth / activity.days.length;
  const grid = [0, 0.5, 1].map(fraction => {
    const y = top + plotHeight * (1 - fraction);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="currentColor" opacity=".09"/><text class="axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${number(ceiling * fraction)}</text>`;
  }).join('');
  const bars = activity.days.map((day, index) => {
    const barHeight = plotHeight * day.minutes / ceiling;
    const x = left + step * index + step * 0.19;
    const showLabel = activity.rangeDays === 7 || index % 5 === 0 || index === activity.days.length - 1;
    return `<g><title>${escape(day.label)}: ${number(day.minutes)} minutos registrados</title><rect x="${x.toFixed(2)}" y="${(top + plotHeight - barHeight).toFixed(2)}" width="${(step * .62).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="${Math.min(5, step * .12)}" fill="var(--chart-indigo, #6558f5)"/>${showLabel ? `<text class="axis-label" x="${(left + step * (index + .5)).toFixed(2)}" y="${height - 13}" text-anchor="middle">${escape(day.label)}</text>` : ''}</g>`;
  }).join('');
  return `<section class="chart-card activity-chart"><div class="chart-heading"><div><h3>Tiempo de estudio</h3></div><div class="chart-controls" role="group" aria-label="Período del gráfico">${[7, 30].map(range => `<button type="button" data-action="chart-range" data-range="${range}" aria-pressed="${activity.rangeDays === range}">${range} días</button>`).join('')}</div></div><div class="chart-total"><strong>${number(activity.totalMinutes)}</strong> <span>minutos · ${activity.activeDays} días con actividad</span></div><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Minutos de estudio por día, últimos ${activity.rangeDays} días. Total: ${number(activity.totalMinutes)} minutos"><title>Tiempo registrado en minutos</title>${grid}${bars}<text class="axis-label" x="${left}" y="10">min</text></svg></div>${activity.totalMinutes === 0 ? '<p class="chart-empty">Registra tiempo de concentración para ver tu actividad.</p>' : ''}<div class="chart-legend"><span class="legend-dot" style="background:var(--chart-indigo, #6558f5)"></span> Tiempo del temporizador</div></section>`;
}

function completionChart(learning) {
  const circumference = 2 * Math.PI * 66;
  const fraction = learning.total ? learning.completed / learning.total : 0;
  return `<section class="chart-card"><div class="chart-heading"><div><h3>Tu recorrido</h3></div><span class="chart-badge">${learning.total} sesiones</span></div><div class="donut-wrap"><svg class="chart-svg" viewBox="0 0 200 200" role="img" aria-label="${learning.completed} de ${learning.total} sesiones superadas, ${learning.percentage} por ciento"><title>Sesiones superadas y pendientes</title><circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" opacity=".09" stroke-width="19"/><circle cx="100" cy="100" r="66" fill="none" stroke="var(--chart-indigo, #6558f5)" stroke-width="19" stroke-dasharray="${(circumference * fraction).toFixed(3)} ${circumference.toFixed(3)}" transform="rotate(-90 100 100)"/><text x="100" y="101" text-anchor="middle" fill="currentColor" font-size="30" font-weight="750">${learning.percentage}%</text><text class="axis-label" x="100" y="122" text-anchor="middle">del recorrido</text></svg></div><div class="chart-legend"><span><i class="legend-dot" style="background:var(--chart-indigo, #6558f5)"></i> ${learning.completed} superadas</span><span>${learning.total - learning.completed} pendientes</span></div><p class="chart-caption">Requiere recursos, reto y prueba aprobada.</p></section>`;
}

function heatmapChart(activity) {
  const colors = ['var(--heat-empty, #edf0f7)', 'var(--heat-level-1, #d9d3ff)', 'var(--heat-level-2, #a99af9)', 'var(--heat-level-3, #7c68ee)', 'var(--heat-level-4, #5141c6)'];
  const active = activity.heatmap.filter(day => day.events > 0).length;
  return `<section class="chart-card"><div class="chart-heading"><div><h3>Actividad</h3></div><span class="chart-badge">28 días</span></div><div class="chart-total"><strong>${active}</strong> <span>días con actividad</span></div><div class="heatmap" role="list" aria-label="Actividad de los últimos 28 días, de izquierda a derecha">${activity.heatmap.map(day => `<span class="heat-cell" role="listitem" data-level="${Math.min(day.events, 4)}" style="background:${colors[Math.min(day.events, 4)]}" aria-label="${escape(day.label)}: ${day.events} eventos" title="${escape(day.label)} · ${day.studyCount} registros de tiempo · ${day.attemptCount} evaluaciones"></span>`).join('')}</div><div class="chart-legend"><span>Sin actividad</span>${colors.map((color, index) => `<span class="heat-cell" aria-label="${index === 4 ? '4 o más' : index} eventos" style="background:${color}"></span>`).join('')}<span>4+ eventos</span></div><p class="chart-caption">Un evento: tiempo registrado o prueba enviada. Hoy: ${escape(activity.heatmap.at(-1).label)}.</p></section>`;
}

function scoresChart(learning) {
  const attempts = learning.attempts.slice(-10);
  const width = 560, height = 210, left = 40, right = 18, top = 20, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const points = attempts.map((attempt, index) => ({ x: attempts.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (attempts.length - 1), y: top + plotHeight * (1 - attempt.score / 100), attempt, index }));
  const svg = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Resultados de los últimos ${attempts.length} intentos, escala de 0 a 100 por ciento"><title>Resultados por intento en orden de envío</title>${[0, 50, 100].map(score => { const y = top + plotHeight * (1 - score / 100); return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".09"/><text class="axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${score}%</text>`; }).join('')}${points.length > 1 ? `<polyline class="spark-line" points="${points.map(point => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="var(--chart-cyan, #11a6b4)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}${points.map(point => `<g><title>${escape(point.attempt.title)} · ${escape(label(point.attempt.date))}: ${number(point.attempt.score)}%</title><circle cx="${point.x}" cy="${point.y}" r="5" fill="var(--chart-cyan, #11a6b4)"/><text class="axis-label" x="${point.x}" y="${height - 10}" text-anchor="middle">${point.index + 1}</text></g>`).join('')}</svg>`;
  return `<section class="chart-card"><div class="chart-heading"><div><h3>Resultados de evaluación</h3></div></div>${attempts.length ? `<div class="chart-total"><strong>${number(learning.latestScore)}%</strong> <span>último intento · promedio histórico ${number(learning.averageScore)}%</span></div><div class="chart-scroll">${svg}</div><div class="chart-legend"><span class="legend-dot" style="background:var(--chart-cyan, #11a6b4)"></span> Últimos ${attempts.length} intentos · orden cronológico</div>` : '<div class="chart-empty"><p>Envía una prueba para ver tus resultados.</p></div>'}<p class="chart-caption">Pruebas internas · un punto por intento.</p></section>`;
}

function stagesChart(learning) {
  return `<section class="chart-card stage-map"><div class="chart-heading"><div><h3>Avance por etapa</h3></div></div><div class="stage-list">${learning.stages.map((stage, index) => `<div class="stage-step"><div class="stage-info"><span class="stage-number">${String(index + 1).padStart(2, '0')}</span><strong>${escape(stage.name)}</strong><span>${stage.completed}/${stage.total}</span></div><div class="stage-progress" role="progressbar" aria-label="${escape(stage.name)}" aria-valuemin="0" aria-valuemax="${stage.total}" aria-valuenow="${stage.completed}" aria-valuetext="${stage.completed} de ${stage.total} sesiones superadas"><span style="width:${stage.percentage}%"></span></div></div>`).join('')}</div></section>`;
}

/** HTML only: charts use local state, never demo points or guessed competency. */
export function renderAnalytics(state = {}, days = [], { rangeDays = 7, now = new Date(), banksReadyFn = () => true, compact = false } = {}) {
  now = referenceDate(now);
  const activity = summarizeActivity(state, { rangeDays, now });
  const learning = learningSummary(days, state, banksReadyFn, now);
  return `<div class="data-grid analytics-grid">${activityChart(activity)}${completionChart(learning)}${compact ? '' : `${scoresChart(learning)}${heatmapChart(activity)}${stagesChart(learning)}`}</div>`;
}
