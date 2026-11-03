import { loadState, getState, mutateState, subscribe, ensureDay, createDefaultState, replaceState, getStorageInfo } from './storage.js';
import { getDayCompletion } from './progress.js';
import { createAttempt, scoreAttempt, evaluateChallenge } from './assessments.js';
import { getTimerMs, startTimer, pauseTimer, logTimer, logManualStudy, initTimer } from './timer.js?v=1.5.0';
import { exportBackup, parseBackup, mergeStates, previewImport, evidenceFromFile } from './backup.js';
import { loadCurriculum, safeUrl, embedUrl } from './resources.js?v=1.5.0';
import { readRoute, navigate, initRouter } from './router.js?v=1.5.0';
import { initMotion } from './motion.js?v=1.5.0';
import { createNoteDrafts } from './draft-notes.js';
import { renderAnalytics, summarizeLearning } from './analytics.js';

const $ = (s, root = document) => root.querySelector(s);
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let curriculum, days, banks, motion, notes, imported = null, searchTimer, loadBank = async () => {};
let pathFilter = '', stageFilter = '', pageNumber = 1, noteFilter = '';
let chartRange = 7;
const pageSize = 8;
const labels = { home: 'Inicio', path: 'Ruta de estudio', day: 'Aula', notes: 'Cuaderno', progress: 'Progreso', settings: 'Ajustes' };

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
function unlocked(day) { const index=days.findIndex(item=>item.id===day.id);return index>=0&&index<=days.findIndex(item=>item.id===currentDay().id); }
function ds(id) { return snapshot().days[id] || {}; }
function completedDays() { return days.filter(d => completion(d).completed); }
function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }
function bar(n, total) { return `<div class="progress-track" role="progressbar" aria-label="Progreso" aria-valuenow="${pct(n,total)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${pct(n,total)}%"></div></div>`; }
function button(text, action, extra = '', classes = 'primary') { return `<button class="btn ${classes}" data-action="${action}" ${extra}>${text}</button>`; }
function cardStat(label, value, sub = '') { return `<article class="card stat"><div class="stat-top"><span class="stat-label">${label}</span></div><strong class="stat-value">${value}</strong>${sub?`<span class="muted">${sub}</span>`:''}</article>`; }
function count(value,suffix='') { return `<span data-count="${Number(value)||0}">${Number(value)||0}</span>${suffix}`; }
function chartOptions(compact=false) { return {rangeDays:chartRange,banksReadyFn:id=>banks.has(id),compact}; }
function stageVisual(stage) {
  const stages=[...new Set(curriculum.weeks.map(week=>week.stage))];
  const found=stages.indexOf(stage), index=found>=0&&found<6?found:0;
  const descriptions=['Equipos, sistemas operativos y herramientas básicas.','Conectividad, protocolos y resolución de problemas.','Amenazas, controles y protección de la información.','Arquitectura, operaciones y gestión de la seguridad.','Investigación, registros y respuesta a incidentes.','Portafolio, entrevistas y búsqueda de empleo.'];
  return {src:`./assets/images/stage-${String(index+1).padStart(2,'0')}.webp`,alt:`Ilustración conceptual de ${stages[index]||'Base informática'}`,description:descriptions[index],width:index<3?1024:1200,height:index<3?683:800};
}
function stageImage(stage,className,{priority=false,decorative=true}={}) {
  const visual=stageVisual(stage);
  return `<img class="${E(className)}" src="${visual.src}" alt="${decorative?'':E(visual.alt)}" width="${visual.width}" height="${visual.height}" loading="${priority?'eager':'lazy'}" decoding="async"${priority?' fetchpriority="high"':''}>`;
}
function weekVisual(weekNumber) {
  const number=Math.max(1,Math.min(52,Math.trunc(Number(weekNumber))||1));
  const week=curriculum.weeks.find(item=>item.number===number);
  return {src:`./assets/images/weeks/week-${String(number).padStart(2,'0')}.webp`,alt:`Portada de la semana ${number}: ${week?.title||'Programa de estudio'}`,title:week?.title||'Programa de estudio',width:1024,height:683};
}
function weekImage(weekNumber,className,{priority=false,decorative=true}={}) {
  const visual=weekVisual(weekNumber);
  return `<img class="${E(className)}" src="${visual.src}" alt="${decorative?'':E(visual.alt)}" width="${visual.width}" height="${visual.height}" loading="${priority?'eager':'lazy'}" decoding="async"${priority?' fetchpriority="high"':''}>`;
}
function stageMap() {
  const stages=[...new Set(curriculum.weeks.map(w=>w.stage))],symbols=['01','02','03','04','05','06'];
  const colors=['var(--chart-indigo)','var(--chart-cyan)','var(--chart-coral)','var(--chart-violet)','var(--chart-blue)','var(--chart-ochre)'];
  const distribution=stages.map((stage,i)=>{const total=days.filter(d=>d.stage===stage).length;return `<span style="width:${total/days.length*100}%;--stage-color:${colors[i]}" title="${E(stage)}: ${total} sesiones"></span>`;}).join('');
  return `<section class="card stage-map-card"><div class="chart-heading"><div><h3>Etapas de estudio</h3></div><a href="#path" class="text-link">Explorar 52 semanas ↗</a></div><div class="distribution-caption"><span>Distribución del programa</span><span>${stages.length} etapas · ${days.length} sesiones</span></div><div class="program-distribution" role="img" aria-label="Distribución del programa: ${stages.map(s=>`${E(s)}, ${days.filter(d=>d.stage===s).length} sesiones`).join('; ')}">${distribution}</div><div class="stage-map">${stages.map((s,i)=>{const group=days.filter(d=>d.stage===s),done=group.filter(d=>completion(d).completed).length;const active=group.some(d=>d.id===currentDay().id);return `<a href="#day/${group[0].id}/learn" class="stage-step ${active?'current':''} ${done===group.length?'finished':''}">${stageImage(s,'stage-visual')}<span class="stage-number" style="--stage-color:${colors[i]}">${symbols[i]}</span><strong>${E(s)}</strong><span class="muted">${done} / ${group.length} sesiones</span>${bar(done,group.length)}</a>`;}).join('')}</div></section>`;
}
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
  try { if(rerender) await flushNotes(); await mutateState(fn); applyPreferences(); if(rerender) render(); return true; }
  catch(err) { toast(`No se guardó: ${err.message}`, true); return false; }
}
function applyPreferences() {
  document.documentElement.dataset.theme = 'light';
  motion?.update(true);
}

