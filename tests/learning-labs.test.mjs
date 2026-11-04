import test from 'node:test';
import assert from 'node:assert/strict';
import {transferEstimate,inspectSubnet,matchTeachingRule,renderLearningLab,handleLearningLabInput} from '../assets/js/learning-labs.js';

test('transfer examples distinguish decimal and binary bytes from network bits',()=>{
  assert.equal(transferEstimate(100,'MB',100).seconds,8);
  assert.equal(transferEstimate(1,'MiB',8).seconds,1.048576);
  assert.equal(transferEstimate(1,'GB',1000).seconds,8);
  for(const args of [[0,'MB',1],[1,'MB',0],[NaN,'MB',1],[1,'bad',1],[Infinity,'MB',1]])assert.throws(()=>transferEstimate(...args));
});
test('CIDR calculation covers subnet boundaries and point-to-point or host exceptions',()=>{
  const a=inspectSubnet('192.0.2.70',26);
  assert.deepEqual([a.network,a.mask,a.broadcast,a.firstHost,a.lastHost,a.usable],['192.0.2.64','255.255.255.192','192.0.2.127','192.0.2.65','192.0.2.126',62]);
  assert.equal(inspectSubnet('192.0.2.70',27).broadcast,'192.0.2.95');
  const p=inspectSubnet('192.0.2.70',31);assert.equal(p.usable,2);assert.equal(p.broadcast,null);assert.equal(p.firstHost,'192.0.2.70');assert.equal(p.lastHost,'192.0.2.71');
  const host=inspectSubnet('255.255.255.255',32);assert.equal(host.usable,1);assert.equal(host.network,'255.255.255.255');assert.equal(host.broadcast,null);
  assert.equal(inspectSubnet('203.0.113.5',0).network,'0.0.0.0');
  for(const args of [['256.0.0.1',24],['1.2.3',24],['x.2.3.4',24],['1.2.3.4',33],['1.2.3.4',''],['1.2.3.4',2.5]])assert.throws(()=>inspectSubnet(...args));
});
test('the teaching policy chooses the first matching rule and preserves protocol and port distinctions',()=>{
  assert.equal(matchTeachingRule({source:'invitados',destination:'interno',protocol:'TCP',port:443}).id,'1');
  assert.equal(matchTeachingRule({source:'personal',destination:'web',protocol:'TCP',port:443}).action,'Permitir');
  assert.equal(matchTeachingRule({source:'personal',destination:'web',protocol:'UDP',port:443}).id,'5');
  assert.equal(matchTeachingRule({source:'administracion',destination:'interno',protocol:'TCP',port:22}).id,'3');
  assert.equal(matchTeachingRule({source:'personal',destination:'internet',protocol:'TCP',port:443}).id,'4');
  assert.throws(()=>matchTeachingRule({port:0,protocol:'TCP'}));
});
test('an experiment updates only its result and invalid input is recoverable',()=>{
  const output={innerHTML:''},values={address:'192.0.2.70',prefix:'26'};
  const root={dataset:{learningLab:'subnet'},querySelector:s=>s==='[data-lab-result]'?output:{value:values[s.match(/="([^"]+)"/)[1]]}};
  const event={target:{closest:()=>root,hasAttribute:()=>true}};
  assert.equal(handleLearningLabInput(event),true);assert.match(output.innerHTML,/192\.0\.2\.127/);
  values.address='<script>';handleLearningLabInput(event);assert.match(output.innerHTML,/IPv4/);assert.doesNotMatch(output.innerHTML,/<script>/);
  assert.equal(handleLearningLabInput({target:{closest:()=>null}}),false);
  assert.equal(renderLearningLab('w40d1'),'');assert.match(renderLearningLab('w11d1'),/data-learning-lab="subnet"/);
});
