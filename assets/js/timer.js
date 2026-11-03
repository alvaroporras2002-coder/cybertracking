import { getState, mutateState } from './storage.js';
const tabId = globalThis.crypto?.randomUUID?.() || `tab-${Math.random().toString(36).slice(2)}`;
let interval;
let tickCount = 0;
const LEASE_MS = 12000;
const timestamp = () => new Date().toISOString();
export function getTimerMs(state = getState()) {
  const timer = state.timer;
  return timer.elapsedMs + (timer.running && Number.isFinite(timer.startedAt) ? Math.max(0, Math.min(LEASE_MS, Date.now() - timer.startedAt)) : 0);
}
export async function startTimer(dayId) {
  await mutateState(state => {
    if (state.timer.running && state.timer.ownerId !== tabId) {
      if (Date.now() - (state.timer.heartbeatAt || state.timer.startedAt || 0) < LEASE_MS) throw new Error('El temporizador ya está activo en otra pestaña. Páusalo allí primero; si la cerraste, espera unos segundos.');
      state.timer = { ...state.timer, running: false, startedAt: null, ownerId: null };
    }
    if (state.timer.dayId && state.timer.dayId !== dayId && state.timer.elapsedMs > 0) throw new Error('Registra o descarta el tiempo actual antes de cambiar de sesión.');
    if (!state.timer.running) state.timer = { ...state.timer, running: true, startedAt: Date.now(), heartbeatAt: Date.now(), dayId, ownerId: tabId };
  });
}
export async function pauseTimer() {
  await mutateState(state => {
    if (!state.timer.running) return;
    if (state.timer.ownerId !== tabId) throw new Error('El temporizador pertenece a otra pestaña.');
    state.timer.elapsedMs = getTimerMs(state);
    state.timer.running = false; state.timer.startedAt = null; state.timer.ownerId = null;
  });
}
export async function resetTimer() {
  await mutateState(state => {
    if (state.timer.running && state.timer.ownerId !== tabId) throw new Error('Pausa primero el temporizador de la otra pestaña.');
    state.timer = { running: false, startedAt: null, elapsedMs: 0, dayId: null, ownerId: null };
  });
}
export async function logTimer() {
  await mutateState(state => {
    if (state.timer.running && state.timer.ownerId !== tabId) throw new Error('El temporizador está activo en otra pestaña.');
    const durationMs = getTimerMs(state);
    if (durationMs < 1000 || !state.timer.dayId) throw new Error('Inicia una sesión de estudio antes de registrar tiempo.');
    state.studySessions.push({ id: crypto.randomUUID(), dayId: state.timer.dayId, durationMs, endedAt: timestamp() });
    state.timer = { running: false, startedAt: null, elapsedMs: 0, dayId: null, ownerId: null };
  });
}
export async function logManualStudy(dayId, minutes, note = '') {
  const amount = Number(minutes);
  if (!/^w(?:0[1-9]|[1-4]\d|5[0-2])d[1-7]$/.test(dayId)) throw new Error('Elige una sesión válida.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 720) throw new Error('Registra entre 1 y 720 minutos completos.');
  const description = String(note).trim();
  if (description.length > 1000) throw new Error('La descripción admite hasta 1000 caracteres.');
  await mutateState(state => {
    state.studySessions.push({ id: crypto.randomUUID(), dayId, durationMs: amount * 60000, endedAt: timestamp(), source: 'manual', note: description });
  });
}
export function initTimer(onTick = () => {}) {
  clearInterval(interval);
  tickCount = 0;
  interval = setInterval(() => {
    const state = getState(); onTick(getTimerMs(state));
    tickCount++;
    // An expired owner may have closed/crashed. Keep only checkpointed time;
    // never turn its absence into study minutes or interrupt a healthy owner.
    if (state.timer.running && state.timer.ownerId !== tabId && Date.now() - (state.timer.heartbeatAt || state.timer.startedAt || 0) >= LEASE_MS) {
      mutateState(next => {
        if (next.timer.running && next.timer.ownerId !== tabId && Date.now() - (next.timer.heartbeatAt || next.timer.startedAt || 0) >= LEASE_MS) next.timer = { ...next.timer, running: false, startedAt: null, ownerId: null };
      }).catch(console.error);
    }
    // Checkpoint every five seconds. Unexpected closure can lose at most one
    // short interval; visibility change explicitly pauses before backgrounding.
    if (tickCount % 5 === 0 && state.timer.running && state.timer.ownerId === tabId) mutateState(next => {
      if (next.timer.running && next.timer.ownerId === tabId) { next.timer.elapsedMs = getTimerMs(next); next.timer.startedAt = Date.now(); next.timer.heartbeatAt = Date.now(); }
    }).catch(console.error);
  }, 1000);
  const visibility = () => {
    if (document.hidden && getState().timer.running && getState().timer.ownerId === tabId) pauseTimer().catch(console.error);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  return () => { clearInterval(interval); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); };
}
