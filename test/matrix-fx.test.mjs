import test from 'node:test';import assert from 'node:assert/strict';
import {loadReferenceFx,parseReferenceFx} from '../scripts/matrix-fx.mjs';
const xml="<Cube time='2026-11-05'><Cube currency='USD' rate='1.10'/><Cube currency='CNY' rate='7.70'/></Cube>";
test('ECB cross-rate preserves its publication date and rejects future/stale rates',()=>{
 const rate=parseReferenceFx(xml,new Date('2026-11-06T06:00:00Z'));assert.ok(Math.abs(rate.rate-7)<1e-10);assert.equal(rate.date,'2026-11-05');assert.match(rate.source,/ecb.europa.eu/);
 assert.throws(()=>parseReferenceFx(xml,new Date('2026-11-04T06:00:00Z')));assert.throws(()=>parseReferenceFx(xml,new Date('2026-11-20T06:00:00Z')));
});
test('one reference fetch per Shanghai day, retained cache and unavailable rates never invent conversion',async()=>{
 const state={};let requests=0,saves=0;const options={state,save:()=>saves++,now:()=>new Date('2026-11-06T06:00:00Z'),fetchImpl:async()=>{requests++;return new Response(xml);}};
 const rate=await loadReferenceFx(options);assert.equal(requests,1);assert.equal(saves,1);assert.deepEqual(await loadReferenceFx(options),rate);assert.equal(requests,1);
 assert.equal(await loadReferenceFx({state:{},save:()=>{},now:options.now,fetchImpl:async()=>{throw Error('offline');}}),null);
});
