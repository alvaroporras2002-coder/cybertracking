import { loadState, getState, mutateState, subscribe, ensureDay, createDefaultState, replaceState, getStorageInfo } from './storage.js';
import { getDayCompletion } from './progress.js';
import { createAttempt, scoreAttempt, evaluateChallenge } from './assessments.js';
import { getTimerMs, startTimer, pauseTimer, logTimer, initTimer } from './timer.js';
import { exportBackup, parseBackup, mergeStates, previewImport, evidenceFromFile } from './backup.js';
import { loadCurriculum, safeUrl, embedUrl } from './resources.js';
import { readRoute, navigate, initRouter } from './router.js';
import { initMotion } from './motion.js';

const $ = (s, root = document) => root.querySelector(s);
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let curriculum, days, banks, motion, imported = null, noteTimer, currentDraftSave = Promise.resolve();
let pathFilter = '', stageFilter = '', pageNumber = 1, noteFilter = '';
const pageSize = 8;
const labels = { home: 'Tu espacio de aprendizaje', path: 'Ruta de aprendizaje', day: 'Aula de estudio', notes: 'Bitácora personal', progress: 'Tu progreso', settings: 'Ajustes y respaldo' };

function toast(message, error = false) {
  const box = $('#toast');
  box.hidden = false;
  box.textContent = message;
  box.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(box.hideTimer); box.hideTimer = setTimeout(() => {box.classList.remove('visible');box.hidden=true;}, 4600);
}

function snapshot() { return getState(); }
function currentDay() { return days.find(d => !getDayCompletion(d, snapshot(), banks.has(d.id)).completed) || days[days.length - 1]; }
function completion(day) { return getDayCompletion(day, snapshot(), banks.has(day.id)); }
function unlocked(day) { return days.indexOf(day) <= days.indexOf(currentDay()); }
function ds(id) { return snapshot().days[id] || {}; }
function completedDays() { return days.filter(d => completion(d).completed); }
function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }
function bar(n, total) { return `<div class="progress-track" role="progressbar" aria-label="Progreso" aria-valuenow="${pct(n,total)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${pct(n,total)}%"></div></div>`; }
function button(text, action, extra = '', classes = 'primary') { return `<button class="btn ${classes}" data-action="${action}" ${extra}>${text}</button>`; }
function cardStat(label, value, sub = '') { return `<article class="card stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="muted">${sub}</span></article>`; }
function sessionMinutes() { return (snapshot().studySessions || []).reduce((sum,s) => sum + (s.durationMs || 0), 0) / 60000; }
function localDay(time) { return new Date(time).toLocaleDateString('en-CA'); }
function weekMinutes() {
  const now = new Date(), start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0,0,0,0);
  return (snapshot().studySessions || []).filter(s => new Date(s.endedAt || s.createdAt || s.startedAt).getTime() >= start.getTime()).reduce((a,s) => a + (s.durationMs || 0),0) / 60000;
}
function streak() {
  const active = new Set((snapshot().studySessions || []).filter(s => s.durationMs > 0).map(s => localDay(s.endedAt || s.createdAt || s.startedAt)));
  for (const d of Object.values(snapshot().days)) for (const a of d.attempts || []) if (a.submittedAt || a.completedAt) active.add(localDay(a.submittedAt || a.completedAt));
  let n = 0, dt = new Date(); if (!active.has(localDay(dt))) dt.setDate(dt.getDate()-1);
  while (active.has(localDay(dt))) { n++; dt.setDate(dt.getDate()-1); } return n;
}
function grade(a) { return a.result?.percentage ?? a.result?.score ?? a.percentage ?? a.score ?? 0; }
function passed(a) { return a.result?.passed ?? a.passed ?? false; }
function attemptHistory() { return days.flatMap(d => (ds(d.id).attempts || []).map(a => ({...a, day:d}))).filter(a => a.result || a.submittedAt || a.completedAt); }
function dayBadge(d) {
  if(completion(d).completed) return '<span class="badge success">Superada</span>';
  if(!banks.has(d.id)) return '<span class="badge">Evaluación pendiente</span>';
  return unlocked(d) ? '<span class="badge accent">Disponible</span>' : '<span class="badge">Vista previa</span>';
}

async function commit(fn, rerender = true) {
  try { await mutateState(fn); applyPreferences(); if(rerender) render(); return true; }
  catch(err) { toast(`No se guardó: ${err.message}`, true); return false; }
}
function applyPreferences() {
  const pref=snapshot().preferences || {};
  document.documentElement.dataset.theme = pref.theme || 'dark';
  motion?.update(pref.motion !== false);
  const name = $('#profile-name'); if(name) name.textContent=snapshot().profile?.name || 'Tu academia';
}