function noteStatus(id,status,error) {
  const field=$('#day-notes'); if(field?.dataset.day!==id) return;
  const label=$('#save-status'); if(label)label.textContent=status==='error'?'No se guardó; tu borrador se conserva':status==='saved'?'Guardado en este navegador':'Guardando…';
  const warning=$('#draft-warning');if(warning)warning.hidden=status!=='error';
}
async function flushNotes() { if(notes)await notes.flush(); }
function manualTimeForm(dayId) {
  return `<details class="manual-time"><summary>Registrar estudio externo</summary><form id="manual-time-form" class="manual-time-form"><label class="field">Sesión<select name="dayId" required>${days.map(day=>`<option value="${day.id}" ${day.id===dayId?'selected':''}>${day.week}.${day.day} · ${E(day.title)}</option>`).join('')}</select></label><label class="field">Minutos estudiados<input name="minutes" type="number" min="1" max="720" step="1" required inputmode="numeric"></label><label class="field">Qué estudiaste (opcional)<textarea name="note" maxlength="1000" rows="2"></textarea></label><button class="btn secondary" type="submit">Guardar tiempo</button><p class="muted">Registra solo tiempo real que no hayas guardado con el temporizador.</p></form></details>`;
}
function timerPanel(dayId) {
  return `<p class="active-study-session" data-timer-session></p><div class="timer-display" data-timer>00:00</div><div class="button-row">${button(snapshot().timer?.running?'Pausar':'Concentrarme','timer-toggle',`data-id="${dayId}"`)}${button('Registrar tiempo','timer-log','','secondary')}</div><p class="muted">Se pausa al salir de esta pestaña. Para cursos o laboratorios externos, registra los minutos al terminar.</p>${manualTimeForm(dayId)}`;
}
function updateSessionStatus(day) {
  const status=$('#session-status');if(status)status.innerHTML=dayBadge(day);
  const requirements=$('#session-requirements');if(requirements)requirements.innerHTML=requirementsMarkup(day);
}
function requirementsMarkup(day) {
  const c=completion(day);
  return `<div class="mini-checks"><a href="#day/${day.id}/resources">${c.resourcesReady?'✓':'○'} Recursos · ${c.resourcesDone}/${c.resourcesTotal}</a><a href="#day/${day.id}/practice">${c.challengeReady?'✓':'○'} Reto aplicado</a><a href="#day/${day.id}/quiz">${c.quizPassed?'✓':'○'} Prueba · 80%</a></div>${bar([c.resourcesReady,c.challengeReady,c.quizPassed].filter(Boolean).length,3)}`;
}

function homeStatsMarkup() {
  const completed=completedDays(),goal=snapshot().profile?.weeklyMinutes||720,learning=summarizeLearning(days,snapshot(),id=>banks.has(id));
  return `${cardStat('Sesiones superadas',count(completed.length,'<small> / 364</small>'))}${cardStat('Tiempo esta semana',count(Math.round(weekMinutes()),'<small> min</small>'),`Meta: ${goal} min`)}${cardStat('Promedio de pruebas',learning.averageScore===null?'—':count(Math.round(learning.averageScore),'<small>%</small>'))}${cardStat('Racha actual',count(streak(),'<small> días</small>'),`${completed.length*100} XP`)}`;
}

function renderHome() {
  const day=currentDay(), completed=completedDays(), week=curriculum.weeks.find(w=>w.number===day.week), state=snapshot(), goal=state.profile?.weeklyMinutes||720;
  const weekDone=week.days.filter(d=>completion(d).completed).length;
  const recent=days.filter(d=>ds(d.id).notes).reverse().slice(0,2);
  const doubts=days.flatMap(d=>(ds(d.id).doubts||[]).filter(q=>!q.resolved));
  const c=completion(day), learning=summarizeLearning(days,state,id=>banks.has(id));
  const checks=[['Recursos obligatorios',c.resourcesReady,'resources'],['Reto aplicado',c.challengeReady,'practice'],['Prueba de comprensión',c.quizPassed,'quiz']];
  return `<div class="workspace-greeting"><h2>${state.profile?.name?`Hola, ${E(state.profile.name)}.`:'Mi estudio'}</h2><a href="#progress" class="text-link">Ver métricas ↗</a></div>
  ${!state.profile?.onboarded?`<section class="welcome-strip"><strong>Personaliza tu perfil</strong><form id="onboarding" class="inline-form"><label class="sr-only" for="welcome-name">Nombre</label><input id="welcome-name" name="name" autocomplete="given-name" maxlength="60" placeholder="Tu nombre (opcional)">${button('Guardar','onboard','type="submit"')}</form></section>`:''}
  <div class="overview-layout"><section class="hero command-hero"><div class="hero-copy"><span class="kicker">Semana ${String(day.week).padStart(2,'0')} · Día ${day.day}</span><h2><span class="kinetic-word">${E(day.title)}</span></h2><p>${E(day.topics.slice(0,2).join(' · '))}</p><div class="hero-actions">${button('Continuar estudiando <span aria-hidden="true">↗</span>','goto',`data-hash="day/${day.id}/${ds(day.id).lastTab||'learn'}"`)}<a class="btn ghost" href="#path">Ver programa</a></div></div><div class="hero-art hero-isometric"><div class="hero-orb" aria-hidden="true"></div>${weekImage(day.week,'hero-stage-cover',{priority:true,decorative:false})}</div></section>
  <article class="card focus-card"><div class="section-heading"><span class="eyebrow">Esta semana</span>${dayBadge(day)}</div><div class="focus-number">${String(day.week).padStart(2,'0')}<span>SEMANA<br>DÍA ${day.day} DE 7</span></div><h3>${E(week.title)}</h3><div class="week-dots">${week.days.map(d=>`<a href="#day/${d.id}/learn" class="day-dot ${completion(d).completed?'done':d.id===day.id?'active':''}" aria-label="Día ${d.day}: ${E(d.title)}">${completion(d).completed?'✓':d.day}</a>`).join('')}</div><div class="mini-checks">${checks.map(([l,yes,tab])=>`<a class="check-row" href="#day/${day.id}/${tab}"><span class="status-dot ${yes?'done':''}">${yes?'✓':'○'}</span><span>${l}</span><span>↗</span></a>`).join('')}</div><div class="section-heading"><span class="muted">Sesiones superadas</span><strong>${weekDone}/7</strong></div>${bar(weekDone,7)}</article></div>
  <div class="stats-grid" id="home-stats">${homeStatsMarkup()}</div>
  <details class="home-secondary"><summary>Ver etapas, concentración y notas</summary>${stageMap()}
  <div class="dashboard-columns"><article class="card focus-timer-card"><div class="chart-heading"><h3>Temporizador</h3></div>${timerPanel(day.id)}</article>
  <article class="card"><div class="chart-heading"><h3>Notas recientes</h3><a href="#notes" class="text-link">Ver todas ↗</a></div>${recent.length?recent.map(d=>`<a class="note-preview" href="#day/${d.id}/notes"><strong>${E(d.title)}</strong><p>${E(ds(d.id).notes.slice(0,100))}${ds(d.id).notes.length>100?'…':''}</p></a>`).join(''):'<div class="compact-empty"><p>Guarda tu primera nota desde una sesión.</p></div>'}<a href="#notes" class="text-link">${doubts.length} dudas abiertas →</a></article></div>
  </details><div class="content-footnote">Evaluaciones disponibles: ${banks.size} de ${days.length} sesiones. <a href="#settings">Consultar cobertura ↗</a></div>`;
}

