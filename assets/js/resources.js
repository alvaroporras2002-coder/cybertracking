import { validateBank } from './assessments.js?v=1.6.0';

export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

function youtubeResource(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.replace(/^www\./, '');
    const videoPattern = /^[A-Za-z0-9_-]{11}$/;
    let id = null;
    if (host === 'youtu.be') id = u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    else if (['youtube.com', 'm.youtube.com'].includes(host)) {
      if (/^\/watch\/?$/.test(u.pathname)) id = u.searchParams.get('v');
      else id = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    } else if (host === 'youtube-nocookie.com') id = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    else return null;
    if (id && videoPattern.test(id) && !/^\/embed\/videoseries\/?$/.test(u.pathname)) return { videoId: id, listId: null };
    // A playlist has no single video poster. Keep its existing playback action
    // without inventing a thumbnail for an unrelated lesson.
    const list = u.searchParams.get('list');
    const listPath = /^\/(?:playlist|watch|embed\/videoseries)\/?$/.test(u.pathname);
    return host !== 'youtu.be' && listPath && list && /^[A-Za-z0-9_-]+$/.test(list)
      ? { videoId: null, listId: list } : null;
  } catch { return null; }
}

/** A real, provider-hosted poster is available only for a specific video. */
export function videoThumbnailUrl(value) {
  const id = youtubeResource(value)?.videoId;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function embedUrl(value) {
  try {
    const youtube = youtubeResource(value);
    if (youtube?.videoId) return `https://www.youtube-nocookie.com/embed/${youtube.videoId}`;
    if (youtube?.listId) return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(youtube.listId)}`;
    const u = new URL(value);
    if (!safeUrl(value)) return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'vimeo.com' && /^\/\d+$/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.slice(1)}`;
    return null;
  } catch { return null; }
}

export async function loadCurriculum() {
  const base = new URL('../../data/', import.meta.url);
  const [response, assessmentResponse] = await Promise.all([
    fetch(new URL('curriculum.json', base)),
    fetch(new URL('assessments/index.json?v=1.5.0', base))
  ]);
  if (!response.ok) throw new Error(`No se pudo cargar el temario (${response.status}). Comprueba la carpeta data.`);
  if (!assessmentResponse.ok) throw new Error(`No se pudieron cargar las evaluaciones (${assessmentResponse.status}). Comprueba data/assessments/index.json.`);
  const [curriculum, assessmentIndex] = await Promise.all([response.json(), assessmentResponse.json()]);
  if (!Array.isArray(curriculum.weeks) || curriculum.weeks.length !== 52) throw new Error('El temario no contiene las 52 semanas esperadas.');
  if (!Array.isArray(assessmentIndex.weeks) || assessmentIndex.weeks.length !== 52) throw new Error('El índice de evaluaciones está incompleto.');
  const banks = new Map();
  const weekFiles = new Map();
  const requests = new Map();
  for (const [index, week] of assessmentIndex.weeks.entries()) {
    const expected = curriculum.weeks[index];
    if (week.week !== expected.number || week.file !== `week-${String(week.week).padStart(2,'0')}.json` || !Array.isArray(week.dayIds) || week.dayIds.length !== expected.days.length) throw new Error('El índice de evaluaciones no coincide con el temario.');
    weekFiles.set(week.week, week.file);
    for (const [dayIndex, dayId] of week.dayIds.entries()) {
      if (dayId !== expected.days[dayIndex].id || banks.has(dayId)) throw new Error('Una evaluación no coincide con su sesión de estudio.');
      banks.set(dayId, { dayId, loaded: false });
    }
  }
  async function loadBank(dayId) {
    const current = banks.get(dayId);
    if (!current) throw new Error('La sesión de evaluación no existe.');
    if (current.loaded) return current;
    const number = Number(dayId.slice(1,3));
    if (!requests.has(number)) {
      const request = (async () => {
        const result = await fetch(new URL(`assessments/${weekFiles.get(number)}?v=1.5.0`, base));
        if (!result.ok) throw new Error('No se pudo cargar la prueba. Comprueba tu conexión y vuelve a intentarlo.');
        const week = await result.json(), expected = curriculum.weeks[number - 1];
        if (week.week !== number || !Array.isArray(week.days) || week.days.length !== 7) throw new Error('El banco de esta semana está incompleto.');
        const checked = week.days.map((day,index) => {
          if (day.dayId !== expected.days[index].id || validateBank(day).length) throw new Error('Una prueba de esta semana no es válida.');
          return { ...day, version: day.version || week.version || '1.0.0', loaded: true };
        });
        for (const day of checked) banks.set(day.dayId, day);
      })();
      requests.set(number, request);
      request.catch(() => { if (requests.get(number) === request) requests.delete(number); });
    }
    await requests.get(number);
    return banks.get(dayId);
  }
  return { curriculum, banks, loadBank };
}
