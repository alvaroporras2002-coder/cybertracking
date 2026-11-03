import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

// A Node-only integration smoke check. This does not render CSS or replace
// actual browser accessibility/layout and IndexedDB testing.
test('actual application renders routes and saved quiz snapshots against the shipped curriculum', async () => {
  const script = String.raw`
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
const root = process.cwd();
const originalStorage = await import(pathToFileURL(path.join(root, 'assets/js/storage.js')));
const originalAssessment = await import(pathToFileURL(path.join(root, 'assets/js/assessments.js')));
const originalResources = await import(pathToFileURL(path.join(root, 'assets/js/resources.js')));
let state = originalStorage.createDefaultState();
state.preferences.theme = 'dark';
state.preferences.motion = false;
state.profile.name = 'Legacy learner';
let failSaves = false;
let failBankLoads = false;
const events = new Map();
const motionCalls = [];
let elements;
const decode=value=>String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
class Element {
  constructor(id) { this.id=id; this.dataset={}; this._innerHTML=''; this.writes=0; this.textContent=''; this.value=''; this.hidden=true; this.className=''; this.classList={toggle(){},remove(){},add(){},contains(){return false;}}; }
  get innerHTML(){return this._innerHTML;}
  set innerHTML(value){
    this._innerHTML=String(value);this.writes++;
    if(this.id==='main-content'&&elements){
      for(const id of [...elements.keys()])if(['day-notes','path-results','notes-results','home-stats','progress-stats','analytics-charts'].includes(id)||id.startsWith('video-slot-'))elements.delete(id);
      const note=this._innerHTML.match(/<textarea id="day-notes" data-day="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/);
      if(note){const field=new Element('day-notes');field.dataset.day=note[1];field.value=decode(note[2]);elements.set(field.id,field);}
      for(const kind of ['path','notes']){const marker='<div id="'+kind+'-results">',at=this._innerHTML.indexOf(marker);if(at>=0){const region=new Element(kind+'-results');region.innerHTML=this._innerHTML.slice(at+marker.length,-6);elements.set(region.id,region);}}
      for(const match of this._innerHTML.matchAll(/id="(video-slot-\d+)"/g))elements.set(match[1],new Element(match[1]));
      for(const id of ['home-stats','progress-stats','analytics-charts'])if(this._innerHTML.includes('id="'+id+'"'))elements.set(id,new Element(id));
    }
    if(this.id.startsWith('video-slot-'))this.frame=this._innerHTML.includes('<iframe')?new Element('iframe'):null;
  }
  addEventListener(type, fn) { events.set(this.id+':'+type, fn); }
  setAttribute() {} removeAttribute() {} focus() {} setSelectionRange() {} scrollIntoView() {} closest(){return null;}
  querySelector(selector){return selector==='iframe'?this.frame||null:null;}
}
elements = new Map(['main-content','page-title','header-subtitle','toast','theme-toggle','motion-toggle','profile-name','storage-info'].map(id=>[id,new Element(id)]));
const doc = {
  hidden:false, documentElement:{dataset:{}},
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { events.set('document:'+type, fn); },
};
const browserWindow = {history:{replaceState(_state,_title,hash){context.location.hash=hash;}},addEventListener(type,fn){events.set('window:'+type,fn);},scrollTo(){}};
class MockFormData extends Map { constructor(form){super(Object.entries(form.values||{}));} }
const context=vm.createContext({console,URL,Blob,FormData:MockFormData,crypto:webcrypto,structuredClone,Date,Map,Set,Math,JSON,Promise,
  document:doc,window:browserWindow,location:{hash:'#home'},navigator:{},
  setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref?.();return t;},clearTimeout,
  scrollTo(){},scrollY:0,confirm(){return false;},prompt(){return null;},
  fetch:async url=>{try{const source=await fs.readFile(fileURLToPath(url),'utf8');return {ok:true,status:200,json:async()=>JSON.parse(source)};}catch{return {ok:false,status:404};}},
});
const storageApi={...originalStorage,
  async loadState(){return state;},getState(){return state;},subscribe(){return ()=>{};},
  async mutateState(fn){if(failSaves)throw new Error('Synthetic storage failure');const next=structuredClone(state);fn(next);state=originalStorage.validateState(next);return state;},
  async replaceState(next){state=originalStorage.validateState(next);return state;},
  async getStorageInfo(){return {usage:0,quota:1000000,evidenceBytes:0};},
};
const mocked = new Map([
  ['storage.js',storageApi],
  ['resources.js',{...originalResources,async loadCurriculum(){const curriculum=JSON.parse(await fs.readFile(path.join(root,'data/curriculum.json'),'utf8'));const banks=new Map();for(const name of await fs.readdir(path.join(root,'data/assessments'))){if(!/^week-\d{2}\.json$/.test(name))continue;const week=JSON.parse(await fs.readFile(path.join(root,'data/assessments',name),'utf8'));for(const day of week.days)banks.set(day.dayId,day);}return {curriculum,banks,async loadBank(id){if(failBankLoads)throw new Error('Synthetic assessment download failure');return banks.get(id);}};}}],
  ['timer.js',{getTimerMs:()=>0,startTimer:async()=>{},pauseTimer:async()=>{},logTimer:async()=>{},logManualStudy:async(dayId,minutes,note)=>{state.studySessions.push({id:'manual-ui-'+state.studySessions.length,dayId,durationMs:minutes*60000,endedAt:new Date().toISOString(),source:'manual',note});},initTimer:()=>()=>{}}],
  ['motion.js',{initMotion:options=>{motionCalls.push(options.enabled);return {update(value){motionCalls.push(value);},destroy(){}};}}],
]);
const cache=new Map();
async function moduleFor(filename){
  filename=path.resolve(String(filename).split(/[?#]/,1)[0]); if(cache.has(filename))return cache.get(filename);
  const name=path.basename(filename); let module;
  if(mocked.has(name)){
    const api=mocked.get(name);module=new vm.SyntheticModule(Object.keys(api),function(){for(const [k,v]of Object.entries(api))this.setExport(k,v);},{context,identifier:filename});
  }else{
    module=new vm.SourceTextModule(await fs.readFile(filename,'utf8'),{context,identifier:filename,initializeImportMeta(meta){meta.url=pathToFileURL(filename).href;}});
  }
  cache.set(filename,module);await module.link((specifier,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),specifier.split(/[?#]/,1)[0])));return module;
}
await (await moduleFor(path.join(root,'assets/js/app.js'))).evaluate();
for(let i=0;i<100&&(!events.has('window:hashchange')||!elements.get('main-content').innerHTML.includes('Continuar estudiando'));i++)await new Promise(resolve=>setTimeout(resolve,5));
assert.ok(events.has('window:hashchange'),'app boot must initialize router');
assert.ok(!elements.get('main-content').innerHTML.includes('No pudimos abrir'),'app boot must not show failure fallback');
assert.equal(doc.documentElement.dataset.theme,'light','legacy dark preference must render the single light theme');
assert.ok(motionCalls.length>0&&motionCalls.every(value=>value===true),'motion must start enabled despite a legacy disabled preference');
assert.equal(state.profile.name,'Legacy learner','appearance changes must preserve the saved profile');
assert.ok(!events.has('theme-toggle:click')&&!events.has('motion-toggle:click'),'removed appearance controls must not bind handlers');
let routes=0;
async function route(hash, expected){
  context.location.hash=hash;await events.get('window:hashchange')();
  const markup=elements.get('main-content').innerHTML;
  assert.ok(markup.includes(expected),hash+' should include '+expected);routes++;return markup;
}
await route('#home','Continuar estudiando');
await route('#path','SEMANA 01');
await route('#day/w01d1/learn','Resultado esperado');
await route('#day/w01d1/resources','He estudiado este recurso');
await route('#day/w01d1/practice','Comprobar solución');
await route('#day/w01d1/quiz','Comenzar prueba');
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
await route('#notes','Tu cuaderno está listo');
await route('#progress','Camino de certificaciones');
const settingsMarkup=await route('#settings','id="backup-import"');
assert.ok(!settingsMarkup.includes('name="theme"')&&!settingsMarkup.includes('name="motion"'),'settings must not expose removed appearance controls');
await events.get('document:submit')({target:{id:'settings-form',dataset:{},values:{name:'Saved learner',weeklyMinutes:'900'}},preventDefault(){}});
assert.equal(state.profile.weeklyMinutes,900,'profile settings must save without removed appearance fields');
assert.equal(state.preferences.theme,'light');
assert.equal(state.preferences.motion,true);
await route('#day/w52d7/learn','Estás explorando una sesión futura');
const finalQuiz=await route('#day/w52d7/quiz','Evaluación');
assert.ok(finalQuiz.includes('Comenzar prueba')||finalQuiz.includes('Evaluación pendiente de desarrollo'));
await route('#day/unknown/learn','Sesión no encontrada');
await route('#path','SEMANA 01');
const covers=new Set();
for(let page=1;page<=7;page++){
  if(page>1){const target={disabled:false,dataset:{action:'page',n:String(page)}};await events.get('document:click')({target:{closest(selector){return selector==='.skip-link'?null:target;}},preventDefault(){}});}
  const markup=elements.get('path-results')?.innerHTML||elements.get('main-content').innerHTML;
  for(const match of markup.matchAll(/class="stage-cover" src="([^"]+)"/g))covers.add(match[1]);
}
assert.equal(covers.size,52,'all 52 weekly cards must use distinct image paths');
assert.ok(covers.has('./assets/images/weeks/week-01.webp')&&covers.has('./assets/images/weeks/week-52.webp'));
assert.ok((await route('#day/w52d7/learn','Resultado esperado')).includes('./assets/images/weeks/week-52.webp'),'lesson art must match its week');
// A direct assessment startup must replace an indefinite loader with an actionable failure and support retry.
await route('#day/w01d1/quiz','Comenzar prueba');
elements.get('main-content').innerHTML='<div class="loading-screen">Cargando…</div>';
failBankLoads=true;
await route('#day/w01d1/quiz','No pudimos cargar esta evaluación');
assert.ok(elements.get('main-content').innerHTML.includes('data-action="retry-route"'));
assert.ok(elements.get('main-content').innerHTML.includes('#day/w01d1/resources'));
const retryDownload={disabled:false,dataset:{action:'retry-route'}};
const retryClick=()=>events.get('document:click')({target:{closest(selector){return selector==='.skip-link'?null:retryDownload;}},preventDefault(){}});
await retryClick();
assert.ok(elements.get('main-content').innerHTML.includes('Reintentar evaluación'),'a repeated download failure must retain its recovery controls');
failBankLoads=false;await retryClick();
assert.ok(elements.get('main-content').innerHTML.includes('Comenzar prueba'),'successful retry must render the assessment');
// A native hash transition must save the previous day's draft before another input can replace it.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
let draftField=elements.get('day-notes');draftField.value='First note before rapid navigation';
events.get('document:input')({target:draftField});
await route('#day/w01d2/notes','Tu cuaderno de laboratorio');
draftField=elements.get('day-notes');draftField.value='Second note typed immediately';
events.get('document:input')({target:draftField});
await route('#home','Continuar estudiando');
assert.equal(state.days.w01d1.notes,'First note before rapid navigation');
assert.equal(state.days.w01d2.notes,'Second note typed immediately');
// A storage update from another tab must not turn an untouched stale editor into a local draft.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
const untouchedEditor=elements.get('day-notes'),displayedBeforeRemote=untouchedEditor.value;
state=structuredClone(state);originalStorage.ensureDay(state,'w01d1').notes='Remote note saved by another tab';
state=originalStorage.validateState(state);
assert.equal(untouchedEditor.value,displayedBeforeRemote,'the fixture editor remains unchanged and receives no input event');
await route('#home','Continuar estudiando');
assert.equal(state.days.w01d1.notes,'Remote note saved by another tab','navigation must preserve a newer stored note when this editor was not edited');
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
assert.equal(elements.get('day-notes').value,'Remote note saved by another tab','a new visit should display the current stored note');
// A failed flush keeps the current field, its text and route available for retry.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
draftField=elements.get('day-notes');draftField.value='Recover this unsaved note';events.get('document:input')({target:draftField});
failSaves=true;context.location.hash='#home';await events.get('window:hashchange')();
assert.equal(context.location.hash,'#day/w01d1/notes');
assert.equal(elements.get('day-notes'),draftField);assert.equal(draftField.value,'Recover this unsaved note');
failSaves=false;await route('#home','Continuar estudiando');assert.equal(state.days.w01d1.notes,'Recover this unsaved note');
// Resource checks and timer controls must not replace the resource view or its player.
await route('#day/w01d1/resources','He estudiado este recurso');
const clickAction=async(action,extra={})=>{const target={disabled:false,dataset:{action,...extra}};await events.get('document:click')({target:{closest(selector){return selector==='.skip-link'?null:target;}},preventDefault(){}});};
await clickAction('embed',{url:'https://www.youtube.com/watch?v=abcdefghijk',resource:'0'});
const slot=elements.get('video-slot-0'),frame=slot.frame,screenWrites=elements.get('main-content').writes;
assert.ok(frame,'fixture player must be mounted');
await clickAction('timer-toggle',{id:'w01d1'});
const firstDayData=JSON.parse(await fs.readFile(path.join(root,'data/curriculum.json'),'utf8')).weeks[0].days[0];
const resourceCheck={dataset:{day:'w01d1',resourceCheck:firstDayData.resources[0].id},checked:true,closest(){return null;}};
await events.get('document:change')({target:resourceCheck});
assert.equal(elements.get('main-content').writes,screenWrites,'routine study controls must not rebuild the view');
assert.equal(elements.get('video-slot-0'),slot);assert.equal(slot.frame,frame,'existing player identity must survive');
const submitManual=async minutes=>events.get('document:submit')({target:{id:'manual-time-form',dataset:{},values:{dayId:'w01d1',minutes:String(minutes),note:'External reading'}},preventDefault(){}});
await submitManual(25);assert.equal(elements.get('video-slot-0'),slot);assert.equal(slot.frame,frame,'manual time logging must preserve the player');
await route('#home','Continuar estudiando');const homeWrites=elements.get('main-content').writes;await submitManual(10);
assert.equal(elements.get('main-content').writes,homeWrites,'logging time must update metrics without rebuilding home');
assert.match(elements.get('home-stats').innerHTML,/>35<\/span><small> min<\/small>/,'the visible weekly time must update immediately');
await route('#progress','Resumen de actividad');const progressWrites=elements.get('main-content').writes;await clickAction('chart-range',{range:'30'});
assert.equal(elements.get('main-content').writes,progressWrites,'chart filters must preserve the certification form and screen');
assert.ok(elements.get('analytics-charts').innerHTML.includes('data-range="30" aria-pressed="true"'),'the chart range updates inside its own region');
// Typing a filter updates only its results region and does not replay full page entrances.
await route('#path','Programa de estudio');
const pathWrites=elements.get('main-content').writes,results=elements.get('path-results');
events.get('document:input')({target:{id:'path-search',value:'Linux'}});
await new Promise(resolve=>setTimeout(resolve,180));
assert.equal(elements.get('main-content').writes,pathWrites);assert.equal(elements.get('path-results'),results);assert.ok(results.innerHTML.includes('Linux'));
events.get('document:input')({target:{id:'path-search',value:''}});await new Promise(resolve=>setTimeout(resolve,180));
const curriculum=JSON.parse(await fs.readFile(path.join(root,'data/curriculum.json'),'utf8'));
const first=curriculum.weeks[0].days[0];
const bank=JSON.parse(await fs.readFile(path.join(root,'data/assessments/week-01.json'),'utf8')).days[0];
let saved=originalStorage.ensureDay(state,first.id);
saved.resources=Object.fromEntries(first.resources.map(r=>[r.id,true]));saved.challengePassed=true;
saved.notes='<script>do-not-render</script>';
saved.doubts.push({id:'doubt1',text:'What is RAM?',resolved:false});
saved.draft=originalAssessment.createAttempt(bank,{count:6});
saved.draft.answers={[saved.draft.questions[0].id]:saved.draft.questions[0].correct};
state=originalStorage.validateState(state);
saved=state.days[first.id];
await route('#day/w01d1/quiz','Entregar prueba');
assert.equal((elements.get('main-content').innerHTML.match(/class="question"/g)||[]).length,6,'six quiz questions must render');
saved=state.days[first.id];
const answers=Object.fromEntries(saved.draft.questions.map(q=>[q.id,q.correct]));
const result=originalAssessment.scoreAttempt(saved.draft,answers);
assert.equal(result.passed,true,'correct answers should pass snapshot');
saved.attempts.push({...saved.draft,answers,result,score:result.score,passed:result.passed,submittedAt:result.submittedAt});saved.draft=null;
state=originalStorage.validateState(state);
assert.equal(state.days[first.id].attempts.length,1,'completed attempt must be in current state');
assert.equal(state.days[first.id].challengePassed,true);
await route('#day/w01d1/quiz','Sesión superada');
await route('#home','w01d2');
const notesMarkup=await route('#day/w01d1/notes','&lt;script&gt;do-not-render&lt;/script&gt;');
assert.ok(!notesMarkup.includes('<script>do-not-render</script>'),'notes must remain escaped');
await route('#notes','1 dudas abiertas');
await route('#progress','100');
// Exercise an actual delegated handler: failed persistence must show its error
// and must not be followed by the previous unconditional success toast.
const clicks=events.get('document:click');failSaves=true;
const target={disabled:false,dataset:{action:'favorite',id:first.id}};
await clicks({target:{closest(selector){return selector==='.skip-link'?null:target;}},preventDefault(){}});
await new Promise(resolve=>setTimeout(resolve,5));
assert.ok(elements.get('toast').textContent.includes('Synthetic storage failure'));
assert.equal(elements.get('toast').hidden,false,'error toast must be visible');
console.log(JSON.stringify({routes,quizQuestions:6,passedSnapshot:true,escapedNotes:true,visibleStorageError:true}));
`;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--experimental-vm-modules','--input-type=module','-e',script], {cwd:root,timeout:20000,maxBuffer:1000000});
    assert.ok(stdout.includes('"passedSnapshot":true'), stdout + stderr);
  } catch (error) {
    assert.fail(error.stderr || error.message);
  }
});