function matchingWeeks() {
  return curriculum.weeks.filter(w=>(!stageFilter||w.stage===stageFilter)&&(!pathFilter||`${w.title} ${w.stage} ${w.days.map(d=>`${d.title} ${d.topics.join(' ')} ${d.resources.map(r=>r.title).join(' ')}`).join(' ')}`.toLocaleLowerCase().includes(pathFilter.toLocaleLowerCase())));
}
function renderPathResults() {
  const matches=matchingWeeks(),count=Math.max(1,Math.ceil(matches.length/pageSize));pageNumber=Math.min(pageNumber,count);
  return `<p class="result-count" role="status">${matches.length} semanas</p><div class="week-grid">${matches.slice((pageNumber-1)*pageSize,pageNumber*pageSize).map(w=>{const n=w.days.filter(d=>completion(d).completed).length,ready=w.days.every(d=>banks.has(d.id));return `<article class="card week-card">${weekImage(w.number,'stage-cover')}<div class="section-heading"><span class="eyebrow">SEMANA ${String(w.number).padStart(2,'0')}</span><span class="badge ${ready?'accent':''}">${ready?'Evaluación lista':'Solo contenido'}</span></div><span class="muted">${E(w.stage)}</span><h3 class="week-title">${E(w.title)}</h3>${bar(n,7)}<details class="week-days" ${w.number===currentDay().week?'open':''}><summary>Ver 7 sesiones · ${n}/7 superadas</summary><div class="route-days">${w.days.map(d=>`<a class="route-day ${d.id===currentDay().id?'current':''}" href="#day/${d.id}/learn"><span class="day-dot ${completion(d).completed?'done':''}">${completion(d).completed?'✓':d.day}</span><span>${E(d.title)}</span><span aria-label="${unlocked(d)?'Disponible':'Vista previa'}">${unlocked(d)?'↗':'◌'}</span></a>`).join('')}</div></details></article>`;}).join('')||'<div class="empty-state">No encontramos ese tema. Prueba otra palabra.</div>'}</div><div class="pagination">${button('← Anterior','page',`data-n="${pageNumber-1}" ${pageNumber===1?'disabled':''}`,'secondary')}<span>Página ${pageNumber} de ${count}</span>${button('Siguiente →','page',`data-n="${pageNumber+1}" ${pageNumber===count?'disabled':''}`,'secondary')}</div>`;
}
function renderPath() {
  const stages=[...new Set(curriculum.weeks.map(w=>w.stage))];
  return `<section class="section-heading route-banner"><div><h2>Programa de estudio</h2></div><span class="badge accent">${completedDays().length} / 364</span></section><div class="filter-bar"><label class="field">Buscar tema<input id="path-search" type="search" value="${E(pathFilter)}" placeholder="Redes, Linux, phishing…"></label><label class="field">Etapa<select id="stage-filter"><option value="">Todas las etapas</option>${stages.map(s=>`<option value="${E(s)}" ${s===stageFilter?'selected':''}>${E(s)}</option>`).join('')}</select></label></div><div id="path-results">${renderPathResults()}</div>`;
}
function updateResults(kind) {
  const region=$(`#${kind}-results`);
  if(region)region.innerHTML=kind==='path'?renderPathResults():renderNotesList();
  else render({animate:false});
}

function resourceActions(url,index) {
  const embed=embedUrl(url);
  return `${embed?button('▶ Reproducir aquí','embed',`data-url="${E(url)}" data-resource="${index}"`,'secondary'):''}${url?`<a class="btn ghost" href="${E(url)}" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a>`:'<span class="badge">Enlace no disponible</span>'}`;
}
function renderResources(day) {
  return `<div class="notice">Marca un recurso después de estudiarlo. Es tu registro personal de estudio; la comprensión se comprueba con la práctica y la prueba.</div>${day.resources.map((r,i)=>{
    const override=ds(day.id).resourceOverrides?.[r.id], url=safeUrl(override?.url||r.url), embed=embedUrl(url), done=!!ds(day.id).resources?.[r.id];
    return `<article class="resource-card" data-resource-id="${E(r.id)}" data-resource-index="${i}"><div class="section-heading"><span class="badge ${r.required?'accent':''}">${r.required?'Obligatorio':'Complementario'}</span><span class="muted">${E(r.type)} · Inglés prioritario</span></div><h3>${E(r.title)}</h3><p class="muted">${E(r.description||'Consulta el apartado relacionado con los subtemas de esta sesión.')}</p>${override?`<p class="notice">Recurso sustituido: ${E(override.reason)}. El enlace original se conserva en el temario.</p>`:''}<div class="button-row" data-resource-actions>${resourceActions(url,i)}</div><div class="video-slot" id="video-slot-${i}"></div><label class="check-row"><input type="checkbox" data-resource-check="${E(r.id)}" data-day="${day.id}" ${done?'checked':''} ${!unlocked(day)?'disabled':''}><span>He estudiado este recurso</span></label><details class="resource-replace"><summary>¿No funciona? Registrar un sustituto</summary><form class="replacement-form" data-day="${day.id}" data-rid="${E(r.id)}"><label>URL alternativa HTTPS<input type="url" name="url" required placeholder="https://…"></label><label>Por qué es equivalente<input name="reason" required minlength="8" maxlength="400"></label><button class="btn secondary" type="submit">Guardar sustitución</button></form></details></article>`;
  }).join('')}`;
}

