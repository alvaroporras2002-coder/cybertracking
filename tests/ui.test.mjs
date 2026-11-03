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
const entranceCalls=[];
let focused=null,formNodes=[],focusCount=0;
let delayMutation=null;
const attr=(source,name)=>decode(source.match(new RegExp('(?:^|\\s)'+name+'="([^"]*)"'))?.[1]||'');
function setAttrs(el,source){el.name=attr(source,'name');el.className=attr(source,'class');el.type=attr(source,'type');for(const m of source.matchAll(/data-([a-z-]+)="([^"]*)"/g)){const key=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());el.dataset[key]=decode(m[2]);}}
let elements;
const decode=value=>String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
class Element {
  constructor(id) { this.id=id; this.dataset={}; this._innerHTML=''; this.writes=0; this.textContent=''; this.value=''; this.hidden=true; this.className=''; this.classList={toggle(){},remove(){},add(){},contains:name=>this.className.split(/\s+/).includes(name)}; }
  get disabled(){return this._disabled||false;}
  set disabled(value){this._disabled=value;if(value&&focused===this)focused=body;}
  get innerHTML(){return this._innerHTML;}
  set innerHTML(value){
    this._innerHTML=String(value);this.writes++;this.actions=[];for(const match of this._innerHTML.matchAll(/<button\b([^>]*)>/g)){if(!/data-action=/.test(match[1]))continue;const button=new Element(attr(match[1],'id'));setAttrs(button,match[1]);this.actions.push(button);}
    if(this.id==='main-content'&&elements){
      formNodes=[];for(const id of [...elements.keys()])if(['day-notes','path-results','notes-results','home-stats','progress-stats','analytics-charts'].includes(id)||id.startsWith('video-slot-'))elements.delete(id);
      for(const match of this._innerHTML.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)){
        const form=new Element(attr(match[1],'id'));setAttrs(form,match[1]);form.fields=[];form.values={};form.reset=()=>{for(const field of form.fields)field.value=field.defaultValue;};
        for(const m of match[2].matchAll(/<(input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1>|>)/g)){
          const field=new Element(attr(m[2],'id'));setAttrs(field,m[2]);field.form=form;field.disabled=false;
          if(m[1]==='textarea')field.value=decode(m[3]||'');else if(m[1]==='select'){const options=[...(m[3]||'').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)],chosen=options.find(o=>/\bselected\b/.test(o[1]))||options[0];field.value=chosen?attr(chosen[1],'value'):'';}else field.value=attr(m[2],'value');
          field.defaultValue=field.value;form.fields.push(field);if(field.id)elements.set(field.id,field);
        }
        form.elements={namedItem:name=>{const matching=form.fields.filter(field=>field.name===name);return matching.length>1?matching:matching[0];}};formNodes.push(form);if(form.id)elements.set(form.id,form);
      }
      const heading=this._innerHTML.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);this.heading=heading?new Element('route-heading'):null;if(this.heading)this.heading.textContent=decode(heading[1]);
      const note=this._innerHTML.match(/<textarea id="day-notes" data-day="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/);
      if(note){const field=new Element('day-notes');field.dataset.day=note[1];field.value=decode(note[2]);elements.set(field.id,field);}
      for(const kind of ['path','notes']){const marker='<div id="'+kind+'-results">',at=this._innerHTML.indexOf(marker);if(at>=0){const region=new Element(kind+'-results');region.innerHTML=this._innerHTML.slice(at+marker.length,-6);elements.set(region.id,region);}}
      for(const match of this._innerHTML.matchAll(/id="(video-slot-\d+)"/g))elements.set(match[1],new Element(match[1]));
      for(const id of ['home-stats','progress-stats','analytics-charts'])if(this._innerHTML.includes('id="'+id+'"'))elements.set(id,new Element(id));
    }
    if(this.id.startsWith('video-slot-'))this.frame=this._innerHTML.includes('<iframe')?new Element('iframe'):null;
  }
  addEventListener(type, fn) { events.set(this.id+':'+type, fn); }
  setAttribute() {} removeAttribute() {} focus(){focused=this;focusCount++;} setSelectionRange() {} scrollIntoView() {} closest(selector){return selector==='form'?this.form||null:null;}
  contains(el){return this.id==='main-content'&&(el===this.heading||this.actions?.includes(el)||elements.get('analytics-charts')?.actions?.includes(el)||formNodes.some(f=>f===el||f.fields.includes(el)));}
  querySelectorAll(selector){if(this.id==='main-content')return selector==='form'?formNodes:selector==='[data-action]'?[...(this.actions||[]),...(elements.get('analytics-charts')?.actions||[])]:[];return selector==='input,textarea,select,button'?this.fields||[]:[];}
  querySelector(selector){if(selector==='iframe')return this.frame||null;if(selector==='h2')return this.heading||null;const name=selector.match(/^\[name="([^"]+)"\]$/)?.[1];return name?this.fields?.find(f=>f.name===name)||null:null;}

}
const body=new Element('body');body.tagName='BODY';
elements = new Map(['main-content','page-title','header-subtitle','toast','theme-toggle','motion-toggle','profile-name','storage-info'].map(id=>[id,new Element(id)]));
const doc = {
  hidden:false,body,documentElement:{dataset:{}},get activeElement(){return focused;},getElementById(id){return elements.get(id)||null;},
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { events.set('document:'+type, fn); },
};
const browserWindow = {history:{replaceState(_state,_title,hash){context.location.hash=hash;}},addEventListener(type,fn){events.set('window:'+type,fn);},scrollTo(){}};
class MockFormData extends Map { constructor(form){super(form.fields?form.fields.map(field=>[field.name,field.value]):Object.entries(form.values||{}));}getAll(name){const value=this.get(name);return value==null?[]:Array.isArray(value)?value:[value];} }
const context=vm.createContext({console,URL,Blob,FormData:MockFormData,crypto:webcrypto,structuredClone,Date,Map,Set,Math,JSON,Promise,
  document:doc,window:browserWindow,location:{hash:'#home'},navigator:{},
  setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref?.();return t;},clearTimeout,
  scrollTo(){},scrollY:0,confirm(){return false;},prompt(){return null;},
  fetch:async url=>{try{const source=await fs.readFile(fileURLToPath(url),'utf8');return {ok:true,status:200,json:async()=>JSON.parse(source)};}catch{return {ok:false,status:404};}},
});
const storageApi={...originalStorage,
  async loadState(){return state;},getState(){return state;},subscribe(){return ()=>{};},
  async mutateState(fn){if(delayMutation){const wait=delayMutation;delayMutation=null;await wait;}if(failSaves)throw new Error('Synthetic storage failure');const next=structuredClone(state);fn(next);state=originalStorage.validateState(next);return state;},
  async replaceState(next){state=originalStorage.validateState(next);return state;},
  async getStorageInfo(){return {usage:0,quota:1000000,evidenceBytes:0};},
};
const mocked = new Map([
  ['storage.js',storageApi],
  ['resources.js',{...originalResources,async loadCurriculum(){const curriculum=JSON.parse(await fs.readFile(path.join(root,'data/curriculum.json'),'utf8'));const banks=new Map();for(const name of await fs.readdir(path.join(root,'data/assessments'))){if(!/^week-\d{2}\.json$/.test(name))continue;const week=JSON.parse(await fs.readFile(path.join(root,'data/assessments',name),'utf8'));for(const day of week.days)banks.set(day.dayId,day);}return {curriculum,banks,async loadBank(id){if(failBankLoads)throw new Error('Synthetic assessment download failure');return banks.get(id);}};}}],
  ['timer.js',{getTimerMs:()=>0,startTimer:async()=>{},pauseTimer:async()=>{},logTimer:async()=>{},logManualStudy:async(dayId,minutes,note,{onMutate}={})=>{await storageApi.mutateState(s=>{s.studySessions.push({id:'manual-ui-'+s.studySessions.length,dayId,durationMs:minutes*60000,endedAt:new Date().toISOString(),source:'manual',note});onMutate?.(s);});},initTimer:()=>()=>{}}],
  ['motion.js',{initMotion:options=>{motionCalls.push(options.enabled);return {update(value){motionCalls.push(value);},refresh(_root,options={animate:true}){entranceCalls.push(options.animate);},destroy(){}};}}],
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
for(let i=0;i<100&&(!events.has('window:hashchange')||!elements.get('main-content').innerHTML.includes('Abrir siguiente sesión'));i++)await new Promise(resolve=>setTimeout(resolve,5));
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
await route('#home','Abrir siguiente sesión');
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
await route('#home','Abrir siguiente sesión');
assert.equal(state.days.w01d1.notes,'First note before rapid navigation');
assert.equal(state.days.w01d2.notes,'Second note typed immediately');
// A storage update from another tab must not turn an untouched stale editor into a local draft.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
const untouchedEditor=elements.get('day-notes'),displayedBeforeRemote=untouchedEditor.value;
state=structuredClone(state);originalStorage.ensureDay(state,'w01d1').notes='Remote note saved by another tab';
state=originalStorage.validateState(state);
assert.equal(untouchedEditor.value,displayedBeforeRemote,'the fixture editor remains unchanged and receives no input event');
await route('#home','Abrir siguiente sesión');
assert.equal(state.days.w01d1.notes,'Remote note saved by another tab','navigation must preserve a newer stored note when this editor was not edited');
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
assert.equal(elements.get('day-notes').value,'Remote note saved by another tab','a new visit should display the current stored note');
// A failed flush keeps the current field, its text and route available for retry.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
draftField=elements.get('day-notes');draftField.value='Recover this unsaved note';events.get('document:input')({target:draftField});
failSaves=true;context.location.hash='#home';await events.get('window:hashchange')();
assert.equal(context.location.hash,'#day/w01d1/notes');
assert.equal(elements.get('day-notes'),draftField);assert.equal(draftField.value,'Recover this unsaved note');
failSaves=false;await route('#home','Abrir siguiente sesión');assert.equal(state.days.w01d1.notes,'Recover this unsaved note');
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
await route('#home','Abrir siguiente sesión');const homeWrites=elements.get('main-content').writes;await submitManual(10);
assert.equal(elements.get('main-content').writes,homeWrites,'logging time must update metrics without rebuilding home');
assert.match(elements.get('home-stats').innerHTML,/>35<\/span><small> min<\/small>/,'the visible weekly time must update immediately');
await route('#progress','Resumen de actividad');const progressWrites=elements.get('main-content').writes;await clickAction('chart-range',{range:'30'});
assert.equal(elements.get('main-content').writes,progressWrites,'chart filters must preserve the certification form and screen');
assert.ok(elements.get('analytics-charts').innerHTML.includes('data-range="30" aria-pressed="true"'),'the chart range updates inside its own region');
const sevenDayControl=elements.get('analytics-charts').actions.find(control=>control.dataset.range==='7');sevenDayControl.focus();await clickAction('chart-range',{range:'7'});
assert.equal(focused,elements.get('analytics-charts').actions.find(control=>control.dataset.range==='7'),'a keyboard chart-range change restores the same period control rather than the last button');
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
// Secondary forms survive route changes and save atomically without replaying entrances.
const getForm=id=>formNodes.find(form=>form.id===id);
const edit=(form,name,value)=>{const field=form.elements.namedItem(name);assert.ok(field,'fixture must parse '+form.id+'.'+name);field.value=value;events.get('document:input')({target:field});return field;};
const submit=form=>events.get('document:submit')({target:form,preventDefault(){}});
await route('#settings','Perfil y estudio');
let profileForm=getForm('settings-form');edit(profileForm,'name','Profile draft <safe>');edit(profileForm,'weeklyMinutes','1200');
const committedProfile=state.profile.name;
await route('#progress','Camino de certificaciones');
assert.equal(state.profile.name,committedProfile,'a draft is distinct from committed settings');
assert.equal(state.formDrafts['settings-form'].values.name,'Profile draft <safe>');
await route('#settings','Perfil y estudio');profileForm=getForm('settings-form');
assert.equal(profileForm.elements.namedItem('name').value,'Profile draft <safe>','saved form values must restore via properties');
let activeProfile=profileForm.elements.namedItem('name');activeProfile.focus();
let release;delayMutation=new Promise(resolve=>{release=resolve;});
const savingProfile=submit(profileForm);
assert.ok(profileForm.fields.every(field=>field.disabled),'submitted controls lock before the first async save');
assert.equal(profileForm.dataset.submitting,'true');
await submit(profileForm); // A second submit while storage is waiting is ignored.
release();await savingProfile;
assert.equal(state.profile.name,'Profile draft <safe>');assert.equal(state.profile.weeklyMinutes,1200);
assert.ok(!state.formDrafts['settings-form'],'the committed draft must be deleted atomically');
assert.equal(getForm('settings-form').elements.namedItem('name').value,'Profile draft <safe>');
assert.equal(focused,getForm('settings-form').elements.namedItem('name'),'routine save restores the same field rather than moving to a title');
assert.equal(entranceCalls.at(-1),false,'a routine save must not replay page entrance animations');
// Failed secondary draft writes keep the exact screen and route until retry.
await route('#progress','Camino de certificaciones');
let certForm=getForm('cert-form');edit(certForm,'version','Exam target draft');edit(certForm,'notes','My preparation checklist');
failSaves=true;context.location.hash='#home';await events.get('window:hashchange')();
assert.equal(context.location.hash,'#progress');assert.equal(getForm('cert-form'),certForm);assert.equal(certForm.elements.namedItem('notes').value,'My preparation checklist');
failSaves=false;await route('#home','Abrir siguiente sesión');await route('#progress','Camino de certificaciones');
certForm=getForm('cert-form');assert.equal(certForm.elements.namedItem('version').value,'Exam target draft');
// An untouched stale form never overwrites a newer draft supplied by another tab.
state=structuredClone(state);state.formDrafts['cert-form']={values:{version:'Remote target',notes:'Remote draft'},updatedAt:new Date().toISOString()};state=originalStorage.validateState(state);
await route('#home','Abrir siguiente sesión');assert.equal(state.formDrafts['cert-form'].values.version,'Remote target');
await route('#progress','Camino de certificaciones');assert.equal(getForm('cert-form').elements.namedItem('version').value,'Remote target');
await submit(getForm('cert-form'));assert.equal(state.certification.version,'Remote target');assert.ok(!state.formDrafts['cert-form']);
// Distinct per-day evidence and doubt drafts coexist; another action preserves both.
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');
let evidenceForm=getForm('evidence-link-form'),doubtForm=getForm('doubt-form');
edit(evidenceForm,'title','Network evidence');let evidenceField=edit(evidenceForm,'content','Traceroute analysis draft');evidenceField.focus();
edit(doubtForm,'text','Why does this packet expire?');
await clickAction('favorite',{id:'w01d1'});
assert.equal(getForm('evidence-link-form').elements.namedItem('content').value,'Traceroute analysis draft');
assert.equal(getForm('doubt-form').elements.namedItem('text').value,'Why does this packet expire?');
assert.equal(focused,getForm('evidence-link-form').elements.namedItem('content'));
await route('#day/w01d2/notes','Tu cuaderno de laboratorio');assert.equal(getForm('evidence-link-form').elements.namedItem('title').value,'');
await route('#day/w01d1/notes','Tu cuaderno de laboratorio');await submit(getForm('evidence-link-form'));
assert.equal(state.days.w01d1.evidence.at(-1).content,'Traceroute analysis draft');assert.ok(!state.formDrafts['evidence-link-form:w01d1']);
assert.equal(getForm('evidence-link-form').elements.namedItem('content').value,'','a submitted evidence must not return as a draft');
assert.equal(getForm('doubt-form').elements.namedItem('text').value,'Why does this packet expire?','saving evidence preserves the other form draft');
await submit(getForm('doubt-form'));assert.ok(!state.formDrafts['doubt-form:w01d1']);
// Manual study clears its draft inside the same study-log transaction, without rebuilding the view.
await route('#home','Abrir siguiente sesión');let manualForm=getForm('manual-time-form');edit(manualForm,'minutes','5');edit(manualForm,'note','External lab draft');
await route('#progress','Camino de certificaciones');await route('#home','Abrir siguiente sesión');manualForm=getForm('manual-time-form');
assert.equal(manualForm.elements.namedItem('minutes').value,'5');const logsBefore=state.studySessions.length,writesBeforeManual=elements.get('main-content').writes;
await submit(manualForm);assert.equal(state.studySessions.length,logsBefore+1);assert.ok(!state.formDrafts['manual-time-form']);assert.equal(elements.get('main-content').writes,writesBeforeManual);
assert.equal(manualForm.elements.namedItem('minutes').value,'');
// Accent-insensitive search reveals matching sessions and keeps keyboard focus in its input.
await route('#path','Programa de estudio');const focusBeforeFilter=focusCount;
events.get('document:input')({target:{id:'path-search',value:'informatica'}});await new Promise(resolve=>setTimeout(resolve,180));
assert.ok(elements.get('path-results').innerHTML.includes('<mark>Informática</mark>'));assert.match(elements.get('path-results').innerHTML,/<details class="week-days" open>/);
assert.equal(focusCount,focusBeforeFilter,'filtering must not focus the route title');
events.get('document:input')({target:{id:'path-search',value:''}});await new Promise(resolve=>setTimeout(resolve,180));
// Notebook filters include favorite-only sessions and search evidence text without a written note.
originalStorage.ensureDay(state,'w02d1').favorite=true;
originalStorage.ensureDay(state,'w02d2').evidence.push({id:'evidence-search',title:'Redes',content:'Análisis único de paquete',type:'text',createdAt:new Date().toISOString()});
state.days.w01d1.notesEditedAt='2025-01-01T00:00:00.000Z';state.days.w01d2.notesEditedAt='2026-01-01T00:00:00.000Z';state=originalStorage.validateState(state);
await route('#notes/favorites','Notas, dudas y evidencias');assert.ok(elements.get('notes-results').innerHTML.includes('#day/w02d1/notes'));
await route('#notes/evidence','Notas, dudas y evidencias');events.get('document:input')({target:{id:'notes-search',value:'analisis unico'}});await new Promise(resolve=>setTimeout(resolve,180));
assert.ok(elements.get('notes-results').innerHTML.includes('#day/w02d2/notes'));assert.ok(elements.get('notes-results').innerHTML.includes('<mark>Análisis único</mark>'));
events.get('document:input')({target:{id:'notes-search',value:''}});await new Promise(resolve=>setTimeout(resolve,180));
await route('#notes/all','Notas, dudas y evidencias');
const noteOrder=elements.get('notes-results').innerHTML;assert.ok(noteOrder.indexOf('#day/w01d2/notes')<noteOrder.indexOf('#day/w01d1/notes'),'recent order follows actual edit date rather than curriculum position');
// Last activity and next pending session are distinct destinations.
await route('#day/w02d2/resources','He estudiado este recurso');const resumeHome=await route('#home','Abrir siguiente sesión');
assert.equal(state.lastActivity.dayId,'w02d2');assert.equal(state.lastActivity.tab,'resources');assert.ok(resumeHome.includes('href="#day/w02d2/resources"'));assert.ok(resumeHome.includes('data-hash="day/w01d2/'));
assert.equal(focused,elements.get('main-content').heading,'accepted navigation focuses the new page title');
// Grouped inputs return a RadioNodeList from namedItem; focus must use the matching control ordinal.
await route('#day/w01d1/practice','Comprobar solución');const groupedForm=getForm('challenge-form');
assert.ok(Array.isArray(groupedForm.elements.namedItem('challenge')),'fixture must model grouped named inputs');groupedForm.fields[0].focus();await submit(groupedForm);
assert.equal(focused,getForm('challenge-form').fields[0],'a grouped input must restore focus without calling focus on RadioNodeList');
// Finishing all sessions presents review/evidence actions instead of another pending lesson.
const beforeComplete=structuredClone(state);
for(const week of curriculum.weeks)for(const day of week.days){const savedDay=originalStorage.ensureDay(state,day.id);savedDay.resources=Object.fromEntries(day.resources.map(resource=>[resource.id,true]));savedDay.challengePassed=true;savedDay.attempts.push({id:'complete-'+day.id,result:{passed:true,percentage:100},passed:true,score:100,submittedAt:new Date().toISOString()});}
state=originalStorage.validateState(state);const completeHome=await route('#home','Recorrido completado');
assert.ok(completeHome.includes('364 / 364 sesiones'));assert.ok(completeHome.includes('href="#notes/evidence"'));assert.ok(!completeHome.includes('Abrir siguiente sesión'));
state=beforeComplete;await route('#progress','Resumen de actividad');

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