function renderHome() {
  const day=currentDay(), completed=completedDays(), week=curriculum.weeks.find(w=>w.number===day.week), state=snapshot(), goal=state.profile?.weeklyMinutes||720;
  const weekDone=week.days.filter(d=>completion(d).completed).length;
  const recent=days.filter(d=>ds(d.id).notes).reverse().slice(0,3);
  const doubts=days.flatMap(d=>(ds(d.id).doubts||[]).filter(q=>!q.resolved).map(q=>({...q,day:d})));
  const c=completion(day);
  const checks=[['Recursos obligatorios',c.resourcesReady],['Práctica evaluable',c.challengeReady],['Prueba de comprensión',c.quizPassed]];
  return `${!state.profile?.onboarded ? `<section class="notice"><strong>Bienvenido a tu laboratorio.</strong><p>Avanza a tu ritmo, sin fecha de inicio. Tu progreso se guarda en este navegador y no se sincroniza con otros dispositivos.</p><form id="onboarding" class="inline-form"><label>¿Cómo te llamas?<input name="name" autocomplete="given-name" maxlength="60" placeholder="Álvaro"></label>${button('Comenzar mi recorrido','onboard','type="submit"')}</form></section>`:''}
  <section class="hero"><div class="hero-copy"><span class="eyebrow">TU SIGUIENTE PASO · SEMANA ${day.week} / DÍA ${day.day}</span><h2>Construye tu<br><span class="kinetic-word">futuro en seguridad.</span></h2><p>Una habilidad a la vez. Tu laboratorio, tus preguntas y un camino claro para seguir aprendiendo.</p><div class="hero-actions">${button('Continuar estudiando <span aria-hidden="true">↗</span>','goto',`data-hash="day/${day.id}/${ds(day.id).lastTab||'learn'}"`)}<a class="btn ghost" href="#path">Explorar mi ruta</a></div><div class="hero-pills"><span class="chip">52 semanas</span><span class="chip">364 sesiones</span><span class="chip">A tu ritmo</span></div></div><div class="hero-art"><div class="liquid-orb" aria-hidden="true"></div><img src="./assets/illustrations/lab.svg" alt="Laboratorio isométrico con terminales, servidor y módulos de aprendizaje" width="520" height="440"></div></section>
  <div class="stats-grid">${cardStat('Sesiones superadas',`${completed.length}<small> / 364</small>`,'Habilidades y pruebas completadas')}${cardStat('Esta semana',`${Math.round(weekMinutes())}<small> min</small>`,`Meta: ${goal} minutos`)}${cardStat('Constancia',`${streak()}<small> días</small>`,'Tus avances siempre se conservan')}${cardStat('Tu nivel',`${Math.floor(completed.length/7)+1}`,`${completed.length*100} XP · por hitos únicos`)}</div>
  <div class="dashboard-grid"><article class="card"><div class="section-heading"><span class="eyebrow">EN TU MESA</span>${dayBadge(day)}</div><h3>${E(day.title)}</h3><p class="muted">${E(day.topics.slice(0,3).join(' · '))}</p><div class="mini-checks">${checks.map(([l,yes])=>`<div class="check-row"><span class="status-dot ${yes?'done':''}">${yes?'✓':'○'}</span>${l}<span class="muted">${yes?'Listo':'Por completar'}</span></div>`).join('')}</div><a class="text-link" href="#day/${day.id}/learn">Abrir aula →</a></article>
  <article class="card"><span class="eyebrow">ESTÁS CONSTRUYENDO LAS BASES</span><h3>Semana ${day.week} · ${E(week.title)}</h3>${bar(weekDone,7)}<p class="muted">${weekDone} de 7 sesiones superadas</p><div class="week-dots">${week.days.map(d=>`<a href="#day/${d.id}/learn" class="day-dot ${completion(d).completed?'done':d.id===day.id?'active':''}" aria-label="Día ${d.day}: ${E(d.title)}">${completion(d).completed?'✓':d.day}</a>`).join('')}</div><p class="muted">El siguiente día se activa cuando terminas. No hay fechas vencidas.</p></article>
  <article class="card"><div class="section-heading"><span class="eyebrow">FOCO</span><span class="chip">25 + 5</span></div><h3>Un espacio para concentrarte</h3><div class="timer-display" data-timer>00:00</div><div class="button-row">${button(state.timer?.running?'Pausar':'Iniciar','timer-toggle',`data-id="${day.id}"`)}${button('Registrar tiempo','timer-log','','secondary')}</div><small class="muted">Se pausa al ocultar la página. Registra tu sesión para sumarla al historial.</small></article>
  <article class="card"><span class="eyebrow">BITÁCORA</span><h3>Ideas que vale la pena guardar</h3>${recent.length?recent.map(d=>`<a class="note-preview" href="#day/${d.id}/notes"><strong>${E(d.title)}</strong><p>${E(ds(d.id).notes.slice(0,100))}${ds(d.id).notes.length>100?'…':''}</p></a>`).join(''):'<p class="muted">Tus notas aparecerán aquí. Empieza con una pregunta, un hallazgo o algo que quieras practicar.</p>'}<a class="text-link" href="#notes">${doubts.length} dudas abiertas · Ver bitácora →</a></article></div>
  <section class="notice"><strong>Tu recorrido ya está aquí.</strong> Las 52 semanas se pueden consultar. Esta entrega tiene evaluaciones y retos para las primeras 4 semanas; las siguientes muestran su estado pendiente sin fingir que están aprobadas.</section>`;
}

function renderPath() {
  const stages=[...new Set(curriculum.weeks.map(w=>w.stage))];
  const matches=curriculum.weeks.filter(w=>(!stageFilter||w.stage===stageFilter)&&(!pathFilter||`${w.title} ${w.stage} ${w.days.map(d=>`${d.title} ${d.topics.join(' ')} ${d.resources.map(r=>r.title).join(' ')}`).join(' ')}`.toLowerCase().includes(pathFilter.toLowerCase())));
  const count=Math.max(1,Math.ceil(matches.length/pageSize)); pageNumber=Math.min(pageNumber,count);
  return `<section class="section-heading"><div><span class="eyebrow">EL MAPA DE TU APRENDIZAJE</span><h2>Tu próxima habilidad te espera.</h2><p class="muted">Explora todo el programa. Avanza en orden, a tu ritmo.</p></div><span class="badge accent">${completedDays().length} / 364</span></section><div class="filter-bar"><label class="field">Buscar tema<input id="path-search" type="search" value="${E(pathFilter)}" placeholder="Redes, Linux, phishing…"></label><label class="field">Etapa<select id="stage-filter"><option value="">Todas las etapas</option>${stages.map(s=>`<option value="${E(s)}" ${s===stageFilter?'selected':''}>${E(s)}</option>`).join('')}</select></label></div>
  <div class="week-grid">${matches.slice((pageNumber-1)*pageSize,pageNumber*pageSize).map(w=>{const n=w.days.filter(d=>completion(d).completed).length;return `<article class="card week-card"><div class="section-heading"><span class="eyebrow">SEMANA ${String(w.number).padStart(2,'0')}</span><span class="badge ${w.number<=4?'accent':''}">${w.number<=4?'Evaluación lista':'Solo contenido'}</span></div><span class="muted">${E(w.stage)}</span><h3 class="week-title">${E(w.title)}</h3>${bar(n,7)}<div class="route-days">${w.days.map(d=>`<a class="route-day ${d.id===currentDay().id?'current':''}" href="#day/${d.id}/learn"><span class="day-dot ${completion(d).completed?'done':''}">${completion(d).completed?'✓':d.day}</span><span>${E(d.title)}</span><span aria-label="${unlocked(d)?'Disponible':'Vista previa'}">${unlocked(d)?'↗':'◌'}</span></a>`).join('')}</div></article>`;}).join('')||'<div class="empty-state">No encontramos ese tema. Prueba otra palabra.</div>'}</div><div class="pagination">${button('← Anterior','page',`data-n="${pageNumber-1}" ${pageNumber===1?'disabled':''}`,'secondary')}<span>Página ${pageNumber} de ${count} · ${matches.length} semanas</span>${button('Siguiente →','page',`data-n="${pageNumber+1}" ${pageNumber===count?'disabled':''}`,'secondary')}</div>`;
}

