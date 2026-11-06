import test from 'node:test';
import assert from 'node:assert/strict';
import {MatrixRunner,hash} from '../scripts/matrix-runner.mjs';

const quote='The original manufacturer instruction contains this sufficiently long source quotation.';
const question={id:'BCJ-002',slug:'led-mask-guide',question:'LED红光面罩值得买吗？',category:'美容仪'};
const article=()=>({slug:question.slug,title:question.question,summary:'建议核对型号说明',takeaway:'建议先核对目标和原文',sections:[{heading:'选购前的核对清单',paragraphs:['建议核对具体型号的原文资料，缺少信息时先向厂家询问。'.repeat(25)+'[1]']}],tips:[],caution:'建议使用前核对说明'});
const sources=()=>[1,2].map(i=>({url:`https://www.fda.gov/source-${i}`,title:'Original '+i,text:quote,contentHash:'hash'+i,textHash:'text'+i}));
const approved=()=>({slug:question.slug,approved:true,decisionGain:'给出具体可执行的购买核对条件与顺序',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote}))});
const plan={writing:{instructions:[{id:'beauty',instructions:'Use the original source and site boundaries'}]}};
function setup(options={}){const state={calls:[],matrixRuns:{days:{},outbox:[]}},runner=new MatrixRunner({state,save:()=>{},now:()=>new Date('2026-11-06T08:00:00Z'),runId:'recovery',...options});runner.currentPlan={reportUrl:'https://matrix.example/report'};runner.acceptedReport=async()=>{};return {runner,state:runner.state};}
const slot=()=>({day:'2026-11-06',slot:1,question:{...question},phase:'planned'});

test('explicit content revision reopens only known quality/source failures once and preserves receipts and daily identity',()=>{
 const s={...slot(),phase:'failed',runId:'old-1',failure:'Factual review rejected article',article:article(),review:{approved:false,issues:['unsupported claim']}},day={slots:[s]},oldCall={id:'original',matrixDay:s.day,matrixSlot:1,stage:'review',status:'returned',response:{choices:[{finish_reason:'stop',message:{content:'{}'}}]}};
 const {runner,state}=setup({contentRevision:'beauty-evidence-v1',state:{calls:[oldCall],matrixRuns:{days:{[s.day]:day},outbox:[]}}});const before=JSON.stringify(oldCall),oldReview=JSON.stringify(s.review);
 assert.equal(runner.migrateContentRevision(s.day),true);assert.equal(s.runId,'recovery-1');assert.equal(s.phase,'planned');assert.equal(s.question.id,question.id);assert.equal(JSON.stringify(s.review),oldReview);assert.equal(JSON.stringify(oldCall),before);assert.equal(s.contentRecovery.previousFailure,'Factual review rejected article');
 s.phase='failed';assert.equal(runner.migrateContentRevision(s.day),false);assert.equal(state.matrixRuns.days[s.day].slots.length,1);
 for(const patch of[{publishedAt:'2026-11-06T01:00:00Z'},{deployAttemptAt:'2026-11-06T01:00:00Z'},{failure:'Other unexpected failure'}]){const bad={...slot(),phase:'failed',failure:'Factual review rejected article',...patch},{runner:r}=setup({contentRevision:'beauty-evidence-v1',state:{calls:[],matrixRuns:{days:{[s.day]:{slots:[bad]}},outbox:[]}}});assert.equal(r.migrateContentRevision(s.day),false);}
});

