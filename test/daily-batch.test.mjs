import test from 'node:test';import assert from 'node:assert/strict';
import {chooseBatch} from '../scripts/daily-batch.mjs';
test('daily pair is idempotent and resumes incomplete work without extra articles',()=>{
 const bank=[1,2,3,4].map(n=>({id:'Q'+n,slug:'q'+n,status:'planned'}));
 const first=chooseBatch(bank,{},'2026-11-06');assert.equal(first.slugs.length,2);
 assert.deepEqual(chooseBatch(bank,{'2026-11-06':first},'2026-11-06'),first);
 assert.deepEqual(chooseBatch(bank,{'2026-11-06':first},'2026-11-07'),first);
 const done={...first,state:'complete',completedOn:'2026-11-07'};assert.equal(chooseBatch(bank,{'2026-11-06':done},'2026-11-07'),null);
 assert.throws(()=>chooseBatch(bank.slice(0,1),{},'2026-11-08'),/two/);
});