function renderChallenge(day) {
  const bank=banks.get(day.id), st=ds(day.id);
  if(!bank) return '<div class="empty-state"><h3>La práctica evaluable de esta sesión está en desarrollo.</h3><p>Puedes estudiar sus recursos y hacer la tarea externa. El avance oficial se mantiene en la primera sesión pendiente.</p></div>';
  const c=bank.challenge;
  return `<article class="card"><span class="eyebrow">RETO DE COMPRENSIÓN APLICADA</span><h3>${E(c.prompt)}</h3><p class="muted">Evalúa el escenario; no inspecciona tu equipo. ${c.correct.length>1?'Selecciona todas las respuestas correctas.':'Selecciona una respuesta.'}</p><form id="challenge-form" data-day="${day.id}">${c.options.map(o=>`<label class="option"><input type="${c.correct.length>1?'checkbox':'radio'}" name="challenge" value="${E(o.id)}" ${!unlocked(day)?'disabled':''}><span>${E(o.text)}</span></label>`).join('')}<div class="button-row"><button class="btn primary" type="submit" ${!unlocked(day)?'disabled':''}>Comprobar solución</button>${st.challengePassed?'<span class="badge success">Ejercicio superado</span>':''}</div></form>${st.challengeFeedback?`<div class="notice ${st.challengePassed?'success':''}">${E(st.challengeFeedback)}</div>`:''}</article>`;
}
function renderPractice(day) {
  return `<article class="card task-box"><h3>Práctica</h3><p>${E(day.task)}</p><p class="muted">${E(day.evidence)}</p><div class="mini-checks"><p>① Trabaja en un equipo propio o un laboratorio autorizado.</p><p>② Guarda el resultado y explica cómo lo comprobaste.</p><p>③ Identifica una limitación o una conclusión alternativa.</p></div><a href="#day/${day.id}/notes" class="text-link">Añadir notas y evidencia →</a><small class="muted">Las evidencias externas son autodeclaradas. No se aprueban automáticamente por subir una captura.</small></article>${renderChallenge(day)}`;
}

function questionsOf(attempt, bank) {
  if(attempt?.questions) return attempt.questions;
  if(attempt?.questionIds) return attempt.questionIds.map(id=>bank.questions.find(q=>q.id===id)).filter(Boolean);
  return [];
}
function renderQuiz(day) {
  const bank=banks.get(day.id), st=ds(day.id), gate=completion(day);
  if(!bank) return '<div class="empty-state"><h3>Evaluación pendiente de desarrollo</h3><p>Puedes consultar los recursos de esta sesión mientras se completa su banco de preguntas.</p></div>';
  const draft=st.draft;
  const history=(st.attempts||[]).slice().reverse();
  const ready=unlocked(day)&&gate.resourcesReady&&gate.challengeReady;
  let content;
  if(draft) {
    const questions=questionsOf(draft,bank);
    content=`<form id="quiz-form" data-day="${day.id}"><div class="section-heading"><span class="badge accent">${questions.length} preguntas · 80% para superar</span><span class="muted">Borrador guardado</span></div>${questions.map((q,i)=>`<fieldset class="question"><legend><span class="eyebrow">PREGUNTA ${i+1}</span><br>${E(q.prompt)}</legend>${q.correct.length>1?'<p class="muted">Selecciona todas las correctas. Se puntúa el conjunto exacto.</p>':''}${q.options.map(o=>`<label class="option"><input type="${q.correct.length>1?'checkbox':'radio'}" name="${E(q.id)}" value="${E(o.id)}" ${(draft.answers?.[q.id]||[]).includes(o.id)?'checked':''}><span>${E(o.text)}</span></label>`).join('')}</fieldset>`).join('')}<button class="btn primary" type="submit" ${!ready?'disabled':''}>Entregar prueba</button><p class="muted">Las explicaciones aparecen después de entregar. Puedes reintentarlo sin perder el historial.</p></form>`;
  } else content=`<article class="card"><span class="eyebrow">${day.day===7?'REVISIÓN SEMANAL':'PRUEBA DE COMPRENSIÓN'}</span><h3>Evaluación</h3><p>Prueba interna con explicaciones; no reproduce un examen de certificación.</p><ul class="clean-list"><li>${gate.resourcesReady?'✓':'○'} Recursos obligatorios estudiados</li><li>${gate.challengeReady?'✓':'○'} Reto de interpretación superado</li><li>${unlocked(day)?'✓':'○'} Prerrequisito del recorrido completo</li></ul>${button('Comenzar prueba','quiz-start',`data-id="${day.id}" ${!ready?'disabled':''}`)}</article>`;
  if(gate.completed) content=`<div class="notice success"><strong>Sesión superada.</strong> ${days.indexOf(day)<363?`<a href="#day/${days[days.indexOf(day)+1].id}/learn">Continuar al siguiente día →</a>`:''}</div>`+content;
  return content+`<article class="card"><h3>Historial de intentos</h3>${history.length?history.map(a=>`<details class="attempt-result"><summary><span class="badge ${passed(a)?'success':''}">${Math.round(grade(a))}% · ${passed(a)?'Superada':'Seguir practicando'}</span> ${E(new Date(a.submittedAt||a.completedAt||a.createdAt).toLocaleString())}</summary>${questionsOf(a,bank).map(q=>`<div class="feedback-item"><strong>${E(q.prompt)}</strong><p>Tu respuesta: ${E((a.answers?.[q.id]||[]).map(id=>q.options.find(o=>o.id===id)?.text||id).join(' · ')||'Sin respuesta')}</p><p>Solución: ${E(q.options.filter(o=>q.correct.includes(o.id)).map(o=>o.text).join(' · '))}</p><p class="muted">${E(q.explanation)}</p>${safeUrl(q.reference)?`<a href="${E(q.reference)}" target="_blank" rel="noopener noreferrer">Referencia ↗</a>`:''}</div>`).join('')}</details>`).join(''):'<p class="muted">Todavía no hay intentos.</p>'}</article>`;
}

