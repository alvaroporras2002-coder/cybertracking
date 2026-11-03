const DB_NAME = 'cybertrack-local';
const STORE = 'snapshots';
const STATE_KEY = 'learner';
export const SCHEMA_VERSION = 1;
let dbPromise;
let memory;
let queue = Promise.resolve();
const listeners = new Set();
let channel;
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION, curriculumVersion: '1.0.0', revision: 0,
    profile: { name: '', weeklyMinutes: 720 },
    preferences: { theme: 'light', motion: true },
    days: {}, studySessions: [], achievements: [],
    timer: { running: false, startedAt: null, elapsedMs: 0, dayId: null, ownerId: null },
    createdAt: now(), updatedAt: now(), lastBackupAt: null
  };
}

export function ensureDay(state, id) {
  if (!/^w\d{2}d[1-7]$/.test(id)) throw new Error('Identificador de sesión no válido.');
  if (!state.days[id]) state.days[id] = {
    resources: {}, notes: '', doubts: [], evidence: [], challengePassed: false,
    challengeAttempts: [], attempts: [], draft: null, updatedAt: now()
  };
  return state.days[id];
}

function rejectUnsafeKeys(value, depth = 0) {
  if (depth > 40) throw new Error('El respaldo contiene demasiados niveles.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('El respaldo contiene claves no permitidas.');
    rejectUnsafeKeys(child, depth + 1);
  }
}

function validateQuestion(question) {
  if (!question || typeof question.id !== 'string' || typeof question.prompt !== 'string' || !Array.isArray(question.options) || question.options.length < 2 || !Array.isArray(question.correct) || !question.correct.length || typeof question.explanation !== 'string') throw new Error('Una pregunta guardada no es válida.');
  const ids = new Set();
  for (const option of question.options) {
    if (!option || typeof option.id !== 'string' || typeof option.text !== 'string' || ids.has(option.id)) throw new Error('Opciones de pregunta no válidas.');
    ids.add(option.id);
  }
  if (question.correct.some(id => !ids.has(id))) throw new Error('La solución de una pregunta no coincide con sus opciones.');
}
function validateDraft(draft) {
  if (!draft || typeof draft.id !== 'string' || !Array.isArray(draft.questions) || !draft.questions.length || draft.questions.length > 100 || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)) throw new Error('El intento en borrador no es válido.');
  draft.questions.forEach(validateQuestion);
  for (const selected of Object.values(draft.answers)) if (!Array.isArray(selected) || selected.some(v => typeof v !== 'string')) throw new Error('Las respuestas del borrador no son válidas.');
}

export function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El respaldo no contiene un estado válido.');
  rejectUnsafeKeys(value);
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(value.schemaVersion > SCHEMA_VERSION
      ? 'Este respaldo pertenece a una versión futura. Actualiza la aplicación antes de importarlo.'
      : 'Versión del respaldo no compatible. Los datos actuales se conservaron.');
  }
  if (!value.days || typeof value.days !== 'object' || Array.isArray(value.days)) throw new Error('Faltan las sesiones del respaldo.');
  if (!value.profile || !Number.isFinite(value.profile.weeklyMinutes) || value.profile.weeklyMinutes < 0 || value.profile.weeklyMinutes > 10080) throw new Error('Meta semanal no válida.');
  if (typeof value.profile.name !== 'string' || value.profile.name.length > 200) throw new Error('Nombre no válido.');
  if (!value.preferences || !['dark', 'light'].includes(value.preferences.theme) || typeof value.preferences.motion !== 'boolean') throw new Error('Preferencias no válidas.');
  if (!Array.isArray(value.studySessions) || value.studySessions.length > 100000) throw new Error('Sesiones de tiempo no válidas.');
  for (const session of value.studySessions) {
    if (!session || typeof session.id !== 'string' || !Number.isFinite(session.durationMs) || session.durationMs < 0 || session.durationMs > 7 * 86400000) throw new Error('Hay un registro de tiempo no válido.');
  }
  let bytes = 0;
  for (const [id, day] of Object.entries(value.days)) {
    if (!/^w(?:0[1-9]|[1-4]\d|5[0-2])d[1-7]$/.test(id) || !day || typeof day !== 'object') throw new Error('El respaldo contiene una sesión desconocida.');
    if (typeof day.notes !== 'string' || day.notes.length > 2_000_000) throw new Error('Una nota supera el límite o es inválida.');
    if (!day.resources || typeof day.resources !== 'object' || Array.isArray(day.resources) || !Object.values(day.resources).every(v => typeof v === 'boolean')) throw new Error('Lista de recursos no válida.');
    if (!Array.isArray(day.attempts) || !Array.isArray(day.doubts) || !Array.isArray(day.evidence)) throw new Error('Datos de estudio incompletos.');
    if (typeof day.challengePassed !== 'boolean') throw new Error('Estado de práctica no válido.');
    if (day.draft != null) validateDraft(day.draft);
    for (const attempt of day.attempts) {
      if (!attempt || typeof attempt.id !== 'string' || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100 || typeof attempt.passed !== 'boolean') throw new Error('Hay un intento de evaluación no válido.');
      if (attempt.questions != null) {
        if (!Array.isArray(attempt.questions)) throw new Error('Preguntas históricas no válidas.');
        attempt.questions.forEach(validateQuestion);
      }
      if (attempt.answers != null && (typeof attempt.answers !== 'object' || Object.values(attempt.answers).some(a => !Array.isArray(a) || a.some(v => typeof v !== 'string')))) throw new Error('Respuestas históricas no válidas.');
    }
    for (const doubt of day.doubts) {
      if (!doubt || typeof doubt.id !== 'string' || typeof doubt.text !== 'string' || typeof doubt.resolved !== 'boolean') throw new Error('Hay una duda no válida.');
    }
    for (const ev of day.evidence) {
      if (ev?.type === 'text') {
        if (typeof ev.id !== 'string' || typeof ev.title !== 'string' || typeof ev.content !== 'string' || ev.content.length > 10000 || ev.title.length > 200) throw new Error('La evidencia de texto no es válida.');
        continue;
      }
      if (!ev || typeof ev.id !== 'string' || typeof ev.name !== 'string' || !Number.isFinite(ev.size) || ev.size < 0 || ev.size > 10 * 1024 * 1024) throw new Error('Un adjunto supera 10 MiB o es inválido.');
      if (typeof ev.dataUrl !== 'string' || !/^data:(?:[\w.+-]+\/[\w.+-]+)?;base64,[A-Za-z0-9+/=\r\n]*$/.test(ev.dataUrl)) throw new Error('El contenido de un adjunto no es válido.');
      const payload = ev.dataUrl.split(',')[1].replace(/[\r\n]/g, '');
      const estimated = payload.length * 3 / 4 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
      if (Math.abs(estimated - ev.size) > 2) throw new Error('El tamaño de un adjunto no coincide con su contenido.');
      bytes += ev.size;
    }
  }
  if (bytes > 100 * 1024 * 1024) throw new Error('Los adjuntos superan el límite de 100 MiB.');
  if (!value.timer || typeof value.timer.running !== 'boolean' || !Number.isFinite(value.timer.elapsedMs) || value.timer.elapsedMs < 0) throw new Error('Temporizador no válido.');
  if (value.timer.running && (!Number.isFinite(value.timer.startedAt) || !value.timer.dayId || typeof value.timer.ownerId !== 'string')) throw new Error('Temporizador en curso no válido.');
  return clone(value);
}

