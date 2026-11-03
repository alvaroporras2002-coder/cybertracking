export function getDayCompletion(day, state, bankReady = true) {
  const saved = state.days?.[day.id];
  const required = (day.resources || []).filter(resource => resource.required !== false && resource.optional !== true);
  const resourcesDone = required.filter(resource => saved?.resources?.[resource.id] === true).length;
  const resourcesReady = resourcesDone === required.length;
  const challengeReady = saved?.challengePassed === true;
  const quizPassed = (saved?.attempts || []).some(attempt => attempt.passed === true && Number(attempt.score) >= 80);
  const missing = [];
  if (!resourcesReady) missing.push('Marcar los recursos obligatorios');
  if (!bankReady) missing.push('Evaluación todavía no desarrollada');
  if (!challengeReady) missing.push('Aprobar el reto práctico');
  if (!quizPassed) missing.push(/d7$/.test(day.id) ? 'Aprobar la revisión semanal' : 'Aprobar la prueba diaria');
  return { completed: resourcesReady && bankReady && challengeReady && quizPassed, resourcesDone, resourcesTotal: required.length, resourcesReady, challengeReady, quizPassed, missing };
}
const readyFor = (bankReady, day) => typeof bankReady === 'function' ? bankReady(day.id) : typeof bankReady === 'object' && bankReady !== null ? Boolean(bankReady[day.id]) : bankReady;
export function getCurrentDay(days, state, bankReady = true) {
  return days.find(day => !getDayCompletion(day, state, readyFor(bankReady, day)).completed) || null;
}
export function getProgress(days, state, bankReady = true) {
  const completed = days.filter(day => getDayCompletion(day, state, readyFor(bankReady, day)).completed).length;
  let sequentialCompleted = 0;
  for (const day of days) { if (getDayCompletion(day, state, readyFor(bankReady, day)).completed) sequentialCompleted++; else break; }
  return { completed, total: days.length, percentage: days.length ? Math.round(completed / days.length * 100) : 0, sequentialCompleted, currentDay: days[sequentialCompleted] || null };
}
export function canStudy(dayId, days, state, bankReady = true) {
  const index = days.findIndex(day => day.id === dayId);
  if (index < 0) return false;
  for (let i = 0; i < index; i++) if (!getDayCompletion(days[i], state, readyFor(bankReady, days[i])).completed) return false;
  return true;
}
export function totalMinutes(state) { return Math.floor((state.studySessions || []).reduce((sum, session) => sum + session.durationMs, 0) / 60000); }
export function weeklyMinutes(state, at = new Date()) {
  const start = new Date(at); start.setHours(0, 0, 0, 0); const monday = (start.getDay() + 6) % 7; start.setDate(start.getDate() - monday);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return Math.floor((state.studySessions || []).filter(session => new Date(session.endedAt) >= start && new Date(session.endedAt) < end).reduce((sum, session) => sum + session.durationMs, 0) / 60000);
}
export function activityStreak(state, at = new Date()) {
  const dates = new Set((state.studySessions || []).filter(s => s.durationMs > 0).map(s => new Date(s.endedAt).toLocaleDateString('en-CA')));
  const cursor = new Date(at); cursor.setHours(12, 0, 0, 0);
  if (!dates.has(cursor.toLocaleDateString('en-CA'))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (dates.has(cursor.toLocaleDateString('en-CA'))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