function renderNotesForDay(day) {
  const st=ds(day.id);
  return `<article class="card"><div class="section-heading"><h3>Tu cuaderno de laboratorio</h3><span id="save-status" class="muted">Guardado automático</span></div><div id="draft-warning" class="draft-warning" ${notes?.error(day.id)?'':'hidden'}>El borrador sigue disponible aquí. ${button('Reintentar guardado','notes-retry',`data-id="${day.id}"`,'secondary')}${button('Descargar borrador','notes-download-draft',`data-id="${day.id}"`,'ghost')}</div><label class="field">Notas y reflexión<textarea id="day-notes" data-day="${day.id}" rows="9" maxlength="100000" placeholder="Qué entendí, qué comprobé y qué me falta practicar…">${E(notes?.value(day.id)??st.notes??'')}</textarea></label><div class="button-row">${button(st.favorite?'★ En favoritos':'☆ Guardar en favoritos','favorite',`data-id="${day.id}"`,'ghost')}</div><p class="muted">Notas personales, sin calificación automática.</p></article>
  <article class="card"><h3>Dudas por resolver</h3><form id="doubt-form" data-day="${day.id}" class="inline-form"><label class="field">Nueva duda<input name="text" required maxlength="1000" placeholder="¿Qué quiero entender mejor?"></label><button class="btn secondary" type="submit">Añadir duda</button></form><ul class="doubts-list">${(st.doubts||[]).map(q=>`<li><label class="check-row"><input type="checkbox" data-doubt="${E(q.id)}" data-day="${day.id}" ${q.resolved?'checked':''}><span>${E(q.text)}</span><span class="badge">${q.resolved?'Resuelta':'Abierta'}</span></label></li>`).join('')}</ul></article>
  <article class="card"><h3>Evidencia de tu práctica</h3><p class="muted">Texto, enlaces y archivos de hasta 10 MiB cada uno. Se guardan en este navegador. Un archivo subido no equivale a una práctica verificada.</p><form id="evidence-link-form" data-day="${day.id}"><label class="field">Título<input name="title" required maxlength="200"></label><label class="field">Enlace HTTPS o explicación<textarea name="content" rows="3" required maxlength="10000"></textarea></label><button class="btn secondary" type="submit">Guardar evidencia</button></form><label class="upload-control">Adjuntar archivo<input type="file" id="evidence-file" data-day="${day.id}" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,application/json,.log,.txt,.csv,.json,.pdf"></label><ul class="attachment-list">${(st.evidence||[]).map(v=>`<li><div><strong>${E(v.name||v.title||'Evidencia')}</strong><p class="muted">${E(v.content||`${Math.round((v.size||0)/1024)} KiB · adjunto local`)}</p><span class="badge">Autodeclarada</span></div><div class="button-row">${v.dataUrl||v.dataURL?button('Descargar','evidence-download',`data-id="${E(v.id)}" data-day="${day.id}"`,'ghost'):safeUrl(v.content)?`<a class="btn ghost" href="${E(v.content)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>`:''}${button('Eliminar','evidence-delete',`data-id="${E(v.id)}" data-day="${day.id}"`,'ghost')}</div></li>`).join('')||'<li class="muted">Sin evidencias.</li>'}</ul></article>`;
}

function renderDay(id,tab) {
  const day=days.find(d=>d.id===id); if(!day) return '<div class="empty-state"><h2>Sesión no encontrada</h2><a href="#path">Volver a la ruta</a></div>';
  const tabs=[['learn','Aprender'],['resources','Recursos'],['practice','Practicar'],['quiz','Evaluar'],['notes','Notas y evidencia']];
  const c=completion(day), visual=weekVisual(day.week);
  const body=tab==='resources'?renderResources(day):tab==='practice'?renderPractice(day):tab==='quiz'?renderQuiz(day):tab==='notes'?renderNotesForDay(day):`<figure class="lesson-cover">${weekImage(day.week,'lesson-cover-image')}<figcaption><span class="eyebrow">${E(day.stage)}</span><p>${E(visual.title)}</p></figcaption></figure><article class="card"><h3>Hoy aprenderás</h3><ul class="topic-list">${day.topics.map((t,i)=>`<li><span class="topic-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span>${E(t)}</span></li>`).join('')}</ul><div class="notice"><strong>Resultado esperado</strong><p>${E(day.task)}</p></div><p>${E(day.evidence)}</p><div class="button-row">${button('Empezar con los recursos →','goto',`data-hash="day/${day.id}/resources"`)}</div></article><article class="card"><details class="study-method"><summary>Método de estudio</summary><div class="mini-checks"><p><strong>01 · Entiende.</strong> Mira el segmento relevante y lee su referencia.</p><p><strong>02 · Experimenta.</strong> Realiza la tarea con datos de práctica.</p><p><strong>03 · Comprueba.</strong> Resuelve el reto y la prueba sin consultar una solución.</p><p><strong>04 · Conserva.</strong> Guarda tu evidencia y las dudas que quieras resolver.</p></div><p class="muted">Las prácticas están limitadas a equipos propios o entornos autorizados.</p></details></article>`;
  return `<div class="section-heading lesson-heading"><div><a class="text-link" href="#path">← Ruta de aprendizaje</a><p class="eyebrow">SEMANA ${day.week} / DÍA ${day.day} · ${day.duration||100} MIN ORIENTATIVOS</p><h2>${E(day.title)}</h2></div><span id="session-status">${dayBadge(day)}</span></div>${!unlocked(day)?'<div class="notice">Estás explorando una sesión futura. Puedes leerla y guardar notas; el avance oficial requiere superar las sesiones anteriores.</div>':''}<div class="tabs" aria-label="Secciones del aula">${tabs.map(([k,l])=>`<a class="tab ${tab===k?'active':''}" ${tab===k?'aria-current="page"':''} href="#day/${day.id}/${k}">${l}</a>`).join('')}</div><div class="day-layout"><div class="study-panel">${body}</div><aside class="card study-aside"><h3>Requisitos</h3><div id="session-requirements">${requirementsMarkup(day)}</div>${timerPanel(day.id)}</aside></div>`;
}

