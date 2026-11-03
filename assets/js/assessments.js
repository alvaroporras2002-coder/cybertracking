const uid = () => globalThis.crypto?.randomUUID?.() || `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function exactSelection(actual, expected) {
  const a = [...new Set(Array.isArray(actual) ? actual : actual == null ? [] : [actual])].sort();
  const b = [...new Set(Array.isArray(expected) ? expected : [expected])].sort();
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
export function createAttempt(bank, options = {}) {
  if (!bank || !Array.isArray(bank.questions) || !bank.questions.length) throw new Error('Esta evaluación todavía no está disponible.');
  const isWeekly = /d7$/.test(bank.dayId || '');
  const count = Math.min(options.count ?? (isWeekly ? 15 : 6), bank.questions.length);
  const questions = shuffled(bank.questions).slice(0, count).map(q => ({ ...structuredClone(q), options: shuffled(q.options) }));
  return { id: uid(), dayId: bank.dayId, version: bank.version || '1.0.0', startedAt: new Date().toISOString(), questions, answers: {}, submitted: false };
}
export function scoreAttempt(attempt, answers = attempt.answers || {}) {
  if (!attempt?.questions?.length) throw new Error('El intento no contiene preguntas.');
  const results = attempt.questions.map(question => ({
    questionId: question.id, correct: exactSelection(answers[question.id], question.correct),
    selected: answers[question.id] || [], expected: question.correct,
    explanation: question.explanation, reference: question.reference
  }));
  const correct = results.filter(x => x.correct).length;
  const total = results.length;
  const score = Math.round(correct / total * 100);
  return { id: attempt.id, dayId: attempt.dayId, version: attempt.version, startedAt: attempt.startedAt, submittedAt: new Date().toISOString(), correct, total, score, passed: correct / total >= 0.8, results, submitted: true };
}
export function evaluateChallenge(challenge, selected) {
  if (!challenge || !Array.isArray(challenge.correct)) throw new Error('El reto todavía no está disponible.');
  return { passed: exactSelection(selected, challenge.correct), explanation: challenge.explanation, expected: challenge.correct, selected: Array.isArray(selected) ? selected : [selected], reference: challenge.reference };
}
export function validateBank(bank) {
  const issues = [];
  if (!bank?.dayId || !Array.isArray(bank.questions)) return ['Formato de banco no válido.'];
  const minimum = /d7$/.test(bank.dayId) ? 20 : 8;
  if (bank.questions.length < minimum) issues.push(`Se requieren ${minimum} preguntas.`);
  const ids = new Set();
  for (const q of bank.questions) {
    if (!q.id || ids.has(q.id)) issues.push('ID de pregunta repetido o vacío.');
    ids.add(q.id);
    const opts = new Set((q.options || []).map(o => o.id));
    if (!q.prompt || !q.explanation || !q.reference || opts.size !== q.options?.length || !q.correct?.length || q.correct.some(id => !opts.has(id))) issues.push(`Pregunta inválida: ${q.id}`);
  }
  if (!bank.challenge?.correct?.length || !bank.challenge?.prompt) issues.push('Reto práctico pendiente.');
  return issues;
}
