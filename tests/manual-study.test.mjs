import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('manual study validates records, preserves the running timer and survives the existing state schema', async () => {
  const script = String.raw`
import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import {webcrypto} from 'node:crypto';
import {createDefaultState,validateState} from './assets/js/storage.js';import {exportBackup,parseBackup}from './assets/js/backup.js';
let state=createDefaultState();state.timer={running:true,startedAt:Date.now(),elapsedMs:12000,dayId:'w01d1',ownerId:'other-tab'};const timerBefore=structuredClone(state.timer);
const context=vm.createContext({Date,Math,Number,String,RegExp,Error,crypto:webcrypto,console});
const storage=new vm.SyntheticModule(['getState','mutateState'],function(){this.setExport('getState',()=>state);this.setExport('mutateState',async fn=>{const next=structuredClone(state);fn(next);state=validateState(next);});},{context});
const module=new vm.SourceTextModule(await fs.readFile('./assets/js/timer.js','utf8'),{context});await module.link(()=>storage);await module.evaluate();
await module.namespace.logManualStudy('w05d2',35,'Read external lab documentation');
assert.equal(state.studySessions.length,1);assert.equal(state.studySessions[0].dayId,'w05d2');assert.equal(state.studySessions[0].durationMs,2100000);assert.equal(state.studySessions[0].source,'manual');assert.equal(state.studySessions[0].note,'Read external lab documentation');assert.deepEqual(state.timer,timerBefore);
for(const [day,minutes,note] of [['w99d1',5,''],['w01d1',0,''],['w01d1',721,''],['w01d1',2.5,''],['w01d1',NaN,''],['w01d1',5,'x'.repeat(1001)]])await assert.rejects(module.namespace.logManualStudy(day,minutes,note));
assert.equal(state.studySessions.length,1,'invalid manual entries must not mutate persisted time');assert.deepEqual(state.timer,timerBefore);const restored=parseBackup(await exportBackup(state).text());assert.deepEqual(restored.studySessions,state.studySessions,'manual details must survive existing backups');console.log('manual-study-ok');
state.formDrafts={'manual-time-form':{values:{minutes:'10',note:'Pending entry'},updatedAt:new Date().toISOString()}};
await module.namespace.logManualStudy('w01d1',10,'Pending entry',{onMutate:next=>{delete next.formDrafts['manual-time-form'];}});
assert.equal(state.studySessions.length,2);assert.equal(state.formDrafts['manual-time-form'],undefined);
await assert.rejects(module.namespace.logManualStudy('w01d1',10,'Do not duplicate',{onMutate:()=>{throw new Error('transaction failed');}}),/transaction failed/);
assert.equal(state.studySessions.length,2,'entry and draft cleanup must be atomic');
`;
  const {stdout}=await promisify(execFile)(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{cwd:fileURLToPath(new URL('..',import.meta.url)),timeout:10000});
  assert.match(stdout,/manual-study-ok/);
});