function renderNotesList() {
  const matches=days.filter(d=>{const st=ds(d.id);return(st.notes||(st.doubts||[]).length||(st.evidence||[]).length)&&(!noteFilter||`${d.title} ${st.notes||''} ${(st.doubts||[]).map(q=>q.text).join(' ')}`.toLowerCase().includes(noteFilter.toLowerCase()));});
  return `<div class="notes-list">${matches.map(d=>{const st=ds(d.id);return `<article class="card"><div class="section-heading"><span class="eyebrow">SEMANA ${d.week} · DÍA ${d.day}</span>${st.favorite?'<span>★</span>':''}</div><h3><a href="#day/${d.id}/notes">${E(d.title)}</a></h3><p class="note-text">${E((st.notes||'Sin nota escrita').slice(0,350))}</p><div class="hero-pills"><span class="chip">${(st.doubts||[]).filter(q=>!q.resolved).length} dudas abiertas</span><span class="chip">${(st.evidence||[]).length} evidencias</span></div></article>`;}).join('')||'<div class="empty-state notes-empty"><h3>Tu cuaderno está listo.</h3><p>Abre una sesión para añadir notas, dudas o evidencias.</p><a href="#day/w01d1/notes" class="btn primary">Escribir mi primera nota</a></div>'}</div>`;
}

function renderNotes() {
  return `<div class="section-heading"><div><h2>Notas, dudas y evidencias</h2></div>${button('Exportar notas','notes-export','','secondary')}</div><label class="field">Buscar en tu bitácora<input id="notes-search" type="search" value="${E(noteFilter)}" placeholder="Un tema, una pregunta o un hallazgo…"></label><div id="notes-results">${renderNotesList()}</div>`;
}

function progressStatsMarkup() {
  const done=completedDays(),attempts=attemptHistory(),summary=summarizeLearning(days,snapshot(),id=>banks.has(id));
  return `${cardStat('Recorrido completado',count(pct(done.length,364),'<small>%</small>'),`${done.length} de 364 sesiones superadas`,'↗')}${cardStat('Tiempo registrado',count(Math.round(sessionMinutes()),'<small> min</small>'),'Sesiones de concentración guardadas','◷')}${cardStat('Promedio de pruebas',summary.averageScore===null?'—':count(Math.round(summary.averageScore),'<small>%</small>'),`${attempts.length} intentos registrados`,'◎')}${cardStat('Experiencia acumulada',count(done.length*100,'<small> XP</small>'),'100 XP por sesión superada','✦')}`;
}
function refreshStudyMetrics() {
  const home=$('#home-stats');if(home)home.innerHTML=homeStatsMarkup();
  const progress=$('#progress-stats');if(progress)progress.innerHTML=progressStatsMarkup();
  const charts=$('#analytics-charts');if(charts)charts.innerHTML=renderAnalytics(snapshot(),days,chartOptions(false));
}

function renderProgress() {
  const done=completedDays(), attempts=attemptHistory(), summary=summarizeLearning(days,snapshot(),id=>banks.has(id));
  const achievements=[['Primer paso',done.length>=1,'Tu primera sesión superada.'],['Una semana de bases',done.length>=7,'Siete sesiones completadas.'],['Laboratorio en marcha',days.some(d=>(ds(d.id).evidence||[]).length),'Conserva evidencia de tu práctica.'],['Tu voz importa',days.some(d=>ds(d.id).notes),'Tu primera nota de aprendizaje.']];
  return `<div class="workspace-greeting"><div><h2>Resumen de actividad</h2></div><span class="badge accent">En este dispositivo</span></div><div class="stats-grid" id="progress-stats">${progressStatsMarkup()}</div>
  <div id="analytics-charts">${renderAnalytics(snapshot(),days,chartOptions(false))}</div>
  ${stageMap()}
  <div class="dashboard-grid"><article class="card"><div class="chart-heading"><div><h3>Logros</h3></div><span class="icon-frame">✦</span></div><div class="achievement-grid">${achievements.map(([t,yes,desc])=>`<div class="achievement ${yes?'achieved':''}"><span class="achievement-icon">${yes?'✦':'◇'}</span><div><strong>${t}</strong><p class="muted">${desc}</p></div><span class="badge">${yes?'Logrado':'Por descubrir'}</span></div>`).join('')}</div></article>
  <article class="card"><div class="chart-heading"><div><h3>Últimos intentos</h3></div><span class="badge">${attempts.length} en total</span></div>${attempts.slice(-6).reverse().map(a=>`<a class="result-row" href="#day/${a.day.id}/quiz"><span>${E(a.day.title)}</span><span class="badge ${passed(a)?'success':''}">${Math.round(grade(a))}%</span></a>`).join('')||'<div class="compact-empty"><span class="icon-frame">◎</span><p>Envía una prueba para ver tus resultados.</p></div>'}</article></div>
  <article class="card certificate-card"><div><h3>Camino de certificaciones</h3><p class="muted">Bases: A+ y Network+. CC es opcional; Security+ y BTL1 son los objetivos del programa. Verifica las versiones oficiales.</p><small class="muted">Las pruebas internas no predicen el resultado de una certificación.</small></div><form id="cert-form"><label class="field">Versión objetivo de Security+<input name="version" value="${E(snapshot().certification?.version||'')}" placeholder="Versión confirmada en la fuente oficial" maxlength="80"></label><label class="field">Notas de preparación<textarea name="notes" rows="3" maxlength="4000">${E(snapshot().certification?.notes||'')}</textarea></label><button class="btn secondary" type="submit">Guardar objetivo</button></form></article>`;
}

