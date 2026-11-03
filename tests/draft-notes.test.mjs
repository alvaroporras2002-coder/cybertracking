import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteDrafts } from '../assets/js/draft-notes.js';

function fixture(write) {
  const saved = new Map(), timers = new Map(); let next = 0;
  const drafts = createNoteDrafts({ read: id => saved.get(id) || '', write: write || (async (id,text) => saved.set(id,text)),
    setTimer: callback => {timers.set(++next,callback);return next;}, clearTimer: id => timers.delete(id) });
  return { drafts, saved, timers };
}
test('rapid edits in different lessons both survive a navigation flush', async () => {
  const {drafts,saved,timers}=fixture();
  drafts.set('w01d1','First pending note');drafts.set('w01d2','Second pending note');
  assert.equal(timers.size,2,'editing another lesson must not cancel the first save');
  await drafts.flush();
  assert.equal(saved.get('w01d1'),'First pending note');assert.equal(saved.get('w01d2'),'Second pending note');
  assert.equal(drafts.pending(),false);
});
test('a persistence failure keeps the draft recoverable until retry succeeds', async () => {
  let fail=true;const saved=new Map();
  const {drafts}=fixture(async(id,text)=>{if(fail)throw new Error('Quota unavailable');saved.set(id,text);});
  drafts.set('w05d3','A note that must survive');
  await assert.rejects(drafts.flush(),/Quota unavailable/);
  assert.equal(drafts.value('w05d3'),'A note that must survive');assert.equal(drafts.pending(),true);
  fail=false;await drafts.flush();assert.equal(saved.get('w05d3'),'A note that must survive');assert.equal(drafts.pending(),false);
});
test('an edit made during persistence supersedes the old snapshot without losing either lesson', async () => {
  const saved=new Map(), writes=[];let release;
  const {drafts}=fixture(async(id,text)=>{writes.push(text);if(text==='Earlier draft')await new Promise(resolve=>{release=resolve;});saved.set(id,text);});
  drafts.set('w02d1','Earlier draft');const first=drafts.save('w02d1');
  await Promise.resolve();drafts.set('w02d1','Latest draft');drafts.set('w02d2','Separate lesson');
  release();await first;await drafts.flush();
  assert.equal(saved.get('w02d1'),'Latest draft');assert.equal(saved.get('w02d2'),'Separate lesson');
  assert.deepEqual(writes.filter(text=>text!=='Separate lesson'),['Earlier draft','Latest draft']);
});