function renderResources(day) {
  return `<div class="notice">Marca un recurso después de estudiarlo. Es tu registro personal de estudio; la comprensión se comprueba con la práctica y la prueba.</div>${day.resources.map((r,i)=>{
    const override=ds(day.id).resourceOverrides?.[r.id], url=safeUrl(override?.url||r.url), embed=embedUrl(url), done=!!ds(day.id).resources?.[r.id];
    return `<article class="resource-card"><div class="section-heading"><span class="badge ${r.required?'accent':''}">${r.required?'Obligatorio':'Complementario'}</span><span class="muted">${E(r.type)} · Inglés prioritario</span></div><h3>${E(r.title)}</h3><p class="muted">${E(r.description||'Consulta el apartado relacionado con los subtemas de esta sesión.')}</p>${override?`<p class="notice">Recurso sustituido: ${E(override.reason)}. El enlace original se conserva en el temario.</p>`:''}<div class="button-row">${embed?button('▶ Reproducir aquí','embed',`data-url="${E(url)}" data-resource="${i}"`,'secondary'):''}${url?`<a class="btn ghost" href="${E(url)}" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a>`:'<span class="badge">Enlace no disponible</span>'}</div><div class="video-slot" id="video-slot-${i}"></div><label class="check-row"><input type="checkbox" data-resource-check="${E(r.id)}" data-day="${day.id}" ${done?'checked':''} ${!unlocked(day)?'disabled':''}><span>He estudiado este recurso</span></label><details class="resource-replace"><summary>¿No funciona? Registrar un sustituto</summary><form class="replacement-form" data-day="${day.id}" data-rid="${E(r.id)}"><label>URL alternativa HTTPS<input type="url" name="url" required placeholder="https://…"></label><label>Por qué es equivalente<input name="reason" required minlength="8" maxlength="400"></label><button class="btn secondary" type="submit">Guardar sustitución</button></form></details></article>`;
  }).join('')}`;
}

function renderChallenge(day) {
  const bank=banks.get(day.id), st=ds(day.id);
  if(!bank) return '<div class="empty-state"><h3>La práctica evaluable de esta sesión está en desarrollo.</h3><p>Puedes estudiar sus recursos y hacer la tarea externa. El avance oficial se mantiene en la primera sesión pendiente.</p></div>';
  const c=bank.challenge;
  return `<article class="card"><span class="eyebrow">RETO DE COMPRENSIÓN APLICADA</span><h3>${E(c.prompt)}</h3><p class="muted">Este ejercicio valida tu interpretación del escenario, no inspecciona tu computadora. ${c.correct.length>1?'Selecciona todas las respuestas correctas.':'Selecciona una respuesta.'}</p><form id="challenge-form" data-day="${day.id}">${c.options.map(o=>`<label class="option"><input type="${c.correct.length>1?'checkbox':'radio'}" name="challenge" value="${E(o.id)}" ${!unlocked(day)?'disabled':''}><span>${E(o.text)}</span></label>`).join('')}<div class="button-row"><button class="btn primary" type="submit" ${!unlocked(day)?'disabled':''}>Comprobar solución</button>${st.challengePassed?'<span class="badge success">Ejercicio superado</span>':''}</div></form>${st.challengeFeedback?`<div class="notice ${st.challengePassed?'success':''}">${E(st.challengeFeedback)}</div>`:''}</article>`;
}
function renderPractice(day) {
  return `<article class="card task-box"><span class="eyebrow">LABORATORIO PERSONAL</span><h3>De la idea a la práctica</h3><p>${E(day.task)}</p><p class="muted">${E(day.evidence)}</p><div class="mini-checks"><p>① Trabaja en un equipo propio o un laboratorio autorizado.</p><p>② Guarda el resultado y explica cómo lo comprobaste.</p><p>③ Identifica una limitación o una conclusión alternativa.</p></div><a href="#day/${day.id}/notes" class="text-link">Añadir notas y evidencia →</a><small class="muted">Las evidencias externas son autodeclaradas. No se aprueban automáticamente por subir una captura.</small></article>${renderChallenge(day)}`;
}

