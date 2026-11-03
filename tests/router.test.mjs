import test from 'node:test';
import assert from 'node:assert/strict';
import { initRouter } from '../assets/js/router.js';

test('a rejected navigation flush preserves the accepted route and does not replace the screen', async () => {
  const previousWindow=globalThis.window,previousLocation=globalThis.location;
  const events=new Map(),errors=[],rendered=[];let fail=false;
  globalThis.location={hash:'#day/w01d1/notes'};
  globalThis.window={addEventListener:(name,fn)=>events.set(name,fn),history:{replaceState(_s,_t,hash){location.hash=hash;}}};
  try {
    await initRouter(()=>rendered.push(location.hash),{beforeChange:async()=>{if(fail)throw new Error('Save failed');},onError:error=>errors.push(error.message)});
    fail=true;location.hash='#home';await events.get('hashchange')();
    assert.equal(location.hash,'#day/w01d1/notes');assert.deepEqual(rendered,['#day/w01d1/notes']);assert.deepEqual(errors,['Save failed']);
    fail=false;location.hash='#home';await events.get('hashchange')();assert.deepEqual(rendered,['#day/w01d1/notes','#home']);
  } finally {globalThis.window=previousWindow;globalThis.location=previousLocation;}
});

test('an older asynchronous route cannot render after a newer navigation request', async () => {
  const previousWindow=globalThis.window,previousLocation=globalThis.location;
  const events=new Map(),rendered=[];let release,entered;
  const loading=new Promise(resolve=>{entered=resolve;});
  globalThis.location={hash:'#home'};globalThis.window={addEventListener:(name,fn)=>events.set(name,fn),history:{replaceState(){}}};
  try {
    await initRouter(async({isCurrent})=>{const hash=location.hash;if(hash==='#slow'){entered();await new Promise(resolve=>{release=resolve;});}if(isCurrent())rendered.push(hash);});
    location.hash='#slow';const older=events.get('hashchange')();await loading;
    location.hash='#path';const newer=events.get('hashchange')();release();await Promise.all([older,newer]);
    assert.deepEqual(rendered,['#home','#path']);
  } finally {globalThis.window=previousWindow;globalThis.location=previousLocation;}
});
