import test from 'node:test';
import assert from 'node:assert/strict';
import {MatrixRunner} from '../scripts/matrix-runner.mjs';

function fixture(always429=false,retryAfter='60'){
 let clock=new Date('2026-11-06T09:00:00Z'),paid=0;const s={day:'2026-11-06',slot:1,question:{id:'BCJ-002'},runId:'old',phase:'planned'},state={calls:[],matrixRuns:{days:{[s.day]:{slots:[s]}},outbox:[],providerBlocked:{status:403}}};
 const runner=new MatrixRunner({state,save:()=>{},contentRevision:'beauty-evidence-v3',openRouterKey:'test',openRouterModel:'qwen/qwen3.7-plus',runId:'retry',now:()=>clock,fetch:async()=>{paid++;return paid===1||always429?new Response(JSON.stringify({error:{message:'Provider returned error'}}),{status:429,headers:{'Retry-After':retryAfter}}):new Response(JSON.stringify({id:'accepted',usage:{cost:.001},choices:[{finish_reason:'stop',message:{content:'{}'}}]}));}});runner.acceptedReport=async()=>{};
 return{runner,state,s,paid:()=>paid,advance:ms=>{clock=new Date(clock.getTime()+ms);}};
}
test('a complete429 waits30min, preserves the rejection, retries once and then reuses successful cache',async()=>{
 const f=fixture();await assert.rejects(f.runner.model('correct-final',[],100,f.s),/429/);const original=JSON.stringify(f.state.calls[0]);f.s.phase='failed';f.s.failure='OpenRouter HTTP 429';assert.equal(f.runner.recoverRateLimited(f.s.day),false);f.advance(29*60000);assert.equal(f.runner.recoverRateLimited(f.s.day),false);f.advance(60000);assert.equal(f.runner.recoverRateLimited(f.s.day),true);await f.runner.model('correct-final',[],100,f.s);assert.equal(f.paid(),2);assert.equal(JSON.stringify(f.state.calls[0]),original);assert.equal(f.state.calls[1].retryOf,f.state.calls[0].id);await f.runner.model('correct-final',[],100,f.s);assert.equal(f.paid(),2);
});
test('a second429 for the same stage never loops and server Retry-After can postpone beyond30min',async()=>{
 const f=fixture(true,'7200');await assert.rejects(f.runner.model('correct-final',[],100,f.s),/429/);f.s.phase='failed';f.s.failure='OpenRouter HTTP 429';f.advance(31*60000);assert.equal(f.runner.recoverRateLimited(f.s.day),false);f.advance(90*60000);assert.equal(f.runner.recoverRateLimited(f.s.day),true);await assert.rejects(f.runner.model('correct-final',[],100,f.s),/429/);f.s.phase='failed';f.s.failure='OpenRouter HTTP 429';f.advance(3*3600000);assert.equal(f.runner.recoverRateLimited(f.s.day),false);assert.equal(f.paid(),2);
});
test('rate-limit recovery cannot reopen ambiguous, published, deployed or factual failures',async()=>{
 for(const patch of[{publishedAt:'2026-11-06T09:00:00Z'},{deployAttemptAt:'2026-11-06T09:00:00Z'},{failure:'Factual review rejected article'}]){const f=fixture();await assert.rejects(f.runner.model('correct-final',[],100,f.s));Object.assign(f.s,{phase:'failed',failure:'OpenRouter HTTP 429'},patch);f.advance(3600000);assert.equal(f.runner.recoverRateLimited(f.s.day),false);}
 const f=fixture();await assert.rejects(f.runner.model('correct-final',[],100,f.s));Object.assign(f.s,{phase:'failed',failure:'OpenRouter HTTP 429'});f.state.calls.push({articleId:f.s.question.id,status:'transport-error'});f.advance(3600000);assert.equal(f.runner.recoverRateLimited(f.s.day),false);
});

test('a granted retry cannot change messages, token cap or model and creates no pending paid row',async()=>{
 for(const variant of['messages','tokens','model']){const f=fixture();await assert.rejects(f.runner.model('correct-final',[],100,f.s));f.s.phase='failed';f.s.failure='OpenRouter HTTP 429';f.advance(3600000);f.runner.recoverRateLimited(f.s.day);if(variant==='model')f.runner.openRouterModel='qwen/qwen-plus';await assert.rejects(f.runner.model('correct-final',variant==='messages'?[{role:'user',content:'changed'}]:[],variant==='tokens'?101:100,f.s),/inputs changed|identity/i);assert.equal(f.paid(),1);assert.equal(f.state.calls.length,1);}
});