function questionsOf(attempt, bank) {
  if(attempt?.questions) return attempt.questions;
  if(attempt?.questionIds) return attempt.questionIds.map(id=>bank.questions.find(q=>q.id===id)).filter(Boolean);
  return [];
}
function renderQuiz(day) {
  const bank=banks.get(day.id), st=ds(day.id), gate=completion(day);
  if(!bank) return '<div class="empty-state"><h3>Evaluación pendiente de desarrollo</h3><p>Esta versión tiene pruebas completas para las semanas 1 a 4. El contenido de las 52 semanas permanece disponible.</p></div>';
  const draft=st.draft;
  const history=(st.attempts||[]).slice().reverse();
  const ready=unlocked(day)&&gate.resourcesReady&&gate.challengeReady;
  let content;
  if(draft) {
    const questions=questionsOf(draft,bank);
    content=`<form id="quiz-form" data-day="${day.id}"><div class="section-heading"><span class="badge accent">${questions.length} preguntas · 80% para superar</span><span class="muted">Borrador guardado</span></div>${questions.map((q,i)=>`<fieldset class="question"><legend><span class="eyebrow">PREGUNTA ${i+1}</span><br>${E(q.prompt)}</legend>${q.correct.length>1?'<p class="muted">Selecciona todas las correctas. Se puntúa el conjunto exacto.</p>':''}${q.options.map(o=>`<label class="option"><input type="${q.correct.length>1?'checkbox':'radio'}" name="${E(q.id)}" value="${E(o.id)}" ${(draft.answers?.[q.id]||[]).includes(o.id)?'checked':''}><span>${E(o.text)}</span></label>`).join('')}</fieldset>`).join('')}<button class="btn primary" type="submit" ${!ready?'disabled':''}>Entregar prueba</button><p class="muted">Las explicaciones aparecen después de entregar. Puedes reintentarlo sin perder el historial.</p></form>`;
  } else content=`<article class="card"><span class="eyebrow">${day.day===7?'REVISIÓN SEMANAL':'PRUEBA DE COMPRENSIÓN'}</span><h3>Comprueba lo que aprendiste.</h3><p>Preguntas originales de práctica, con selección variable y explicaciones. No son preguntas de un examen de certificación.</p><ul class="clean-list"><li>${gate.resourcesReady?'✓':'○'} Recursos obligatorios estudiados</li><li>${gate.challengeReady?'✓':'○'} Reto de interpretación superado</li><li>${unlocked(day)?'✓':'○'} Prerrequisito del recorrido completo</li></ul>${button('Comenzar prueba','quiz-start',`data-id="${day.id}" ${!ready?'disabled':''}`)}</article>`;
  if(gate.completed) content=`<div class="notice success"><strong>Sesión superada.</strong> Has completado sus recursos, práctica evaluable y prueba. ${days.indexOf(day)<363?`<a href="#day/${days[days.indexOf(day)+1].id}/learn">Continuar al siguiente día →</a>`:''}</div>`+content;
  return content+`<article class="card"><h3>Historial de intentos</h3>${history.length?history.map(a=>`<details class="attempt-result"><summary><span class="badge ${passed(a)?'success':''}">${Math.round(grade(a))}% · ${passed(a)?'Superada':'Seguir practicando'}</span> ${E(new Date(a.submittedAt||a.completedAt||a.createdAt).toLocaleString())}</summary>${questionsOf(a,bank).map(q=>`<div class="feedback-item"><strong>${E(q.prompt)}</strong><p>Tu respuesta: ${E((a.answers?.[q.id]||[]).map(id=>q.options.find(o=>o.id===id)?.text||id).join(' · ')||'Sin respuesta')}</p><p>Solución: ${E(q.options.filter(o=>q.correct.includes(o.id)).map(o=>o.text).join(' · '))}</p><p class="muted">${E(q.explanation)}</p>${safeUrl(q.reference)?`<a href="${E(q.reference)}" target="_blank" rel="noopener noreferrer">Referencia ↗</a>`:''}</div>`).join('')}</details>`).join(''):'<p class="muted">Todavía no hay intentos. Cada resultado quedará guardado aquí.</p>'}</article>`;
}

function renderNotesForDay(day) {
  const st=ds(day.id);
  return `<article class="card"><div class="section-heading"><h3>Tu cuaderno de laboratorio</h3><span id="save-status" class="muted">Guardado automático</span></div><label class="field">Notas y reflexión<textarea id="day-notes" data-day="${day.id}" rows="9" maxlength="100000" placeholder="Qué entendí, qué comprobé y qué me falta practicar…">${E(st.notes||'')}</textarea></label><div class="button-row">${button(st.favorite?'★ En favoritos':'☆ Guardar en favoritos','favorite',`data-id="${day.id}"`,'ghost')}</div><p class="muted">Puedes escribir respuestas abiertas. Se guardan como reflexión y no reciben una calificación automática.</p></article>
  <article class="card"><h3>Dudas por resolver</h3><form id="doubt-form" data-day="${day.id}" class="inline-form"><label class="field">Nueva duda<input name="text" required maxlength="1000" placeholder="¿Qué quiero entender mejor?"></label><button class="btn secondary" type="submit">Añadir duda</button></form><ul class="doubts-list">${(st.doubts||[]).map(q=>`<li><label class="check-row"><input type="checkbox" data-doubt="${E(q.id)}" data-day="${day.id}" ${q.resolved?'checked':''}><span>${E(q.text)}</span><span class="badge">${q.resolved?'Resuelta':'Abierta'}</span></label></li>`).join('')}</ul></article>
  <article class="card"><h3>Evidencia de tu práctica</h3><p class="muted">Texto, enlaces y archivos de hasta 10 MiB cada uno. Se guardan en este navegador. Un archivo subido no equivale a una práctica verificada.</p><form id="evidence-link-form" data-day="${day.id}"><label class="field">Título<input name="title" required maxlength="200"></label><label class="field">Enlace HTTPS o explicación<textarea name="content" rows="3" required maxlength="10000"></textarea></label><button class="btn secondary" type="submit">Guardar evidencia</button></form><label class="upload-control">Adjuntar archivo<input type="file" id="evidence-file" data-day="${day.id}" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,application/json,.log,.txt,.csv,.json,.pdf"></label><ul class="attachment-list">${(st.evidence||[]).map(v=>`<li><div><strong>${E(v.name||v.title||'Evidencia')}</strong><p class="muted">${E(v.content||`${Math.round((v.size||0)/1024)} KiB · adjunto local`)}</p><span class="badge">Autodeclarada</span></div><div class="button-row">${v.dataUrl||v.dataURL?button('Descargar','evidence-download',`data-id="${E(v.id)}" data-day="${day.id}"`,'ghost'):safeUrl(v.content)?`<a class="btn ghost" href="${E(v.content)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>`:''}${button('Eliminar','evidence-delete',`data-id="${E(v.id)}" data-day="${day.id}"`,'ghost')}</div></li>`).join('')||'<li class="muted">Tus primeras evidencias aparecerán aquí.</li>'}</ul></article>`;
}

