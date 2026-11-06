import test from 'node:test';
import assert from 'node:assert/strict';
import {MatrixRunner} from '../scripts/matrix-runner.mjs';

const quote='This exact original instruction is long enough to validate without any invented content.';
const q={id:'BCJ-002',slug:'led-mask-guide',question:'LED红光面罩值得买吗？',category:'美容仪'};
const article={slug:q.slug,title:q.question,summary:'编辑部建议先核对型号说明',takeaway:'编辑部建议先按目标核对原文',sections:[{heading:'核对清单',paragraphs:['编辑部建议核对具体型号的原文资料，缺少信息时先向厂家询问。'.repeat(24)+'[1]']}],tips:[],caution:'编辑部建议核对说明'};
const sources=[1,2].map(i=>({url:`https://www.fda.gov/source-${i}`,title:'Original',text:quote,textHash:'s'+i}));
const pack={facts:[1,2,1,2].map(sourceId=>({sourceId,quote,claim:'Old interpretation',scope:'原文条件'}))};
const review={slug:q.slug,approved:true,decisionGain:'给出可核查的具体购买判断和条件',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote}))};
function setup(s){const state={calls:[],matrixRuns:{days:{[s.day]:{slots:[s]}},outbox:[]}},runner=new MatrixRunner({state,save:()=>{},contentRevision:'beauty-evidence-v3',openRouterModel:'qwen/qwen3.7-plus',runId:'new-model',now:()=>new Date('2026-11-06T09:00:00Z')});runner.acceptedReport=async()=>{};return {runner,state};}
const slot=()=>({day:'2026-11-06',slot:1,question:{...q},phase:'failed',failure:'Factual review rejected article',runId:'old',sources:structuredClone(sources),factPack:structuredClone(pack),article:{...article,provider:'openrouter',model:'qwen/qwen-plus'},review:{approved:false,issues:['Old rejected output']},revisedAt:'2026-11-06T07:00:00Z',groundedAt:'2026-11-06T08:00:00Z'});

test('one explicit cheap Plus upgrade retains paid history and never reopens published or ambiguous work',()=>{
 const s=slot(),{runner,state}=setup(s);state.calls.push({id:'old',articleId:q.id,stage:'write-grounded',status:'returned',response:{choices:[{finish_reason:'stop',message:{content:'{}'}}]}});const old=JSON.stringify(state.calls);
 assert.equal(runner.migrateModelRevision(s.day),true);assert.equal(s.runId,'new-model-1');assert.equal(s.phase,'planned');assert.equal(JSON.stringify(state.calls),old);assert.equal(s.modelRecovery.previousFailure,'Factual review rejected article');s.phase='failed';assert.equal(runner.migrateModelRevision(s.day),false);
 for(const field of['publishedAt','deployAttemptAt']){const x=slot();x[field]='2026-11-06T08:00:00Z';assert.equal(setup(x).runner.migrateModelRevision(x.day),false);}
 const a=slot(),x=setup(a);x.state.calls.push({articleId:q.id,status:'transport-error'});assert.equal(x.runner.migrateModelRevision(a.day),false);
});

test('upgrade only composes and reviews with new stage IDs, never repeats extraction and preserves original drafts',async()=>{
 const s=slot(),{runner,state}=setup(s),stages=[];assert.equal(runner.migrateModelRevision(s.day),true);
 runner.model=async(stage,messages)=>{stages.push(stage);assert(!JSON.stringify(messages).includes('Old interpretation'));state.calls.push({matrixDay:s.day,matrixSlot:1,stage,status:'returned',provider:'openrouter',model:'qwen/qwen3.7-plus'});return{choices:[{message:{content:JSON.stringify(stage==='write-final'?article:review)}}]};};
 await runner.prepare(s,{writing:{instructions:[{instructions:'Use originals and keep scope'}]}});assert.deepEqual(stages,['write-final','review-final']);assert.equal(s.phase,'approved');assert.equal(s.article.model,'qwen/qwen3.7-plus');assert.equal(s.modelRevisionHistory[0].review.approved,false);await runner.prepare(s,{writing:{instructions:[{instructions:'Use originals and keep scope'}]}});assert.equal(stages.length,2);
});

test('new Plus provider request has explicit disabled reasoning and still uses strict JSON and existing USD receipts',async()=>{
 const s=slot(),state={calls:[],matrixRuns:{days:{},outbox:[],providerBlocked:{status:403}}},runner=new MatrixRunner({state,save:()=>{},apiKey:'old',openRouterKey:'existing',openRouterModel:'qwen/qwen3.7-plus',contentRevision:'beauty-evidence-v3',now:()=>new Date('2026-11-06T09:00:00Z'),fetch:async(_url,options)=>{const b=JSON.parse(options.body);assert.equal(b.model,'qwen/qwen3.7-plus');assert.deepEqual(b.reasoning,{enabled:false});assert.deepEqual(b.response_format,{type:'json_object'});assert.deepEqual(b.provider,{require_parameters:true});return new Response(JSON.stringify({id:'new-model-request',usage:{cost:.002},choices:[{finish_reason:'stop',message:{content:'{}'}}]}));}});runner.acceptedReport=async()=>{};await runner.model('write-final',[],100,s);assert.equal(state.calls.length,1);assert.equal(state.calls[0].cost.actualUsd,.002);assert.equal(state.calls[0].model,'qwen/qwen3.7-plus');
});

test('a rejected final-model review cannot purchase a third recovery call even without an earlier revision',async()=>{
 const s=slot();delete s.revisedAt;const {runner,state}=setup(s),stages=[];runner.migrateModelRevision(s.day);runner.model=async stage=>{stages.push(stage);if(!['write-final','review-final'].includes(stage))throw Error('Unexpected extra paid stage');state.calls.push({matrixDay:s.day,matrixSlot:1,stage,status:'returned',provider:'openrouter',model:'qwen/qwen3.7-plus'});return{choices:[{message:{content:JSON.stringify(stage==='write-final'?article:{...review,approved:false,issues:['Still unsupported']})}}]};};
 await assert.rejects(runner.prepare(s,{writing:{instructions:[{instructions:'Use originals'}]}}),/Factual review/);assert.deepEqual(stages,['write-final','review-final']);await assert.rejects(runner.prepare(s,{writing:{instructions:[{instructions:'Use originals'}]}}),/Factual review/);assert.equal(stages.length,2);
});