function renderSettings() {
  const state=snapshot();
  return `<div class="section-heading"><div><h2>Preferencias y respaldos</h2></div><a class="btn secondary" href="./GUIA_GITHUB.html" target="_blank">Guía de GitHub ↗</a></div><div class="dashboard-grid"><article class="card"><h3>Perfil y estudio</h3><form id="settings-form"><label class="field">Nombre<input name="name" value="${E(state.profile?.name||'')}" maxlength="60"></label><label class="field">Meta de minutos por semana<input type="number" name="weeklyMinutes" min="30" max="6000" step="30" required value="${Number(state.profile?.weeklyMinutes)||720}"></label><button class="btn primary" type="submit">Guardar preferencias</button></form></article>
  <article class="card"><h3>Respaldos</h3><p>Los datos se guardan en este navegador y no se sincronizan. Exporta un respaldo antes de borrar datos o cambiar de dispositivo.</p><p class="muted">Último respaldo: ${state.lastBackupAt?E(new Date(state.lastBackupAt).toLocaleString()):'Todavía no has exportado uno'}.</p><div class="button-row">${button('Exportar respaldo completo','backup','','primary')}${button('Exportar sin adjuntos','backup-light','','secondary')}</div><label class="upload-control">Importar respaldo JSON<input type="file" id="backup-import" accept="application/json,.json"></label><p id="storage-info" class="muted">Los adjuntos tienen un límite de 10 MiB por archivo y 100 MiB en total, sujeto a la cuota del navegador.</p><div id="import-preview"></div></article>
  <article class="card"><h3>Cobertura del contenido</h3><p>${curriculum.weeks.length} semanas y ${days.length} sesiones con recursos de estudio. ${banks.size} sesiones tienen prueba y reto disponibles. El avance requiere completar los recursos y superar ambas actividades.</p><p class="muted">Algunos videos enlazan cursos o listas generales. El estudio de los recursos se marca manualmente.</p><a class="text-link" href="./CONTENT_STATUS.md" target="_blank">Consultar estado del contenido →</a></article>
  <article class="card danger-zone"><h3>Reiniciar datos de este navegador</h3><p>Elimina notas, intentos, adjuntos y progreso local. Exporta antes un respaldo completo.</p>${button('Reiniciar mi recorrido','reset','','danger')}</article></div>`;
}

function render({animate=true}={}) {
  if(!days) return;
  const route=readRoute();
  $('#page-title').textContent=labels[route.page]||labels.home;
  const subtitle=$('#header-subtitle');if(subtitle) subtitle.textContent='Ciberseguridad';
  document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.getAttribute('href')===`#${route.page==='day'?'path':route.page}`;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#main-content').innerHTML=route.page==='path'?renderPath():route.page==='day'?renderDay(route.id,route.tab):route.page==='notes'?renderNotes():route.page==='progress'?renderProgress():route.page==='settings'?renderSettings():renderHome();
  if(animate){$('#main-content').classList.add('page-enter');motion?.refresh?.($('#main-content'));}else $('#main-content').classList.remove('page-enter');
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
  const active=days?.find(day=>day.id===snapshot().timer?.dayId);document.querySelectorAll('[data-timer-session]').forEach(el=>el.textContent=active?`Tiempo ${snapshot().timer.running?'activo':'pendiente'}: ${active.week}.${active.day} · ${active.title}`:'Elige una sesión e inicia el temporizador.');
}