function renderDay(id,tab) {
  const day=days.find(d=>d.id===id); if(!day) return '<div class="empty-state"><h2>Sesión no encontrada</h2><a href="#path">Volver a la ruta</a></div>';
  const tabs=[['learn','Aprender'],['resources','Recursos'],['practice','Practicar'],['quiz','Evaluar'],['notes','Notas y evidencia']];
  const c=completion(day);
  const body=tab==='resources'?renderResources(day):tab==='practice'?renderPractice(day):tab==='quiz'?renderQuiz(day):tab==='notes'?renderNotesForDay(day):`<article class="card"><span class="eyebrow">HOY VAS A EXPLORAR</span><h3>${E(day.title)}</h3><ul class="topic-list">${day.topics.map(t=>`<li>${E(t)}</li>`).join('')}</ul><div class="notice"><strong>Resultado esperado</strong><p>${E(day.task)}</p></div><p>${E(day.evidence)}</p><div class="button-row">${button('Empezar con los recursos →','goto',`data-hash="day/${day.id}/resources"`)}</div></article><article class="card"><h3>Tu método de estudio</h3><div class="mini-checks"><p><strong>01 · Entiende.</strong> Mira el segmento relevante y lee su referencia.</p><p><strong>02 · Experimenta.</strong> Realiza la tarea con datos de práctica.</p><p><strong>03 · Comprueba.</strong> Resuelve el reto y la prueba sin consultar una solución.</p><p><strong>04 · Conserva.</strong> Guarda tu evidencia y las dudas que quieras resolver.</p></div><p class="muted">Las prácticas están limitadas a equipos propios o entornos autorizados.</p></article>`;
  return `<div class="section-heading"><div><a class="text-link" href="#path">← Ruta de aprendizaje</a><p class="eyebrow">SEMANA ${day.week} / DÍA ${day.day} · ${day.duration||100} MIN ORIENTATIVOS</p><h2>${E(day.title)}</h2></div>${dayBadge(day)}</div>${!unlocked(day)?'<div class="notice">Estás explorando una sesión futura. Puedes leerla y guardar notas; el avance oficial requiere superar las sesiones anteriores.</div>':''}<div class="tabs" aria-label="Secciones del aula">${tabs.map(([k,l])=>`<a class="tab ${tab===k?'active':''}" ${tab===k?'aria-current="page"':''} href="#day/${day.id}/${k}">${l}</a>`).join('')}</div><div class="day-layout"><div class="study-panel">${body}</div><aside class="card study-aside"><span class="eyebrow">TU SESIÓN</span><h3>Paso a paso</h3><div class="mini-checks"><a href="#day/${day.id}/resources">${c.resourcesReady?'✓':'○'} Recursos · ${c.resourcesDone}/${c.resourcesTotal}</a><a href="#day/${day.id}/practice">${c.challengeReady?'✓':'○'} Reto aplicado</a><a href="#day/${day.id}/quiz">${c.quizPassed?'✓':'○'} Prueba · 80%</a></div>${bar([c.resourcesReady,c.challengeReady,c.quizPassed].filter(Boolean).length,3)}<div class="timer-display" data-timer>00:00</div><div class="button-row">${button(snapshot().timer?.running?'Pausar':'Concentrarme','timer-toggle',`data-id="${day.id}"`,'secondary')}${button('Registrar','timer-log','','ghost')}</div><p class="muted">Sin fecha límite. Un día se activa al superar el anterior.</p></aside></div>`;
}

function renderNotes() {
  const matches=days.filter(d=>{const st=ds(d.id);return(st.notes||(st.doubts||[]).length||(st.evidence||[]).length)&&(!noteFilter||`${d.title} ${st.notes||''} ${(st.doubts||[]).map(q=>q.text).join(' ')}`.toLowerCase().includes(noteFilter.toLowerCase()));});
  return `<div class="section-heading"><div><span class="eyebrow">PIENSA · PRUEBA · DOCUMENTA</span><h2>Tu aprendizaje, con tus palabras.</h2></div>${button('Exportar notas','notes-export','','secondary')}</div><label class="field">Buscar en tu bitácora<input id="notes-search" type="search" value="${E(noteFilter)}" placeholder="Un tema, una pregunta o un hallazgo…"></label><div class="notes-list">${matches.map(d=>{const st=ds(d.id);return `<article class="card"><div class="section-heading"><span class="eyebrow">SEMANA ${d.week} · DÍA ${d.day}</span>${st.favorite?'<span>★</span>':''}</div><h3><a href="#day/${d.id}/notes">${E(d.title)}</a></h3><p class="note-text">${E((st.notes||'Sin nota escrita').slice(0,350))}</p><div class="hero-pills"><span class="chip">${(st.doubts||[]).filter(q=>!q.resolved).length} dudas abiertas</span><span class="chip">${(st.evidence||[]).length} evidencias</span></div></article>`;}).join('')||'<div class="empty-state"><h3>Tu cuaderno está listo.</h3><p>Abre una sesión y guarda una idea, una duda o la evidencia de tu práctica.</p><a href="#day/w01d1/notes" class="btn primary">Escribir mi primera nota</a></div>'}</div>`;
}

function renderProgress() {
  const done=completedDays(), attempts=attemptHistory(), stages=[...new Set(curriculum.weeks.map(w=>w.stage))];
  const achievements=[['Primer paso',done.length>=1,'Completa tu primera sesión.'],['Una semana de bases',done.length>=7,'Supera siete sesiones.'],['Laboratorio en marcha',days.some(d=>(ds(d.id).evidence||[]).length),'Conserva una evidencia.'],['Tu voz importa',days.some(d=>ds(d.id).notes),'Escribe tu primera nota.']];
  return `<div class="section-heading"><div><span class="eyebrow">EVIDENCIA DE TU ESFUERZO</span><h2>Lo que construyes cuenta.</h2><p class="muted">Actividad registrada y resultados de práctica. Sin promesas de aprobación de exámenes externos.</p></div></div><div class="stats-grid">${cardStat('Recorrido',`${pct(done.length,364)}%`,`${done.length} de 364 sesiones`)}${cardStat('Práctica registrada',`${Math.round(sessionMinutes())} min`,'Sesiones de concentración guardadas')}${cardStat('Intentos',attempts.length,'Incluye reintentos')}${cardStat('XP',done.length*100,'100 por sesión superada')}</div><div class="dashboard-grid"><article class="card"><h3>Progreso por etapa</h3>${stages.map(s=>{const group=days.filter(d=>curriculum.weeks.find(w=>w.number===d.week).stage===s), n=group.filter(d=>completion(d).completed).length;return `<div class="stage-row"><div class="section-heading"><strong>${E(s)}</strong><span class="muted">${n}/${group.length}</span></div>${bar(n,group.length)}</div>`;}).join('')}</article><article class="card"><h3>Pequeños hitos, habilidades reales</h3>${achievements.map(([t,yes,desc])=>`<div class="achievement ${yes?'achieved':''}"><span class="achievement-icon">${yes?'✦':'◇'}</span><div><strong>${t}</strong><p class="muted">${desc}</p></div><span class="badge">${yes?'Logrado':'Por descubrir'}</span></div>`).join('')}</article><article class="card"><h3>Camino de certificaciones</h3><div class="mini-checks"><p><strong>A+ y Network+</strong> · Fundamentos, sin cobertura completa de sus exámenes.</p><p><strong>ISC2 CC</strong> · Primer examen opcional.</p><p><strong>Security+</strong> · Confirma versión y cobertura oficial al preparar el examen.</p><p><strong>BTL1</strong> · Requiere su formación oficial y laboratorios.</p></div><form id="cert-form"><label class="field">Versión objetivo de Security+<input name="version" value="${E(snapshot().certification?.version||'')}" placeholder="Versión confirmada en la fuente oficial" maxlength="80"></label><label class="field">Notas de preparación<textarea name="notes" rows="3" maxlength="4000">${E(snapshot().certification?.notes||'')}</textarea></label><button class="btn secondary" type="submit">Guardar objetivo</button></form></article><article class="card"><h3>Últimos resultados</h3>${attempts.slice(-8).reverse().map(a=>`<a class="result-row" href="#day/${a.day.id}/quiz"><span>${E(a.day.title)}</span><span class="badge ${passed(a)?'success':''}">${Math.round(grade(a))}%</span></a>`).join('')||'<p class="muted">La primera prueba será tu punto de partida. Los errores te dirán qué practicar después.</p>'}</article></div>`;
}