function openDb() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Este navegador no permite guardar datos localmente. Abre la página fuera del modo privado o utiliza otro navegador.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(new Error('No se pudo abrir el almacenamiento local. No se borró ningún registro.')); };
    request.onblocked = () => reject(new Error('Cierra otras pestañas de CYBERTRACK para actualizar el almacenamiento.'));
  });
  return dbPromise;
}

function emit() { for (const listener of listeners) { try { listener(memory); } catch (error) { console.error(error); } } }
function setupChannel() {
  if (!channel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('cybertrack-state');
    channel.onmessage = async () => {
      try { await readSnapshot(); emit(); } catch (error) { console.error('No se pudo actualizar esta pestaña.', error); }
    };
  }
}
async function readSnapshot() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => {
      try { memory = req.result ? validateState(req.result) : createDefaultState(); resolve(memory); }
      catch (error) { reject(error); }
    };
    req.onerror = () => reject(new Error('No se pudieron leer tus datos. No se inició un perfil vacío sobre ellos.'));
  });
}
export async function loadState() { setupChannel(); return readSnapshot(); }
export function getState() { if (!memory) throw new Error('Los datos todavía no se han cargado.'); return memory; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function updateTransaction(mutator, replace) {
  return openDb().then(db => new Promise((resolve, reject) => {
    // Read and write in the same transaction: IndexedDB serializes this across tabs.
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let next;
    let caught;
    const req = store.get(STATE_KEY);
    req.onsuccess = () => {
      try {
        const current = req.result ? validateState(req.result) : createDefaultState();
        next = replace ? validateState(replace) : clone(current);
        if (mutator) {
          const result = mutator(next);
          if (result && typeof result.then === 'function') throw new Error('El cambio de datos debe ser síncrono.');
        }
        next.revision = (current.revision || 0) + 1;
        next.updatedAt = now();
        validateState(next);
        store.put(next, STATE_KEY);
      } catch (error) { caught = error; tx.abort(); }
    };
    tx.oncomplete = () => { memory = next; emit(); channel?.postMessage({ revision: next.revision }); resolve(next); };
    tx.onabort = tx.onerror = () => reject(caught || new Error('No se pudo guardar. Tus datos anteriores se conservaron; revisa espacio y permisos del navegador.'));
  }));
}
function serialized(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}
export function mutateState(mutator) { return serialized(() => updateTransaction(mutator)); }
export function replaceState(next) {
  const checked = validateState(next); // validate completely before opening a write transaction
  return serialized(() => updateTransaction(null, checked));
}
export async function getStorageInfo() {
  let estimate = {};
  try { estimate = await navigator.storage?.estimate?.() || {}; } catch { /* unsupported */ }
  const evidenceBytes = Object.values(memory?.days || {}).reduce((sum, day) => sum + day.evidence.reduce((n, file) => n + (file.size || 0), 0), 0);
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, evidenceBytes, fileLimit: 10 * 1024 * 1024, totalLimit: 100 * 1024 * 1024 };
}