test('one reviewer-guided revision preserves rejected draft, rechecks every public field and caches paid successes',async()=>{
 const s={...slot(),sources:sources(),article:{...article(),provider:'openrouter',model:'qwen/qwen-plus'},writtenAt:'2026-11-06T06:12:00Z',review:{slug:question.slug,approved:false,decisionGain:'需要修订事实边界与来源',issues:['Remove unsupported universal contraindications']}};
 const {runner,state}=setup();const calls=[];runner.model=async(stage,messages)=>{calls.push(stage);assert.match(JSON.stringify(messages),/unsupported|每|EVERY|source/i);state.calls.push({matrixDay:s.day,matrixSlot:1,stage,status:'returned',provider:'openrouter',model:'qwen/qwen-plus'});return{choices:[{message:{content:JSON.stringify(stage==='revise'?article():approved())}}]};};
 await runner.prepare(s,plan);assert.deepEqual(calls,['revise','review-revision']);assert.equal(s.phase,'approved');assert.equal(s.revisionHistory[0].review.approved,false);assert.equal(s.revisionHistory[0].writtenAt,'2026-11-06T06:12:00Z');assert.equal(s.review.approved,true);assert.equal(s.article.provider,'openrouter');
 await runner.prepare(s,plan);assert.equal(calls.length,2);
});

test('failed revision remains blocked and cannot buy unlimited drafts on replay',async()=>{
 const s={...slot(),sources:sources(),article:{...article(),provider:'openrouter',model:'qwen/qwen-plus'},review:{slug:question.slug,approved:false,issues:['Unsupported fact']}},{runner,state}=setup();let calls=0;
 runner.model=async(stage)=>{calls++;state.calls.push({matrixDay:s.day,matrixSlot:1,stage,status:'returned',provider:'openrouter',model:'qwen/qwen-plus'});return{choices:[{message:{content:JSON.stringify(stage==='revise'?article():{...approved(),approved:false,issues:['Still unsupported']})}}]};};
 await assert.rejects(runner.prepare(s,plan),/review|修订/i);assert.equal(calls,2);await assert.rejects(runner.prepare(s,plan),/review|修订/i);assert.equal(calls,2);
});

test('a supplement source search is limited to one and preserves the original discovery result',async()=>{
 const s={...slot(),sources:[sources()[0]],sourceFailures:[{url:'https://www.mynuface.com/old.pdf',error:'Old reader rejected PDF'}]},original={id:'research-paid',matrixDay:s.day,matrixSlot:1,stage:'research',status:'returned',response:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[{url:sources()[0].url}]})}}]}};
 const {runner,state}=setup({state:{calls:[original],matrixRuns:{days:{},outbox:[]}}});let paid=0;runner.source=async ref=>{if(ref.url.endsWith('old.pdf'))throw Error('Blocked');return{...sources()[ref.url.endsWith('2')?1:0],url:ref.url};};
 runner.model=async stage=>{assert.equal(stage,'research-supplement');paid++;return{choices:[{message:{content:JSON.stringify({urls:[{url:sources()[1].url}]})}}]};};const before=hash(JSON.stringify(original));
 await runner.ensureSources(s);assert.equal(s.sources.length,2);assert.equal(paid,1);await runner.ensureSources(s);assert.equal(paid,1);assert.equal(hash(JSON.stringify(state.calls[0])),before);
});

test('an interrupted revised review resumes only its revision stage and never uses the rejected original review',async()=>{
 const s={...slot(),sources:sources(),article:{...article(),provider:'openrouter',model:'qwen/qwen-plus'},revisedAt:'2026-11-06T07:00:00Z',revisionHistory:[{article:article(),review:{approved:false}}]},{runner}=setup();const stages=[];
 runner.model=async stage=>{stages.push(stage);return{choices:[{message:{content:JSON.stringify(approved())}}]};};await runner.prepare(s,plan);assert.deepEqual(stages,['review-revision']);assert.equal(s.phase,'approved');
});

test('a plan paused between stages stops before a new paid provider request',async()=>{
 const {runner,state}=setup({apiKey:'test',fetch:async()=>{throw Error('paid call after pause');}});runner.currentPlan.daily={enabled:true};runner.plan=async()=>({daily:{enabled:false}});
 await assert.rejects(runner.model('revise',[],100,slot()),/paused|due/i);assert.equal(state.calls.length,0);
});