function renderSettings() {
  const state=snapshot();
  return `<div class="section-heading"><div><span class="eyebrow">A TU MEDIDA</span><h2>Tu espacio. Tus preferencias.</h2></div><a class="btn secondary" href="./GUIA_GITHUB.html" target="_blank">Guía de GitHub ↗</a></div><div class="dashboard-grid"><article class="card"><h3>Perfil y estudio</h3><form id="settings-form"><label class="field">Nombre<input name="name" value="${E(state.profile?.name||'')}" maxlength="60"></label><label class="field">Meta de minutos por semana<input type="number" name="weeklyMinutes" min="30" max="6000" step="30" required value="${Number(state.profile?.weeklyMinutes)||720}"></label><label class="field">Apariencia<select name="theme"><option value="dark" ${state.preferences.theme==='dark'?'selected':''}>Noche en el laboratorio</option><option value="light" ${state.preferences.theme==='light'?'selected':''}>Luz de estudio</option></select></label><label class="check-row"><input type="checkbox" name="motion" ${state.preferences.motion!==false?'checked':''}>Animaciones y partículas decorativas</label><p class="muted">Se respeta también la preferencia de movimiento reducido de tu sistema.</p><button class="btn primary" type="submit">Guardar preferencias</button></form></article>
  <article class="card"><h3>Protege tu recorrido</h3><p>Tu progreso se guarda en este navegador. No se sincroniza y no se sube al repositorio. Borrar datos del navegador o cambiar de dominio puede dejarlo inaccesible.</p><p class="muted">Último respaldo: ${state.lastBackupAt?E(new Date(state.lastBackupAt).toLocaleString()):'Todavía no has exportado uno'}.</p><div class="button-row">${button('Exportar respaldo completo','backup','','primary')}${button('Exportar sin adjuntos','backup-light','','secondary')}</div><label class="upload-control">Importar respaldo JSON<input type="file" id="backup-import" accept="application/json,.json"></label><p id="storage-info" class="muted">Los adjuntos tienen un límite de 10 MiB por archivo y 100 MiB en total, sujeto a la cuota del navegador.</p><div id="import-preview"></div></article>
  <article class="card"><h3>Qué contiene esta entrega</h3><p>52 semanas y 364 sesiones, con todos sus recursos de origen. Pruebas y retos: semanas 1 a 4. Las semanas 5 a 52 permiten lectura y notas; sus evaluaciones están pendientes.</p><p class="muted">Algunos videos son cursos o listas generales. La página no afirma que haya un video específico para cada subtema ni que pueda verificar que lo viste.</p><a class="text-link" href="./CONTENT_STATUS.md" target="_blank">Consultar estado del contenido →</a></article>
  <article class="card danger-zone"><h3>Reiniciar datos de este navegador</h3><p>Elimina notas, intentos, adjuntos y progreso local. Exporta antes un respaldo completo.</p>${button('Reiniciar mi recorrido','reset','','danger')}</article></div>`;
}

function render() {
  if(!days) return;
  const route=readRoute();
  $('#page-title').textContent=labels[route.page]||labels.home;
  const subtitle=$('#header-subtitle');if(subtitle) subtitle.textContent='Aprende. Practica. Hazlo tuyo.';
  document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.getAttribute('href')===`#${route.page==='day'?'path':route.page}`;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#main-content').innerHTML=route.page==='path'?renderPath():route.page==='day'?renderDay(route.id,route.tab):route.page==='notes'?renderNotes():route.page==='progress'?renderProgress():route.page==='settings'?renderSettings():renderHome();
  updateTimer();
  if(route.page==='settings') getStorageInfo().then(info=>{const target=$('#storage-info');if(target)target.textContent=`Adjuntos locales: ${(info.evidenceBytes/1048576).toFixed(1)} MiB. Máximo 10 MiB por archivo y 100 MiB totales${info.quota?`. Cuota estimada del navegador: ${Math.round(info.quota/1048576)} MiB`:'. La cuota depende del navegador'}.`;}).catch(()=>{});
}

