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
let state = originalStorage.createDefaultState();
let failSaves = false;
const events = new Map();
class Element {
  constructor(id) { this.id=id; this.dataset={}; this.innerHTML=''; this.textContent=''; this.value=''; this.hidden=true; this.className=''; this.classList={toggle(){},remove(){},add(){}}; }
  addEventListener(type, fn) { events.set(this.id+':'+type, fn); }
  setAttribute() {} removeAttribute() {} focus() {} setSelectionRange() {} scrollIntoView() {}
}
const elements = new Map(['main-content','page-title','header-subtitle','toast','theme-toggle','motion-toggle','profile-name','storage-info'].map(id=>[id,new Element(id)]));
const doc = {
  hidden:false, documentElement:{dataset:{}},
  querySelector(selector) { return selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { events.set('document:'+type, fn); },
};
const browserWindow = {addEventListener(type,fn){events.set('window:'+type,fn);},scrollTo(){}};
const context=vm.createContext({console,URL,Blob,FormData,crypto:webcrypto,structuredClone,Date,Map,Set,Math,JSON,Promise,
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
  ['timer.js',{getTimerMs:()=>0,startTimer:async()=>{},pauseTimer:async()=>{},logTimer:async()=>{},initTimer:()=>()=>{}}],
  ['motion.js',{initMotion:()=>({update(){},destroy(){}})}],
]);
const cache=new Map();
async function moduleFor(filename){
  filename=path.resolve(filename); if(cache.has(filename))return cache.get(filename);
  const name=path.basename(filename); let module;
  if(mocked.has(name)){
    const api=mocked.get(name);module=new vm.SyntheticModule(Object.keys(api),function(){for(const [k,v]of Object.entries(api))this.setExport(k,v);},{context,identifier:filename});
  }else{
    module=new vm.SourceTextModule(await fs.readFile(filename,'utf8'),{context,identifier:filename,initializeImportMeta(meta){meta.url=pathToFileURL(filename).href;}});
  }
  cache.set(filename,module);await module.link((specifier,ref)=>moduleFor(path.resolve(path.dirname(ref.identifier),specifier)));return module;
}
await (await moduleFor(path.join(root,'assets/js/app.js'))).evaluate();
for(let i=0;i<100&&!events.has('window:hashchange');i++)await new Promise(resolve=>setTimeout(resolve,5));
assert.ok(events.has('window:hashchange'),'app boot must initialize router');
assert.ok(!elements.get('main-content').innerHTML.includes('No pudimos abrir'),'app boot must not show failure fallback');
let routes=0;
function route(hash, expected){
  context.location.hash=hash;events.get('window:hashchange')();
  const markup=elements.get('main-content').innerHTML;
  assert.ok(markup.includes(expected),hash+' should include '+expected);routes++;return markup;
}
route('#home','Continuar estudiando');
route('#path','SEMANA 01');
route('#day/w01d1/learn','Resultado esperado');
route('#day/w01d1/resources','He estudiado este recurso');
route('#day/w01d1/practice','Comprobar solución');
route('#day/w01d1/quiz','Comenzar prueba');
route('#day/w01d1/notes','Tu cuaderno de laboratorio');
route('#notes','Tu cuaderno está listo');
route('#progress','Camino de certificaciones');
route('#settings','Protege tu recorrido');
route('#day/w52d7/learn','Estás explorando una sesión futura');
route('#day/w52d7/quiz','Evaluación pendiente de desarrollo');
route('#day/unknown/learn','Sesión no encontrada');
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
route('#day/w01d1/quiz','Entregar prueba');
assert.equal((elements.get('main-content').innerHTML.match(/class="question"/g)||[]).length,6,'six quiz questions must render');
saved=state.days[first.id];
const answers=Object.fromEntries(saved.draft.questions.map(q=>[q.id,q.correct]));
const result=originalAssessment.scoreAttempt(saved.draft,answers);
assert.equal(result.passed,true,'correct answers should pass snapshot');
saved.attempts.push({...saved.draft,answers,result,score:result.score,passed:result.passed,submittedAt:result.submittedAt});saved.draft=null;
state=originalStorage.validateState(state);
assert.equal(state.days[first.id].attempts.length,1,'completed attempt must be in current state');
assert.equal(state.days[first.id].challengePassed,true);
route('#day/w01d1/quiz','Sesión superada');
route('#home','w01d2');
const notesMarkup=route('#day/w01d1/notes','&lt;script&gt;do-not-render&lt;/script&gt;');
assert.ok(!notesMarkup.includes('<script>do-not-render</script>'),'notes must remain escaped');
route('#notes','1 dudas abiertas');
route('#progress','100');
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
