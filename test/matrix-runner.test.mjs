import test from 'node:test';
import assert from 'node:assert/strict';
import {dayAt, duePlan, selectQuestions, usageEvent, repairLegacyUsage, validateReview, protectArticleWrite, hash, MatrixRunner} from '../scripts/matrix-runner.mjs';

const plan=()=>({site:{id:'beauty',domain:'beautychoicejournal.com'},daily:{enabled:true,quota:2,time:'09:07',timezone:'Asia/Shanghai',publishMode:'auto',articleGapMinutes:10,startDate:'2026-11-06'},writing:{ready:true,instructions:[{id:'skill',name:'Beauty',version:'1',instructions:'Beauty instructions',resources:[]}],questionSets:[{id:'bank',questions:[{id:'BCJ-002',slug:'led-mask-guide',question:'LED?',category:'美容仪',status:'pending'},{id:'BCJ-003',slug:'microcurrent-guide',question:'Microcurrent?',category:'美容仪',status:'planned'}]}]},reportUrl:'https://matrix.relaxbrohk.com/api/runner/report/beauty',searchUrl:'https://matrix.relaxbrohk.com/api/runner/search/beauty'});
test('Shanghai schedule, disabled, future start and exact two quota are enforced',()=>{
 assert.equal(dayAt('2026-11-05T17:00:00Z'),'2026-11-06');
 assert.equal(duePlan(plan(),'2026-11-06T01:06:59Z'),false);
 assert.equal(duePlan(plan(),'2026-11-06T01:07:00Z'),true);
 for(const patch of [{enabled:false},{quota:3},{publishMode:'review'},{startDate:'2026-11-07'},{timezone:'UTC'}]){const p=plan();Object.assign(p.daily,patch);assert.equal(duePlan(p,'2026-11-06T02:00:00Z'),false);}
});
test('Matrix snapshot is authoritative and published/local existing questions excluded',()=>{
 assert.deepEqual(selectQuestions(plan(),[{slug:'led-mask-guide',publicationStatus:'published',reviewStatus:'approved'}]).map(x=>x.id),['BCJ-003']);
 const p=plan();p.writing.questionSets[0].questions[0].slug='../unsafe';assert.throws(()=>selectQuestions(p,[]));
});
test('unknown usage is not zero and final usage events keep provider ID',()=>{
 const call={id:'reserved',model:'qwen-plus',stage:'research',status:'transport-error',startedAt:'2026-11-06T01:07:00Z'};
 assert.equal(usageEvent(call).amountMicros,null);assert.equal(usageEvent(call).status,'unknown');
 call.status='returned';call.requestId='provider-id';call.usage={prompt_tokens:1000,completion_tokens:100};call.cost={modelEstimateCny:.001};
 assert.equal(usageEvent(call).sourceId,'provider-id');assert.equal(usageEvent(call).amountMicros,1000);
});
test('review rejects uncited facts, forged quotations and omitted summaries',()=>{
 const a={slug:'test',title:'标题',summary:'建议先核对',takeaway:'建议先看说明',sections:[{heading:'选择',paragraphs:['事实[1]']}],tips:[],caution:'建议核对说明'};
 const sources=[{text:'A sufficiently long quotation from the original source.'}];
 const review={slug:'test',approved:true,decisionGain:'明确可执行的选购判断和检查动作',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote:sources[0].text}))};
 assert.throws(()=>validateReview(a,review,sources));
 a.title='建议核对标题';a.sections[0].heading='建议先选择';assert.doesNotThrow(()=>validateReview(a,review,sources));
 a.sections[0].heading='频次与禁忌';assert.doesNotThrow(()=>validateReview(a,review,sources));a.sections[0].heading='频次增加保证有效';assert.throws(()=>validateReview(a,review,sources));a.sections[0].heading='频次与禁忌';
 review.checks.pop();assert.throws(()=>validateReview(a,review,sources));
});
test('audit reports history with original dates and never calls model or deployment',async()=>{
 const posted=[];const state={calls:[],batches:{},lastFailure:{at:'2026-11-05T00:00:00Z',message:'Permission denied'}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date('2026-11-06T02:00:00Z'),fetch:async(url,options)=>{if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};posted.push(JSON.parse(options.body));return{ok:true,status:200};},articles:()=>[{slug:'old',publishedAt:'2026-11-05',publicationStatus:'published',reviewStatus:'approved'}],run:()=>{throw Error('must not deploy');}});
 await runner.main('audit');assert.equal(posted.length,1);assert.equal(posted[0].publishedAt,undefined);assert.equal(posted[0].publishedArticles[0].publishedAt,'2026-11-05');assert.equal(posted[0].failure,undefined);assert.match(posted[0].reason,/Permission denied/);
});
test('ambiguous paid call cannot be blindly retried and report failure cannot regenerate',async()=>{
 const state={calls:[],batches:{}};let calls=0;const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',fetch:async()=>{calls++;throw Error('timeout');},endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',apiKey:'test'});
 const slot={day:'2026-11-06',slot:1,question:{id:'BCJ-002'}};
 await assert.rejects(runner.model('write',[],100,slot));await assert.rejects(runner.model('write',[],100,slot),/inspection/);assert.equal(calls,1);assert.equal(state.calls[0].status,'transport-error');
});
test('report outages preserve exact finalized events and retry reports without paid requests',async()=>{
 const state={calls:[],batches:{}};let available=false;const posts=[];
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',fetch:async(url,options)=>{posts.push(options.body);return{ok:available,status:available?200:503};}});runner.currentPlan=plan();
 const call={id:'call1',matrixDay:'2026-11-06',matrixSlot:1,stage:'write',model:'qwen-plus',startedAt:'2026-11-06T01:07:00Z',status:'http-error'};state.calls.push(call);
 await runner.report({day:'2026-11-06',slot:1},'failed',{failure:'403'});assert.equal(state.matrixRuns.outbox.length,1);
 available=true;await runner.flush();assert.equal(posts[0],posts[1]);assert.equal(state.matrixRuns.outbox.length,0);assert.equal(state.calls.length,1);
});
test('two slots start ten minutes apart and a repeated due run is free',async()=>{
 let time=Date.parse('2026-11-06T01:07:00Z');const starts=[],state={calls:[],batches:{}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date(time),sleep:async ms=>{time+=ms;},articles:()=>[],fetch:async()=>({ok:true,json:async()=>plan()})});
 runner.publish=async slot=>{slot.startedAt=new Date(time).toISOString();starts.push(time);slot.phase='published';slot.publishedAt=slot.startedAt;};
 await runner.main('publish');assert.equal(starts.length,2);assert.ok(starts[1]-starts[0]>=600000);
 await runner.main('publish');assert.equal(starts.length,2);
});
test('one qwen-plus 403 blocks the second slot and never falls back',async()=>{
 let time=Date.parse('2026-11-06T01:07:00Z'),paid=0;const models=[],state={calls:[],batches:{}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',apiKey:'test',now:()=>new Date(time),sleep:async ms=>{time+=ms;},articles:()=>[],fetch:async(url,options)=>{
  if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};
  if(url.includes('chat/completions')){paid++;models.push(JSON.parse(options.body).model);return{ok:false,status:403,text:async()=>JSON.stringify({error:{code:'access_denied'}})};}
  return{ok:true,status:200};
 }});
 const result=await runner.main('publish');assert.equal(result.failed,true);assert.equal(paid,1);assert.deepEqual(models,['qwen-plus']);assert.equal(state.matrixRuns.days['2026-11-06'].slots[1].phase,'skipped');
});
test('paused plan consumes no paid request and no day slot',async()=>{
 const p=plan();p.daily.enabled=false;const state={calls:[],batches:{}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date('2026-11-06T02:00:00Z'),fetch:async()=>({ok:true,json:async()=>p})});
 await runner.main('publish');assert.deepEqual(state.matrixRuns.days,{});assert.equal(state.calls.length,0);
});
test('Matrix recent successes enforce quota even without local day state',async()=>{
 const p=plan();p.recentReports=[{day:'2026-11-06',status:'published',articleIds:['BCJ-002'],slot:1,publishedAt:'2026-11-06T01:08:00Z'},{day:'2026-11-06',status:'published',articleIds:['BCJ-003'],slot:2,publishedAt:'2026-11-06T01:20:00Z'}];
 const state={calls:[],batches:{}};const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date('2026-11-06T02:00:00Z'),articles:()=>[],fetch:async()=>({ok:true,json:async()=>p})});
 runner.publish=()=>{throw Error('quota already fulfilled');};await runner.main('publish');assert.equal(state.calls.length,0);assert.deepEqual(state.matrixRuns.days,{});
});
test('explicit permission recheck preserves old receipt and grants only one bounded retry',()=>{
 const slot={day:'2026-11-06',slot:1,phase:'failed',question:{id:'BCJ-002'}},call={id:'old',matrixDay:slot.day,matrixSlot:1,status:'http-error',httpStatus:403,event:{sourceId:'old',amountMicros:null}};
 const state={calls:[call],matrixRuns:{days:{[slot.day]:{slots:[slot]}},outbox:[],providerBlocked:{status:403}}};
 const runner=new MatrixRunner({state,save:()=>{}});runner.authorizeProviderRecheck(slot.day);assert.equal(slot.phase,'planned');assert.equal(state.matrixRuns.providerBlocked,undefined);assert.equal(call.status,'http-error');assert.deepEqual(call.event,{sourceId:'old',amountMicros:null});
 state.matrixRuns.providerBlocked={status:403};assert.throws(()=>runner.authorizeProviderRecheck(slot.day),/already used/);
 call.status='transport-error';call.httpStatus=undefined;slot.providerRecheckUsed=false;assert.throws(()=>runner.authorizeProviderRecheck(slot.day),/permission/);
});
test('ambiguous Hosting release stops the next slot and next day without paid regeneration',async()=>{
 let now=new Date('2026-11-06T02:00:00Z'),attempts=0;const state={calls:[],batches:{}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>now,articles:()=>[],fetch:async url=>url.includes('/plan/')?{ok:true,json:async()=>plan()}:{ok:true,status:200}});
 runner.publish=async slot=>{attempts++;slot.deployAttemptAt=now.toISOString();throw Error('Hosting response lost');};
 assert.equal((await runner.main('publish')).failed,true);assert.equal(attempts,1);
 await assert.rejects(runner.main('publish'),/Ambiguous release/);now=new Date('2026-11-07T02:00:00Z');await assert.rejects(runner.main('publish'),/Unresolved earlier/);assert.equal(attempts,1);
});
test('Matrix report 403/409 reservations and an unflushed outbox block all paid work',async()=>{
 for(const status of [403,409])for(const queued of [false,true]){
  let paid=0;const state={calls:[],matrixRuns:{days:{},outbox:queued?[{url:plan().reportUrl,body:{runId:'old',status:'researching'}}]:[]}};
  const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',apiKey:'test',now:()=>new Date('2026-11-06T02:00:00Z'),articles:()=>[],fetch:async url=>{
   if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};if(url.includes('chat/completions'))paid++;return{ok:false,status};
  }});
  const result=await runner.main('publish');assert.equal(paid,0);assert.equal(result.reportPending,true);assert.equal(state.calls.length,0);assert.equal(state.matrixRuns.outbox.length,1);assert.equal(state.matrixRuns.reportFailure.requiresInspection,true);
 }
});
test('a 503 after research resumes its exact outbox and cached result without another research call',async()=>{
 const p=plan(),state={calls:[],batches:{}},paid={research:0,write:0,review:0},posts=[];let outage=true;
 const quote='A sufficiently long quotation from the opened original source.';
 const article={slug:'led-mask-guide',title:'LED红光面罩值得买吗？',summary:'建议先核对说明',takeaway:'建议先核对说明',sections:[{heading:'选购前的三个问题',paragraphs:['建议先核对具体产品的适用条件。'.repeat(40)+'[1]']}],tips:[],caution:'建议先核对说明'};
 const review={slug:article.slug,approved:true,decisionGain:'提供明确可执行的选购条件与核对顺序',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote}))};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',apiKey:'test',now:()=>new Date('2026-11-06T02:00:00Z'),articles:()=>[],run:()=>{},writeArticle:()=>{},markPublished:()=>{},commitContent:()=>{},fetch:async(url,options)=>{
  if(url.includes('/plan/'))return{ok:true,json:async()=>p};
  if(url.includes('chat/completions')){const body=JSON.parse(options.body),stage=body.enable_search?'research':body.messages[0].content.includes('Write only the exact')?'write':'review';paid[stage]++;const content=stage==='research'?{urls:[{url:'https://www.aad.org/one'},{url:'https://www.fda.gov/two'}]}:stage==='write'?article:review;return{ok:true,status:200,text:async()=>JSON.stringify({id:'provider-'+stage,usage:{prompt_tokens:100,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]})};}
  if(url.includes('/report/')){posts.push(options.body);const body=JSON.parse(options.body);return{ok:!(outage&&body.status==='writing'),status:outage&&body.status==='writing'?503:200};}
  if(url.includes('/search/'))p.daily.enabled=false;return{ok:true,status:200};
 }});
 runner.source=async ref=>({...ref,title:'Original',text:quote,checkedAt:runner.at(),textHash:ref.url,contentHash:ref.url});runner.verifyLive=async slot=>{slot.contentHashes={['https://beautychoicejournal.com/notes/'+slot.question.slug+'/']:'a'.repeat(64)};return true;};
 const first=await runner.main('publish');assert.equal(first.reportPending,true);assert.deepEqual(paid,{research:1,write:0,review:0});assert.equal(state.matrixRuns.days['2026-11-06'].slots[0].phase,'planned');const original=state.matrixRuns.outbox[0].body;outage=false;
 await runner.main('publish');assert.ok(posts.filter(text=>text===JSON.stringify(original)).length>=2);assert.deepEqual(paid,{research:1,write:1,review:1});assert.equal(state.matrixRuns.outbox.length,0);assert.equal(state.matrixRuns.days['2026-11-06'].slots[0].phase,'published');
});
test('article byte comparison protects owner edits that retain the same Matrix snapshot',()=>{
 const original='{"matrix":{"snapshotHash":"same"},"title":"Original"}',edited=original.replace('Original','Owner edit'),desired=original.replace('Original','Generated');
 assert.throws(()=>protectArticleWrite(edited,desired,hash(original)),/Concurrent/);assert.doesNotThrow(()=>protectArticleWrite(original,desired,hash(original)));assert.doesNotThrow(()=>protectArticleWrite(desired,desired,hash(original)));assert.throws(()=>protectArticleWrite(edited,desired,null));
});
test('transport ambiguity stops slot two and blocks the same question next day',async()=>{
 let now=new Date('2026-11-06T02:00:00Z'),paid=0;const state={calls:[],batches:{}};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',apiKey:'test',now:()=>now,articles:()=>[],fetch:async url=>{
  if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};if(url.includes('chat/completions')){paid++;throw Error('response lost');}return{ok:true,status:200};
 }});
 assert.equal((await runner.main('publish')).failed,true);assert.equal(paid,1);now=new Date('2026-11-07T02:00:00Z');await assert.rejects(runner.main('publish'),/ambiguous|inspection/i);assert.equal(paid,1);
});
test('audit does not claim an approved Matrix artifact was published without verified ledger proof',async()=>{
 const posted=[],article={slug:'led-mask-guide',publishedAt:'2026-11-06T01:07:00Z',publicationStatus:'published',reviewStatus:'approved',matrix:{questionId:'BCJ-002',snapshotHash:'snapshot'}};
 const state={calls:[],batches:{}};const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date('2026-11-06T02:00:00Z'),articles:()=>[article],fetch:async(url,options)=>{
  if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};posted.push(JSON.parse(options.body));return{ok:true,status:200};
 }});
 await runner.main('audit');assert.deepEqual(posted[0].publishedArticles,[]);assert.equal(posted[0].approvedArtifacts[0].slug,article.slug);
});
test('Matrix report errors retain bounded sanitized JSON detail and log a redacted pending failure',async()=>{
 const token='matrix-token-private',key='provider-key-private',state={calls:[],batches:{}},logs=[];
 const runner=new MatrixRunner({state,save:()=>{},token,apiKey:key,fetch:async()=>new Response(JSON.stringify({error:{code:'USAGE_CONFLICT',message:`Conflicting usage event; token ${token}; key ${key}`},payload:{secret:'full-report-must-not-appear'}}),{status:409,headers:{'content-type':'application/json'}})});runner.currentPlan=plan();
 const accepted=await runner.report({day:'2026-11-06',slot:1},'skipped');assert.equal(accepted,false);const original=JSON.stringify(state.matrixRuns.outbox);
 assert.match(state.matrixRuns.reportFailure.message,/409.*USAGE_CONFLICT.*Conflicting usage event/);assert.equal(state.matrixRuns.reportFailure.requiresInspection,true);
 assert.equal(runner.logResult({failed:true,reportPending:true},text=>logs.push(text)),true);assert.equal(logs.length,1);assert.match(logs[0],/Matrix report not confirmed.*409/);
 for(const text of[JSON.stringify(state.matrixRuns.reportFailure),...logs]){assert(!text.includes(token));assert(!text.includes(key));assert(!text.includes('full-report-must-not-appear'));}
 assert.equal(JSON.stringify(state.matrixRuns.outbox),original);
});
test('oversize or non-JSON Matrix error bodies are not printed',async()=>{
 const state={calls:[],batches:{}};const runner=new MatrixRunner({state,save:()=>{},fetch:async()=>new Response('x'.repeat(100000)+'secret-tail',{status:503})});runner.currentPlan=plan();
 await runner.report({day:'2026-11-06',slot:1},'skipped');assert.equal(state.matrixRuns.reportFailure.message,'Matrix report HTTP 503');assert.equal(state.matrixRuns.outbox.length,1);
});
test('legacy call ID is stable, explicitly local, and independent of derived event metadata',()=>{
 const call={startedAt:'2026-11-05T12:00:00Z',stage:'health',model:'qwen-plus',status:'returned',usage:{prompt_tokens:10,completion_tokens:1},cost:{modelEstimateCny:.00001}};
 const first=usageEvent(call);assert.match(first.sourceId,/^legacy-ledger:[a-f0-9]{64}$/);assert.match(first.note,/账本记录编号，供应商请求ID缺失/);
 call.event={old:'derived metadata'};assert.equal(usageEvent(call).sourceId,first.sourceId);assert.equal(usageEvent({...call,stage:'research'}).sourceId===first.sourceId,false);
 call.id='saved-uuid';assert.equal(usageEvent(call).sourceId,'saved-uuid');call.requestId='provider-id';assert.equal(usageEvent(call).sourceId,'provider-id');
});
test('legacy audit identity repair preserves amounts, dates and original calls without paid requests',async()=>{
 const call={id:'saved-uuid',startedAt:'2026-11-05T12:00:00Z',stage:'health',model:'qwen-plus',status:'returned',usage:null,cost:{modelEstimateCny:null}};
 const old={model:call.model,occurredAt:call.startedAt,activity:call.stage,amountMicros:null,amountKind:'unknown',inputTokens:null,outputTokens:null,currency:'CNY',status:'unknown',note:'Original note'};call.event={...old};
 const body={runId:'old-audit-0',activity:'audit',day:'2026-11-06',slot:1,at:'2026-11-06T01:00:00Z',status:'skipped',usageEvents:[{...old}]},state={calls:[call],matrixRuns:{days:{},outbox:[{url:plan().reportUrl,body}]}},sent=[];
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',articles:()=>[],fetch:async(url,options)=>{if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};assert(!url.includes('chat/completions'));sent.push(JSON.parse(options.body));return{ok:true,status:200};}});
 await runner.main('audit');assert.equal(sent[0].usageEvents[0].sourceId,'saved-uuid');assert.equal(sent[0].usageEvents[0].provider,'DashScope / Qwen');assert.equal(sent[0].usageEvents[0].keyAlias,'本站云端Key');for(const[key,value]of Object.entries(old))assert.deepEqual(sent[0].usageEvents[0][key],value);assert.equal(sent[0].at,body.at);assert.equal(call.id,'saved-uuid');assert.equal(call.startedAt,'2026-11-05T12:00:00Z');assert.equal(call.usage,null);
});
test('ambiguous legacy audit identity repair stops without mutating history or outbox',()=>{
 const event={model:'qwen-plus',occurredAt:'2026-11-05T12:00:00Z',activity:'health',amountMicros:null};const call={startedAt:event.occurredAt,model:event.model,stage:event.activity,event:{...event}};
 const state={calls:[{...call,id:'one'},{...call,id:'two'}],matrixRuns:{outbox:[{body:{activity:'audit',status:'skipped',usageEvents:[{...event}]}}]}};const original=JSON.stringify(state);
 assert.throws(()=>repairLegacyUsage(state),/candidates=2/);assert.equal(JSON.stringify(state),original);
});
test('retained audit missing ID receives only a labeled local identity with original monetary evidence intact',()=>{
 const call={startedAt:'2026-11-05T12:00:00Z',model:'qwen-plus',stage:'legacy-health',status:'returned',usage:null,cost:{modelEstimateCny:null}};
 const event={...usageEvent(call)};delete event.sourceId;event.note='Original receipt';call.event={...event};
 const state={calls:[call],matrixRuns:{outbox:[{body:{activity:'audit',status:'skipped',usageEvents:[{...event}]}}]}};const originalCall=JSON.stringify({...call,event:undefined});
 repairLegacyUsage(state);const repaired=state.matrixRuns.outbox[0].body.usageEvents[0];assert.equal(repaired.sourceId,usageEvent(call).sourceId);assert.match(repaired.note,/Original receipt；账本记录编号，供应商请求ID缺失/);assert.equal(repaired.amountMicros,null);assert.equal(repaired.occurredAt,event.occurredAt);assert.equal(JSON.stringify({...call,event:undefined}),originalCall);assert.equal(repairLegacyUsage(state),0);
});
test('historical usage uses verified original alternate timestamps with provenance and never defaults to now',()=>{
 const base={id:'saved-original',stage:'health',model:'qwen-plus',status:'returned'};
 for(const field of['at','completedAt']){const call={...base,[field]:'2026-11-05T12:34:56Z'},event=usageEvent(call);assert.equal(event.sourceId,base.id);assert.equal(event.occurredAt,call[field]);assert.match(event.note,new RegExp('原始账本 '+field));}
 assert.throws(()=>usageEvent(base),/timestamp|时间/i);assert.throws(()=>usageEvent({...base,at:'2026-11-05'}),/timestamp|时间/i);
 const call={...base,at:'2026-11-05T12:34:56Z',event:{provider:'DashScope / Qwen',sourceId:base.id,keyAlias:'本站云端Key',model:base.model,activity:base.stage,amountMicros:null,note:'Original'}};
 const state={calls:[call],matrixRuns:{outbox:[{body:{activity:'audit',status:'skipped',usageEvents:[{...call.event}]}}]}};repairLegacyUsage(state);const event=state.matrixRuns.outbox[0].body.usageEvents[0];assert.equal(event.occurredAt,call.at);assert.match(event.note,/原始账本 at/);assert.equal(event.amountMicros,null);assert.equal(event.sourceId,base.id);
});
test('undated legacy receipts are quarantined while dated audit events retain original dates and amounts',async()=>{
 const valid={id:'dated',startedAt:'2026-11-05T12:00:00Z',model:'qwen-plus',stage:'health',status:'returned',usage:{prompt_tokens:10,completion_tokens:1},cost:{modelEstimateCny:.00001}},legacy={id:'undated',model:'qwen-plus',stage:'old-diagnostic',status:'http-error',response:{error:'preserve original encrypted response'}};
 const badEvent={provider:'DashScope / Qwen',sourceId:legacy.id,keyAlias:'本站云端Key',model:legacy.model,activity:legacy.stage,amountMicros:null,currency:'CNY',amountKind:'unknown',status:'failed'};legacy.event={...badEvent};const validEvent=usageEvent(valid),originalLegacy=JSON.stringify(legacy);
 const job={url:plan().reportUrl,body:{runId:'old-audit-0',activity:'audit',day:'2026-11-06',slot:1,at:'2026-11-06T01:00:00Z',status:'skipped',usageEvents:[{...validEvent},{...badEvent}]}},state={calls:[valid,legacy],matrixRuns:{days:{},outbox:[job]}},sent=[];
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',now:()=>new Date('2026-11-06T02:00:00Z'),articles:()=>[],fetch:async(url,options)=>{if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};assert(!url.includes('chat/completions'));sent.push(JSON.parse(options.body));return{ok:true,status:200};}});
 await runner.main('audit');assert.deepEqual(sent[0].usageEvents,JSON.parse(JSON.stringify([validEvent])));assert.equal(sent[0].at,'2026-11-06T01:00:00Z');assert.match(sent.at(-1).reason,/历史账本1条时间缺失待核对，未计入今日费用/);assert.equal(JSON.stringify(legacy),originalLegacy);
 const quarantine=state.matrixRuns.quarantinedAuditEvents;assert.equal(quarantine.length,2);assert.deepEqual(quarantine.find(x=>x.kind==='call').originalCall,legacy);assert.deepEqual(quarantine.find(x=>x.kind==='audit-event').originalEvent,badEvent);assert.equal(quarantine.find(x=>x.kind==='audit-event').jobRunId,'old-audit-0');
 assert.equal(sent.flatMap(x=>x.usageEvents).some(x=>x.occurredAt?.startsWith('2026-11-06')),false);await runner.main('audit');assert.equal(quarantine.length,2);
});
test('undated Matrix paid rows remain strict and cannot enter legacy quarantine',async()=>{
 const call={id:'matrix-request',matrixDay:'2026-11-06',matrixSlot:1,articleId:'BCJ-002',model:'qwen-plus',stage:'research',status:'pending'},state={calls:[call],matrixRuns:{days:{},outbox:[]}},original=JSON.stringify(state);
 assert.throws(()=>repairLegacyUsage(state),/timestamp.*inspection/);assert.equal(JSON.stringify(state),original);
});
test('provider failures expose only a short ASCII code and never a raw message',async()=>{
 for(const code of['access_denied','unsafe code\nRAW_DONT_SHOW']){
  const state={calls:[],batches:{}},runner=new MatrixRunner({state,save:()=>{},apiKey:'private-key',fetch:async()=>({ok:false,status:403,text:async()=>JSON.stringify({error:{code,message:'RAW_DONT_SHOW private-key'}})})});
  await assert.rejects(runner.model('research',[],20,{day:'2026-11-06',slot:1,question:{id:'BCJ-002'}}),error=>{assert.match(error.message,/Qwen HTTP 403/);assert.equal(error.message.includes('access_denied'),code==='access_denied');assert(!error.message.includes('RAW_DONT_SHOW'));assert(!error.message.includes('private-key'));return true;});
 }
});

test('audit exposes sanitized provider explanation without another model request',async()=>{
 const secret='private-key-value',posted=[],state={calls:[{id:'failed-id',matrixDay:'2026-11-06',matrixSlot:1,stage:'research',model:'qwen-plus',startedAt:'2026-11-06T02:00:00Z',status:'http-error',httpStatus:403,response:{error:{message:'Model unavailable '+secret+' sk-'+ 'x'.repeat(28)}}}]};
 const runner=new MatrixRunner({state,save:()=>{},siteId:'beauty',token:'test',apiKey:secret,now:()=>new Date('2026-11-06T03:00:00Z'),articles:()=>[],fetch:async(url,options)=>{if(url.includes('/plan/'))return{ok:true,json:async()=>plan()};assert.ok(url.includes('/report/'));posted.push(JSON.parse(options.body));return{ok:true,status:200};}});
 await runner.main('audit');assert.match(posted[0].reason,/Model unavailable/);assert.ok(!posted[0].reason.includes(secret));assert.ok(!posted[0].reason.includes('x'.repeat(28)));assert.equal(posted.length,1);
});