function download(data, name, type='application/json') {
  const blob=data instanceof Blob?data:new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function updateTimer() {
  if(!snapshot())return;const ms=getTimerMs(snapshot()), secs=Math.floor(ms/1000),t=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  document.querySelectorAll('[data-timer]').forEach(el=>el.textContent=t);document.querySelectorAll('[data-action="timer-toggle"]').forEach(el=>el.textContent=snapshot().timer?.running?'Pausar':'Concentrarme');
}
async function flushNotes() { clearTimeout(noteTimer); await currentDraftSave;const el=$('#day-notes');if(el&&el.value!==(ds(el.dataset.day).notes||''))await commit(s=>{ensureDay(s,el.dataset.day).notes=el.value;},false); }

async function handleAction(e) {
  const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
  const action=btn.dataset.action,id=btn.dataset.id;
  if(action==='onboard') return;
  e.preventDefault();
  try {
    if(action==='goto') {await flushNotes();navigate(btn.dataset.hash);}
    if(action==='search'){navigate('path');setTimeout(()=>$('#path-search')?.focus(),30);}
    if(action==='page'){pageNumber=Number(btn.dataset.n);render();$('#main-content').scrollIntoView({block:'start'});}
    if(action==='favorite')await commit(s=>{const d=ensureDay(s,id);d.favorite=!d.favorite;});
    if(action==='embed') {const url=embedUrl(btn.dataset.url);if(!url)return;const slot=$(`#video-slot-${btn.dataset.resource}`);slot.innerHTML=`<iframe title="Reproductor del recurso de estudio" src="${E(url)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><p class="muted">Si el proveedor bloquea la reproducción, utiliza Abrir fuente. Reproducir no marca el recurso como estudiado.</p>`;}
    if(action==='quiz-start') {
      const day=days.find(d=>d.id===id),c=completion(day);if(!unlocked(day)||!c.resourcesReady||!c.challengeReady)throw new Error('Completa primero los recursos y el reto de esta sesión.');
      const a=createAttempt(banks.get(id),{count:day.day===7?15:6});await commit(s=>{ensureDay(s,id).draft={...a,answers:{}};});
    }
    if(action==='timer-toggle'){if(snapshot().timer?.running)await pauseTimer();else await startTimer(id||currentDay().id);render();}
    if(action==='timer-log'){await pauseTimer();if(getTimerMs(snapshot())<1000){toast('Registra al menos un segundo de estudio.');return;}await logTimer();toast('Tiempo de estudio registrado.');render();}
    if(action==='notes-export'){await flushNotes();const text=days.filter(d=>ds(d.id).notes).map(d=>`SEMANA ${d.week} / DÍA ${d.day} · ${d.title}\n\n${ds(d.id).notes}\n\nDudas:\n${(ds(d.id).doubts||[]).map(q=>`[${q.resolved?'x':' '}] ${q.text}`).join('\n')}`).join('\n\n────────────\n\n');download(text,'cybertrack-notas.txt','text/plain');}
    if(action==='backup'||action==='backup-light') {
      await flushNotes();const full=structuredClone(snapshot());
      if(action==='backup-light')for(const d of Object.values(full.days))d.evidence=(d.evidence||[]).filter(x=>!x.dataUrl&&!x.dataURL);
      full.lastBackupAt=new Date().toISOString();const data=exportBackup(full);download(data,`cybertrack-respaldo-${action==='backup-light'?'sin-adjuntos-':''}${new Date().toISOString().slice(0,10)}.json`);await commit(s=>{s.lastBackupAt=full.lastBackupAt;});toast(action==='backup-light'?'Respaldo ligero exportado: no incluye archivos.':'Respaldo completo exportado, incluidos los adjuntos.');
    }
    if(action==='import-cancel'){imported=null;$('#import-preview').innerHTML='';}
    if(action==='import-merge'||action==='import-replace') {
      if(!imported)return;
      if(action==='import-replace'&&!confirm('Se reemplazarán los datos locales. Antes se descargará un respaldo completo. ¿Continuar?'))return;
      download(exportBackup(snapshot()),'cybertrack-antes-de-importar.json');
      const next=action==='import-merge'?mergeStates(snapshot(),imported):imported;await replaceState(next);imported=null;applyPreferences();render();toast('Respaldo importado. Tu recorrido se ha restaurado.');
    }
    if(action==='reset'){if(!confirm('¿Exportaste tu respaldo? Esta acción eliminará todo el progreso de este navegador.'))return;const input=prompt('Escribe REINICIAR para confirmar.');if(input!=='REINICIAR')return;await replaceState(createDefaultState());applyPreferences();navigate('home');render();toast('Recorrido reiniciado.');}
    if(action==='evidence-delete'){if(!confirm('¿Eliminar esta evidencia local?'))return;await commit(s=>{const d=ensureDay(s,btn.dataset.day);d.evidence=d.evidence.filter(x=>x.id!==id);});}
    if(action==='evidence-download'){const v=(ds(btn.dataset.day).evidence||[]).find(x=>x.id===id);const data=v?.dataUrl||v?.dataURL;if(!data?.startsWith('data:'))return;const response=await fetch(data);download(await response.blob(),v.name||'evidencia');}
  } catch(err){toast(err.message,true);}
}

async function handleSubmit(e) {
  const form=e.target;if(!['onboarding','settings-form','challenge-form','quiz-form','doubt-form','evidence-link-form','cert-form'].includes(form.id)&&!form.classList.contains('replacement-form'))return;
  e.preventDefault();const data=new FormData(form),id=form.dataset.day;
  try {
    if(form.id==='onboarding')await commit(s=>{s.profile.name=String(data.get('name')||'').trim();s.profile.onboarded=true;});
    if(form.id==='settings-form'){const saved=await commit(s=>{s.profile.name=String(data.get('name')||'').trim();s.profile.weeklyMinutes=Math.max(30,Math.min(6000,Number(data.get('weeklyMinutes'))||720));s.preferences.theme=data.get('theme')==='light'?'light':'dark';s.preferences.motion=data.get('motion')==='on';});if(saved)toast('Preferencias guardadas.');}
    if(form.id==='cert-form'){const saved=await commit(s=>{s.certification={version:String(data.get('version')||''),notes:String(data.get('notes')||''),reviewedAt:new Date().toISOString()};});if(saved)toast('Objetivo guardado.');}
    if(form.classList.contains('replacement-form')){const url=safeUrl(data.get('url'));if(!url)throw new Error('Usa una URL HTTPS válida.');const saved=await commit(s=>{const d=ensureDay(s,id);d.resourceOverrides||={};d.resourceOverrides[form.dataset.rid]={url,reason:String(data.get('reason')),changedAt:new Date().toISOString()};});if(saved)toast('Recurso alternativo registrado.');}
    if(form.id==='doubt-form')await commit(s=>ensureDay(s,id).doubts.push({id:crypto.randomUUID(),text:String(data.get('text')).trim(),resolved:false,createdAt:new Date().toISOString()}));
    if(form.id==='evidence-link-form')await commit(s=>ensureDay(s,id).evidence.push({id:crypto.randomUUID(),title:String(data.get('title')),content:String(data.get('content')),createdAt:new Date().toISOString(),type:'text'}));
    if(form.id==='challenge-form') {
      const day=days.find(d=>d.id===id);if(!unlocked(day))throw new Error('Completa antes las sesiones anteriores.');const selections=data.getAll('challenge').map(String);if(!selections.length)throw new Error('Selecciona una respuesta.');const result=evaluateChallenge(banks.get(id).challenge,selections);const ok=typeof result==='boolean'?result:result.passed??result.correct;
      const saved=await commit(s=>{const d=ensureDay(s,id);d.challengePassed=d.challengePassed||!!ok;d.challengeFeedback=`${ok?'Solución correcta.':'Revisa el escenario.'} ${banks.get(id).challenge.explanation}`;});if(saved)toast(ok?'Reto superado. Puedes preparar tu prueba.':'Prueba otra interpretación del escenario.',!ok);
    }
    if(form.id==='quiz-form') {
      const day=days.find(d=>d.id===id),c=completion(day);if(!unlocked(day)||!c.resourcesReady||!c.challengeReady)throw new Error('Faltan requisitos para entregar esta prueba.');const draft=ds(id).draft;if(!draft)return;
      const answers=Object.fromEntries(questionsOf(draft,banks.get(id)).map(q=>[q.id,data.getAll(q.id).map(String)]));
      if(Object.values(answers).some(a=>!a.length))throw new Error('Responde todas las preguntas antes de entregar.');
      const result=scoreAttempt(draft,answers);const finished={...draft,answers,result,score:result.percentage??result.score,passed:result.passed,submittedAt:new Date().toISOString()};
      const saved=await commit(s=>{const d=ensureDay(s,id);if(!d.attempts.some(a=>a.id===finished.id))d.attempts.push(finished);d.draft=null;});if(saved)toast(result.passed?'Prueba superada. Tu siguiente sesión está lista.':'Intento guardado. Revisa las explicaciones y vuelve a practicar.',!result.passed);
    }
  }catch(err){toast(err.message,true);}
}

function handleInput(e) {
  const el=e.target;
  if(el.id==='path-search'){pathFilter=el.value;pageNumber=1;const pos=el.selectionStart;render();$('#path-search').focus();$('#path-search').setSelectionRange(pos,pos);}
  if(el.id==='notes-search'){noteFilter=el.value;const pos=el.selectionStart;render();$('#notes-search').focus();$('#notes-search').setSelectionRange(pos,pos);}
  if(el.id==='day-notes') {clearTimeout(noteTimer);const status=$('#save-status');if(status)status.textContent='Guardando…';noteTimer=setTimeout(()=>{currentDraftSave=commit(s=>{ensureDay(s,el.dataset.day).notes=el.value;},false).then(ok=>{const t=$('#save-status');if(t)t.textContent=ok?'Guardado en este navegador':'No se pudo guardar';});},350);}
}

async function handleChange(e) {
  const el=e.target;
  try {
    if(el.id==='stage-filter'){stageFilter=el.value;pageNumber=1;render();}
    if(el.dataset.resourceCheck){const day=days.find(d=>d.id===el.dataset.day);if(!unlocked(day)){render();return;}await commit(s=>{ensureDay(s,day.id).resources[el.dataset.resourceCheck]=el.checked;},false);const y=scrollY;render();scrollTo(0,y);}
    if(el.dataset.doubt)await commit(s=>{const q=ensureDay(s,el.dataset.day).doubts.find(q=>q.id===el.dataset.doubt);if(q)q.resolved=el.checked;});
    if(el.closest('#quiz-form')){const form=el.closest('form'),id=form.dataset.day,fd=new FormData(form);await commit(s=>{const draft=ensureDay(s,id).draft;if(draft)draft.answers=Object.fromEntries(questionsOf(draft,banks.get(id)).map(q=>[q.id,fd.getAll(q.id).map(String)]));},false);}
    if(el.id==='evidence-file'){const file=el.files[0];if(!file)return;const total=Object.values(snapshot().days).flatMap(d=>d.evidence||[]).reduce((a,v)=>a+(v.size||0),0);if(total+file.size>100*1024*1024)throw new Error('El límite local de adjuntos es de 100 MiB. Exporta un respaldo y elimina archivos que no necesites.');const evidence=await evidenceFromFile(file);const saved=await commit(s=>ensureDay(s,el.dataset.day).evidence.push(evidence));if(saved)toast('Evidencia guardada en este navegador.');}
    if(el.id==='backup-import') {
      const file=el.files[0];if(!file)return;if(file.size>160*1024*1024)throw new Error('El respaldo es demasiado grande para esta versión.');
      imported=parseBackup(await file.text());const summary=previewImport(snapshot(),imported);
      $('#import-preview').innerHTML=`<div class="notice"><h3>Revisar importación</h3><p>El respaldo contiene ${summary.incoming.days} sesiones guardadas, ${summary.incoming.notes} notas, ${summary.incoming.attempts} intentos y ${summary.incoming.attachments} archivos.</p><p>Se descargará un respaldo previo antes de modificar tus datos.</p><div class="button-row">${button('Combinar','import-merge')}${button('Reemplazar','import-replace','','secondary')}${button('Cancelar','import-cancel','','ghost')}</div></div>`;
    }
  } catch(err){toast(err.message,true);if(el.type==='file')el.value='';}
}

async function boot() {
  try {
    const data=await loadCurriculum();curriculum=data.curriculum;days=curriculum.weeks.flatMap(w=>w.days);banks=data.banks;
    await loadState();motion=initMotion({enabled:snapshot().preferences.motion!==false});applyPreferences();
    document.addEventListener('click',e=>{if(e.target.closest('.skip-link')){e.preventDefault();$('#main-content').focus();return;}handleAction(e);});document.addEventListener('submit',handleSubmit);document.addEventListener('input',handleInput);document.addEventListener('change',handleChange);
    $('#theme-toggle')?.addEventListener('click',()=>commit(s=>{s.preferences.theme=s.preferences.theme==='dark'?'light':'dark';}));
    $('#motion-toggle')?.addEventListener('click',()=>commit(s=>{s.preferences.motion=!s.preferences.motion;}));
    subscribe(()=>{applyPreferences();updateTimer();});
    initTimer(updateTimer);initRouter(()=>{render();const route=readRoute();if(route.page==='day'&&days.some(d=>d.id===route.id))commit(s=>{ensureDay(s,route.id).lastTab=route.tab;},false);window.scrollTo({top:0,behavior:'instant'});});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushNotes();});
    window.addEventListener('pagehide',()=>flushNotes());
  } catch(err) {
    $('#main-content').innerHTML=`<section class="empty-state"><h2>No pudimos abrir tu laboratorio.</h2><p>${E(err.message)}</p><p>Comprueba que subiste index.html y las carpetas assets y data en la misma raíz. En tu computadora usa un servidor local; abrir el HTML con doble clic no carga los JSON.</p><a class="btn primary" href="./GUIA_GITHUB.html">Ver guía de instalación</a><p>No se han reiniciado tus datos.</p></section>`;
  }
}
boot();