async function handleAction(e) {
  const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
  const action=btn.dataset.action,id=btn.dataset.id;
  if(action==='onboard') return;
  e.preventDefault();
  try {
    if(action==='chart-range'){chartRange=Number(btn.dataset.range)===30?30:7;const charts=$('#analytics-charts');if(charts)charts.innerHTML=renderAnalytics(snapshot(),days,chartOptions(false));}
    if(action==='goto') {await flushNotes();navigate(btn.dataset.hash);}
    if(action==='search'){navigate('path');setTimeout(()=>$('#path-search')?.focus(),30);}
    if(action==='page'){pageNumber=Number(btn.dataset.n);updateResults('path');$('#path-results')?.scrollIntoView({block:'start'});}
    if(action==='notes-retry'){await flushNotes();toast('Borradores guardados.');}
    if(action==='retry-route'){const route=readRoute();if(route.page==='day'&&['practice','quiz'].includes(route.tab)){const main=$('#main-content');main.setAttribute('aria-busy','true');try{await loadBank(route.id);render();await commit(s=>{ensureDay(s,route.id).lastTab=route.tab;},false);}finally{main.removeAttribute('aria-busy');}}}
    if(action==='notes-download-draft'){const text=notes.value(id);download(text,`cybertrack-borrador-${id}.txt`,'text/plain');toast('Borrador descargado. El guardado en el navegador sigue pendiente.');}
    if(action==='favorite')await commit(s=>{const d=ensureDay(s,id);d.favorite=!d.favorite;});
    if(action==='embed') {const url=embedUrl(btn.dataset.url);if(!url)return;const slot=$(`#video-slot-${btn.dataset.resource}`);slot.innerHTML=`<iframe title="Reproductor del recurso de estudio" src="${E(url)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><p class="muted">Si el proveedor bloquea la reproducción, utiliza Abrir fuente. Reproducir no marca el recurso como estudiado.</p>`;}
    if(action==='quiz-start') {
      const day=days.find(d=>d.id===id),c=completion(day);if(!unlocked(day)||!c.resourcesReady||!c.challengeReady)throw new Error('Completa primero los recursos y el reto de esta sesión.');
      const a=createAttempt(banks.get(id),{count:day.day===7?15:6});await commit(s=>{ensureDay(s,id).draft={...a,answers:{}};});
    }
    if(action==='timer-toggle'){if(snapshot().timer?.running)await pauseTimer();else await startTimer(id||currentDay().id);updateTimer();}
    if(action==='timer-log'){await pauseTimer();if(getTimerMs(snapshot())<1000){toast('Registra al menos un segundo de estudio.');return;}await logTimer();toast('Tiempo de estudio registrado.');updateTimer();refreshStudyMetrics();}
    if(action==='notes-export'){await flushNotes();const text=days.filter(d=>ds(d.id).notes||(ds(d.id).doubts||[]).length||(ds(d.id).evidence||[]).length).map(d=>`SEMANA ${d.week} / DÍA ${d.day} · ${d.title}\n\n${ds(d.id).notes}\n\nDudas:\n${(ds(d.id).doubts||[]).map(q=>`[${q.resolved?'x':' '}] ${q.text}`).join('\n')}`).join('\n\n────────────\n\n');download(text,'cybertrack-notas.txt','text/plain');}
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
  const form=e.target;if(!['onboarding','settings-form','challenge-form','quiz-form','doubt-form','evidence-link-form','cert-form','manual-time-form'].includes(form.id)&&!form.classList?.contains?.('replacement-form'))return;
  e.preventDefault();const data=new FormData(form),id=form.dataset.day;
  try {
    if(form.id==='manual-time-form'){const dayId=String(data.get('dayId'));if(!days.some(day=>day.id===dayId))throw new Error('Elige una sesión del programa.');await logManualStudy(dayId,Number(data.get('minutes')),String(data.get('note')||''));form.reset?.();updateTimer();refreshStudyMetrics();toast('Estudio externo registrado.');}
    if(form.id==='onboarding')await commit(s=>{s.profile.name=String(data.get('name')||'').trim();s.profile.onboarded=true;});
    if(form.id==='settings-form'){const saved=await commit(s=>{s.profile.name=String(data.get('name')||'').trim();s.profile.weeklyMinutes=Math.max(30,Math.min(6000,Number(data.get('weeklyMinutes'))||720));s.preferences.theme='light';s.preferences.motion=true;});if(saved)toast('Preferencias guardadas.');}
    if(form.id==='cert-form'){const saved=await commit(s=>{s.certification={version:String(data.get('version')||''),notes:String(data.get('notes')||''),reviewedAt:new Date().toISOString()};});if(saved)toast('Objetivo guardado.');}
    if(form.classList?.contains?.('replacement-form')){const url=safeUrl(data.get('url'));if(!url)throw new Error('Usa una URL HTTPS válida.');const saved=await commit(s=>{const d=ensureDay(s,id);d.resourceOverrides||={};d.resourceOverrides[form.dataset.rid]={url,reason:String(data.get('reason')),changedAt:new Date().toISOString()};},false);if(saved){const card=form.closest('.resource-card'),actions=card?.querySelector('[data-resource-actions]'),frame=card?.querySelector('iframe');if(actions)actions.innerHTML=resourceActions(url,card.dataset.resourceIndex);if(frame){const next=embedUrl(url);if(next&&frame.src!==next)frame.src=next;else if(!next)frame.remove();}toast('Recurso alternativo registrado.');}}
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
  if(el.id==='path-search'||el.id==='notes-search') {
    if(el.id==='path-search'){pathFilter=el.value;pageNumber=1;}else noteFilter=el.value;
    clearTimeout(searchTimer);const kind=el.id==='path-search'?'path':'notes';searchTimer=setTimeout(()=>{if(readRoute().page===kind)updateResults(kind);},150);
  }
  if(el.id==='day-notes')notes.set(el.dataset.day,el.value);
}

async function handleChange(e) {
  const el=e.target;
  try {
    if(el.id==='stage-filter'){stageFilter=el.value;pageNumber=1;updateResults('path');}
    if(el.dataset.resourceCheck){const day=days.find(d=>d.id===el.dataset.day);if(!unlocked(day)){el.checked=!!ds(day.id).resources?.[el.dataset.resourceCheck];return;}const saved=await commit(s=>{ensureDay(s,day.id).resources[el.dataset.resourceCheck]=el.checked;},false);if(!saved)el.checked=!!ds(day.id).resources?.[el.dataset.resourceCheck];updateSessionStatus(day);}
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
    const data=await loadCurriculum();curriculum=data.curriculum;days=curriculum.weeks.flatMap(w=>w.days.map(d=>({...d,stage:w.stage})));banks=data.banks;loadBank=data.loadBank||loadBank;

    await loadState();notes=createNoteDrafts({read:id=>ds(id).notes||'',write:async(id,text)=>{await mutateState(s=>{ensureDay(s,id).notes=text;});applyPreferences();},onStatus:noteStatus});motion=initMotion({enabled:true});applyPreferences();
    document.addEventListener('click',e=>{if(e.target.closest('.skip-link')){e.preventDefault();$('#main-content').focus();return;}return handleAction(e);});document.addEventListener('submit',handleSubmit);document.addEventListener('input',handleInput);document.addEventListener('change',handleChange);
    subscribe(()=>{applyPreferences();updateTimer();});
    initTimer(updateTimer);await initRouter(async({isCurrent=()=>true}={})=>{clearTimeout(searchTimer);const route=readRoute();if(route.page==='day'&&['practice','quiz'].includes(route.tab)&&days.some(d=>d.id===route.id)){const main=$('#main-content');main.setAttribute('aria-busy','true');try{await loadBank(route.id);}finally{main.removeAttribute('aria-busy');}}if(!isCurrent())return;render();if(route.page==='day'&&days.some(d=>d.id===route.id))await commit(s=>{ensureDay(s,route.id).lastTab=route.tab;},false);window.scrollTo({top:0,behavior:'instant'});},{beforeChange:flushNotes,onError:error=>{const main=$('#main-content'),route=readRoute();if(main?.innerHTML.includes('loading-screen')&&route.page==='day'&&['practice','quiz'].includes(route.tab)){main.innerHTML=`<section class="empty-state"><h2>No pudimos cargar esta evaluación</h2><p>${E(error.message)}</p><div class="button-row">${button('Reintentar evaluación','retry-route')}<a class="btn secondary" href="#day/${E(route.id)}/resources">Abrir recursos</a></div></section>`;$('#page-title').textContent='Aula';}toast(`No se pudo cambiar de pantalla: ${error.message}. Tus datos y borradores se conservan.`,true)}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushNotes().catch(error=>toast(error.message,true));});
    window.addEventListener('pagehide',()=>flushNotes().catch(()=>{}));
    window.addEventListener('beforeunload',event=>{if(notes.pending()){event.preventDefault();event.returnValue='';}});
  } catch(err) {
    $('#main-content').innerHTML=`<section class="empty-state"><h2>No pudimos abrir tu laboratorio.</h2><p>${E(err.message)}</p><p>Comprueba que subiste index.html y las carpetas assets y data en la misma raíz. En tu computadora usa un servidor local; abrir el HTML con doble clic no carga los JSON.</p><a class="btn primary" href="./GUIA_GITHUB.html">Ver guía de instalación</a><p>No se han reiniciado tus datos.</p></section>`;
  }
}
boot();
