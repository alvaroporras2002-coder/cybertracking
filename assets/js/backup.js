import { validateState } from './storage.js?v=2.0.0';
const MAX_BACKUP_BYTES = 150 * 1024 * 1024;
export function exportBackup(state) {
  const checked = validateState(state);
  const payload = { app: 'CYBERTRACK', formatVersion: 1, exportedAt: new Date().toISOString(), includesAttachments: true, state: checked };
  const content = JSON.stringify(payload, null, 2);
  return new Blob([content], { type: 'application/json' });
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('El respaldo no es texto válido o supera 150 MiB.');
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('No se pudo leer el JSON. Tus datos actuales no cambiaron.'); }
  if (payload.app !== 'CYBERTRACK' || payload.formatVersion !== 1 || !payload.includesAttachments) throw new Error('No es un respaldo completo y compatible de CYBERTRACK.');
  const state = validateState(payload.state);
  // Never resume another device's running timer from an imported snapshot.
  if (state.timer.running) {
    state.timer = { ...state.timer, running: false, startedAt: null, ownerId: null };
  }
  return state;
}
function unionById(a = [], b = []) { const map = new Map(a.map(item => [item.id, structuredClone(item)])); for (const item of b) if (!map.has(item.id)) map.set(item.id, structuredClone(item)); return [...map.values()]; }
function newer(a, b, field) { return !a || (b && Date.parse(b[field]) > Date.parse(a[field])) ? b : a; }
export function mergeStates(current, incoming) {
  const target = validateState(current); const source = validateState(incoming);
  for (const [id, day] of Object.entries(source.days)) {
    if (!target.days[id]) { target.days[id] = structuredClone(day); continue; }
    const existing = target.days[id];
    const resources = { ...existing.resources };
    for (const [key, value] of Object.entries(day.resources)) resources[key] = Boolean(value || resources[key]);
    existing.resources = resources;
    if (day.notes && day.notes !== existing.notes) {
      const hadNotes = Boolean(existing.notes);
      existing.notes = hadNotes ? `${existing.notes}\n\n—— Nota recuperada de respaldo ——\n${day.notes}` : day.notes;
      if (day.notesEditedAt && (!hadNotes || !existing.notesEditedAt || Date.parse(day.notesEditedAt) > Date.parse(existing.notesEditedAt))) existing.notesEditedAt = day.notesEditedAt;
    } else if (day.notes && day.notesEditedAt && (!existing.notesEditedAt || Date.parse(day.notesEditedAt) > Date.parse(existing.notesEditedAt))) existing.notesEditedAt = day.notesEditedAt;
    existing.doubts = unionById(existing.doubts, day.doubts);
    existing.evidence = unionById(existing.evidence, day.evidence);
    existing.attempts = unionById(existing.attempts, day.attempts);
    existing.challengeAttempts = unionById(existing.challengeAttempts, day.challengeAttempts);
    existing.challengePassed ||= day.challengePassed;
    existing.draft = existing.draft || day.draft;
  }
  target.studySessions = unionById(target.studySessions, source.studySessions);
  target.achievements = [...new Set([...(target.achievements || []), ...(source.achievements || [])])];
  // Merging a backup intentionally recovers missing drafts; matching forms use
  // their edit time, rather than the backup's export time, to choose a value.
  if (source.formDrafts) {
    target.formDrafts ||= {};
    for (const [key, draft] of Object.entries(source.formDrafts)) target.formDrafts[key] = structuredClone(newer(target.formDrafts[key], draft, 'updatedAt'));
  }
  if (source.lastActivity) target.lastActivity = structuredClone(newer(target.lastActivity, source.lastActivity, 'visitedAt'));
  target.updatedAt = new Date().toISOString();
  return validateState(target);
}
export function previewImport(current, incoming) {
  const count = state => ({ days: Object.keys(state.days).length, attempts: Object.values(state.days).reduce((n, d) => n + d.attempts.length, 0), notes: Object.values(state.days).filter(d => d.notes).length, attachments: Object.values(state.days).reduce((n, d) => n + d.evidence.filter(e => e.dataUrl).length, 0), attachmentBytes: Object.values(state.days).reduce((n, d) => n + d.evidence.reduce((a, e) => a + (e.size || 0), 0), 0) });
  validateState(incoming); return { current: count(current), incoming: count(incoming), merged: count(mergeStates(current, incoming)) };
}
export async function evidenceFromFile(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Cada archivo puede pesar como máximo 10 MiB.');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se pudo leer el archivo.')); reader.readAsDataURL(file); });
  return { id: crypto.randomUUID(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl, createdAt: new Date().toISOString(), verification: 'self-reported' };
}
