export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

export function embedUrl(value) {
  try {
    const u = new URL(value);
    if (!safeUrl(value)) return null;
    const host = u.hostname.replace(/^www\./, '');
    if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
      const list = u.searchParams.get('list');
      if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (list && /^[\w-]+$/.test(list)) return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`;
    }
    if (host === 'vimeo.com' && /^\/\d+$/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.slice(1)}`;
    return null;
  } catch { return null; }
}

export async function loadCurriculum() {
  const base = new URL('../../data/', import.meta.url);
  const response = await fetch(new URL('curriculum.json', base));
  if (!response.ok) throw new Error(`No se pudo cargar el temario (${response.status}). Comprueba la carpeta data.`);
  const curriculum = await response.json();
  if (!Array.isArray(curriculum.weeks) || curriculum.weeks.length !== 52) throw new Error('El temario no contiene las 52 semanas esperadas.');
  const banks = new Map();
  for (let n = 1; n <= 4; n++) {
    const file = `assessments/week-${String(n).padStart(2, '0')}.json`;
    const result = await fetch(new URL(file, base));
    if (!result.ok) throw new Error(`Falta ${file}. Sube todas las carpetas del proyecto.`);
    const week = await result.json();
    for (const day of week.days) banks.set(day.dayId, day);
  }
  return { curriculum, banks };
}
