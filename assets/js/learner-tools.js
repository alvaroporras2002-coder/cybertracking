import { getDayCompletion } from './progress.js?v=2.0.0';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/** The same accent-insensitive comparison is used by the route and notebook. */
export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

export function matchesSearch(value, query = '') {
  return normalizeSearch(value).includes(normalizeSearch(query).trim());
}

/** Highlight source characters, never markup from a title or personal note. */
export function highlightText(value, query = '') {
  const source = String(value ?? ''), needle = normalizeSearch(query).trim();
  if (!needle) return escape(source);
  // Keep the original character boundaries: decomposed accents and emoji must
  // not be split when an accent-insensitive match is mapped back to the text.
  const segments = [];
  let offset = 0;
  for (const character of source) {
    const end = offset + character.length;
    if (/^\p{M}$/u.test(character) && segments.length) {
      segments.at(-1).text += character;
      segments.at(-1).end = end;
    } else segments.push({ text: character, start: offset, end });
    offset = end;
  }
  let normalized = '';
  const positions = [];
  for (const segment of segments) {
    const text = normalizeSearch(segment.text);
    normalized += text;
    for (let index = 0; index < text.length; index++) positions.push(segment);
  }
  const ranges = [];
  for (let index = normalized.indexOf(needle); index !== -1; index = normalized.indexOf(needle, index + needle.length)) {
    const start = positions[index].start, end = positions[index + needle.length - 1].end;
    if (ranges.length && start <= ranges.at(-1).end) ranges.at(-1).end = end;
    else ranges.push({ start, end });
  }
  if (!ranges.length) return escape(source);
  let html = '', cursor = 0;
  for (const { start, end } of ranges) {
    html += `${escape(source.slice(cursor, start))}<mark>${escape(source.slice(start, end))}</mark>`;
    cursor = end;
  }
  return html + escape(source.slice(cursor));
}

function sessionSearchText(day) {
  return [day.title, ...(day.topics || []), ...(day.resources || []).map(resource => resource.title)].join(' ');
}

/** Retain matching session IDs so a topic result can be opened and revealed. */
export function searchWeeks(weeks = [], { query = '', stage = '' } = {}) {
  const needle = normalizeSearch(query).trim();
  return weeks.flatMap(week => {
    if (stage && week.stage !== stage) return [];
    const contextMatch = Boolean(needle) && matchesSearch(`${week.title || ''} ${week.stage || ''}`, needle);
    const matchingDayIds = needle ? (week.days || []).filter(day => matchesSearch(sessionSearchText(day), needle)).map(day => day.id) : [];
    return !needle || contextMatch || matchingDayIds.length ? [{ week, matchingDayIds, contextMatch }] : [];
  });
}

function timestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Legacy records retain their existing timestamps; viewing never makes a note recent. */
export function noteEditedTime(saved = {}) {
  return timestamp(saved.notesEditedAt) ?? timestamp(saved.updatedAt) ?? 0;
}

function notebookText(day, saved) {
  return [day.title, ...(day.topics || []), saved.notes || '', ...(saved.doubts || []).map(doubt => doubt.text || ''),
    ...(saved.evidence || []).flatMap(evidence => [evidence.title, evidence.name, evidence.content, evidence.url, evidence.description, evidence.text].filter(value => typeof value === 'string'))].join(' ');
}

/** Return curriculum records; saved data is read without modifying its ordering. */
export function selectNotebookDays(days = [], state = {}, { query = '', filter = 'all', sort = 'recent' } = {}) {
  const savedDays = state.days || {};
  const selected = days.flatMap((day, index) => {
    const saved = savedDays[day.id] || {};
    const hasNotes = typeof saved.notes === 'string' && saved.notes.trim().length > 0;
    const hasDoubts = (saved.doubts || []).length > 0, hasEvidence = (saved.evidence || []).length > 0;
    if (!hasNotes && !hasDoubts && !hasEvidence && !saved.favorite) return [];
    if (filter === 'favorites' && !saved.favorite) return [];
    if ((filter === 'open-doubts' || filter === 'doubts') && !(saved.doubts || []).some(doubt => !doubt.resolved)) return [];
    if (filter === 'evidence' && !hasEvidence) return [];
    if (!matchesSearch(notebookText(day, saved), query)) return [];
    return [{ day, index, editedAt: noteEditedTime(saved) }];
  });
  if (sort !== 'course') selected.sort((a, b) => (sort === 'oldest' ? a.editedAt - b.editedAt : b.editedAt - a.editedAt) || a.index - b.index);
  return selected.map(item => item.day);
}

export function recentNoteDays(days = [], state = {}, limit = 2) {
  return selectNotebookDays(days, state).filter(day => typeof state.days?.[day.id]?.notes === 'string' && state.days[day.id].notes.trim()).slice(0, Math.max(0, Math.trunc(limit) || 0));
}

/** Resume remembers exploration; nextDay continues to obey completion gates. */
export function selectLearnerNavigation(days = [], state = {}, isCompleted = day => getDayCompletion(day, state).completed) {
  let nextDay = null, completed = 0;
  for (const day of days) {
    if (isCompleted(day)) completed++;
    else if (!nextDay) nextDay = day;
  }
  const activity = state.lastActivity;
  const resumeDay = activity ? days.find(day => day.id === activity.dayId) || null : null;
  const resumeTab = resumeDay && ['learn', 'resources', 'practice', 'quiz', 'notes'].includes(activity.tab) ? activity.tab : 'learn';
  return { nextDay, resumeDay, resumeTab, complete: days.length > 0 && completed === days.length, completed, total: days.length };
}
