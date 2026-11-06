import test from 'node:test';
import assert from 'node:assert/strict';
import {MatrixRunner,usageEvent} from '../scripts/matrix-runner.mjs';

const slot=()=>({day:'2026-11-06',slot:1,question:{id:'BCJ-002'},phase:'planned'});
const completion=(id='ok')=>({id,usage:{prompt_tokens:100,completion_tokens:20,cost:.0012},choices:[{finish_reason:'stop',message:{content:'{"answer":"ok"}',annotations:[{type:'url_citation',url_citation:{url:'https://www.fda.gov/test',title:'FDA'}}]}}]});
function setup(fetch,options={}){
 const state={calls:[],matrixRuns:{days:{},outbox:[]}};
 const runner=new MatrixRunner({state,save:()=>{},apiKey:'shared',openRouterKey:'fallback',openRouterModel:'qwen/qwen-plus',providerRevision:'geo-shared-openrouter-v1',now:()=>new Date('2026-11-06T02:00:00Z'),fetch,...options});
 runner.currentPlan={reportUrl:'https://matrix.example/api/runner/report/test'};
 return{runner,state};
}
test('known primary 403 reports before OpenRouter fallback and retains actual USD cost plus source annotations',async()=>{
 const order=[],{runner,state}=setup(async(url,options)=>{
  if(url.includes('matrix.example')){order.push('report');return{ok:true,status:200};}
  const body=JSON.parse(options.body);order.push(url.includes('openrouter.ai')?'openrouter':'dashscope');
  if(!url.includes('openrouter.ai'))return new Response(JSON.stringify({error:{code:'access_denied'}}),{status:403});
  assert.equal(body.model,'qwen/qwen-plus');assert.equal(body.max_tokens,2000);assert.deepEqual(body.plugins,[{id:'web',engine:'exa',max_results:6}]);assert.deepEqual(body.provider,{require_parameters:true});assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.models,undefined);
  return new Response(JSON.stringify(completion()));
 });
 const s=slot(),result=await runner.model('research',[],2000,s,true);assert.deepEqual(order,['dashscope','report','openrouter']);assert.equal(state.calls.length,2);assert.equal(state.matrixRuns.providerBlocked.status,403);assert.equal(state.calls[0].status,'http-error');assert.equal(state.calls[1].provider,'openrouter');assert.equal(state.calls[1].cost.actualUsd,.0012);assert.equal(state.calls[1].event.currency,'USD');assert.equal(state.calls[1].event.amountKind,'actual');assert.equal(state.calls[1].event.amountMicros,1200);assert.equal(result.search_info.search_results[0].url,'https://www.fda.gov/test');assert.equal(state.calls[1].response.choices[0].message.annotations.length,1);
 await runner.model('research',[],2000,s,true);assert.equal(state.calls.length,2);assert.equal(order.length,3);
});
test('OpenRouter converted CNY retains original USD and dated rate and missing cost stays unknown',()=>{
 const call={id:'or',provider:'openrouter',keyAlias:'GEO通用OpenRouter Key',model:'qwen/qwen-plus',stage:'write',status:'returned',startedAt:'2026-11-06T02:00:00Z',usage:{cost:.0012},cost:{actualUsd:.0012,modelEstimateCny:.0084,fxRate:{rate:7,date:'2026-11-06',source:'https://fx.example/2026-11-06'}}};
 const event=usageEvent(call);assert.equal(event.provider,'OpenRouter');assert.equal(event.keyAlias,call.keyAlias);assert.equal(event.amountMicros,8400);assert.equal(event.amountKind,'estimated');assert.equal(event.currency,'CNY');assert.match(event.note,/USD.*0\.0012.*7.*2026-11-06.*fx.example/);
 delete call.cost;delete call.usage.cost;assert.equal(usageEvent(call).amountMicros,null);assert.equal(usageEvent(call).amountKind,'unknown');
});
test('ambiguous transport, malformed success and truncated completion never purchase fallback',async()=>{
 for(const response of[()=>{throw Error('timeout');},()=>new Response('not-json'),()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]})),()=>new Response(JSON.stringify(completion()),{status:503})]){
  let paid=0;const{runner,state}=setup(async()=>{paid++;return response();});await assert.rejects(runner.model('write',[],100,slot()));await assert.rejects(runner.model('write',[],100,slot()),/inspection|incomplete/i);assert.equal(paid,1);assert.equal(state.calls.length,1);
 }
});
test('fallback requires configured cheap model and accepted report; no second route after report rejection',async()=>{
 for(const options of[{openRouterKey:''},{openRouterModel:''},{openRouterModel:'qwen/qwen-max'}]){
  let paid=0;const{runner,state}=setup(async()=>{paid++;return new Response('{}',{status:403});},options);await assert.rejects(runner.model('write',[],100,slot()));assert.equal(paid,1);assert.equal(state.calls.length,1);
 }
 let paid=0;const{runner,state}=setup(async url=>{if(url.includes('matrix.example'))return new Response('{}',{status:503});paid++;return new Response('{}',{status:403});});await assert.rejects(runner.model('write',[],100,slot()),/report/i);assert.equal(paid,1);assert.equal(state.matrixRuns.outbox.length,1);
});
test('bounded route attempts and six-call article ceiling prevent repeated paid retries',async()=>{
 const{runner,state}=setup(async url=>url.includes('matrix.example')?new Response('{}'):new Response('{}',{status:429}));const s=slot();await assert.rejects(runner.model('research',[],100,s));assert.equal(state.calls.length,2);await assert.rejects(runner.model('research',[],100,s));assert.equal(state.calls.length,2);
 for(const stage of['write','review'])await assert.rejects(runner.model(stage,[],100,s));assert.equal(state.calls.length,6);await assert.rejects(runner.model('extra',[],100,s),/limit/);assert.equal(state.calls.length,6);
});
test('one-time revision reopens only known rejected pilot slots and preserves original ledger and errors',()=>{
 const first={...slot(),runId:'old-run-1',phase:'failed',sources:[{url:'https://www.fda.gov/cached',text:'Opened source cache'}],failure:'research failed: Qwen HTTP 403 (access_denied); no model fallback'},second={...slot(),slot:2,runId:'old-run-2',question:{id:'BCJ-003'},phase:'skipped',failure:'qwen-plus permission blocked; no fallback'};
 const old={id:'old',matrixDay:first.day,matrixSlot:1,articleId:first.question.id,stage:'research',status:'http-error',httpStatus:403,startedAt:'2026-11-06T01:07:00Z',response:{error:{code:'access_denied'}},event:{sourceId:'old',amountMicros:null}},original=JSON.stringify(old);
 const state={calls:[old],matrixRuns:{days:{[first.day]:{slots:[first,second]}},outbox:[],providerBlocked:{status:403}}};const{runner}=setup(async()=>{}, {state,runId:'new-run'}),cache=JSON.stringify(first.sources),identity=[first.day,first.slot,first.question.id,second.day,second.slot,second.question.id];
 assert.equal(runner.migrateProviderRevision(first.day),true);assert.equal(first.phase,'planned');assert.equal(second.phase,'planned');assert.equal(first.providerMigration.previousFailure.includes('403'),true);assert.equal(JSON.stringify(old),original);assert.equal(state.matrixRuns.providerBlocked.status,403);first.phase='failed';first.failure='quality rejected';assert.equal(runner.migrateProviderRevision(first.day),false);assert.equal(first.phase,'failed');assert.equal(first.failure,'quality rejected');
 assert.equal(first.runId,'new-run-1');assert.equal(second.runId,'new-run-2');assert.equal(first.providerMigration.previousRunId,'old-run-1');assert.equal(second.providerMigration.previousRunId,'old-run-2');assert.equal(JSON.stringify(first.sources),cache);assert.deepEqual([first.day,first.slot,first.question.id,second.day,second.slot,second.question.id],identity);
});
test('new OpenRouter receipts identify the dedicated GEO-account Beauty backup while historical aliases stay untouched',async()=>{
 const old={id:'legacy-or',provider:'openrouter',keyAlias:'GEO通用OpenRouter Key',model:'qwen/qwen-plus',stage:'write',status:'returned',startedAt:'2026-11-05T02:00:00Z',usage:{cost:.001},cost:{actualUsd:.001},response:completion()},event=usageEvent(old);old.event=event;
 const{runner,state}=setup(async url=>url.includes('matrix.example')?new Response('{}'):url.includes('openrouter.ai')?new Response(JSON.stringify(completion())):new Response('{}',{status:403}));state.calls.push(old);const before=JSON.stringify(old);await runner.model('write',[],100,slot());assert.equal(state.calls.at(-1).event.keyAlias,'Matrix美容站OpenRouter备用Key (GEO账户)');assert.equal(JSON.stringify(old),before);assert.equal(old.event.keyAlias,'GEO通用OpenRouter Key');
});
test('route migration does not reopen quality failures, published slots or ambiguous requests',()=>{
 for(const variant of['quality','published','ambiguous']){
  const s={...slot(),phase:'failed',failure:'research failed: Qwen HTTP 403 (access_denied)'};
  const call={id:'old',matrixDay:s.day,matrixSlot:1,articleId:s.question.id,stage:'research',status:'http-error',httpStatus:403,startedAt:'2026-11-06T01:07:00Z',response:{error:{code:'access_denied'}}};
  if(variant==='quality')s.failure='Factual review rejected article';if(variant==='published')s.publishedAt='2026-11-06T02:00:00Z';if(variant==='ambiguous')call.status='transport-error';
  const state={calls:[call],matrixRuns:{days:{[s.day]:{slots:[s]}},outbox:[],providerBlocked:{status:403}}},{runner}=setup(async()=>{}, {state});const before=JSON.stringify(state);assert.equal(runner.migrateProviderRevision(s.day),false);assert.equal(JSON.stringify(state),before);
 }
});
test('successful historical stage survives an endpoint and key migration without another paid call',async()=>{
 const {runner,state}=setup(async()=>{throw Error('paid retry forbidden');});const s=slot();
 const endpoint='https://legacy.maas.aliyuncs.com/compatible-mode/v1/chat/completions',body={model:'qwen-plus',messages:[],enable_thinking:false,max_tokens:100,temperature:.2,response_format:{type:'json_object'}};
 const {hash}=await import('../scripts/matrix-runner.mjs');state.calls.push({matrixDay:s.day,matrixSlot:1,stage:'write',status:'returned',endpoint,inputHash:hash(JSON.stringify({endpoint,body})),response:completion()});
 assert.equal((await runner.model('write',[],100,s)).id,'ok');assert.equal(state.calls.length,1);
});
test('later stages skip a rejected primary and preserve converted OpenRouter receipt',async()=>{
 const providers=[],{runner,state}=setup(async(url)=>{if(url.includes('matrix.example'))return new Response('{}');providers.push(url);return url.includes('openrouter.ai')?new Response(JSON.stringify(completion())):new Response('{}',{status:403});},{fxRate:{rate:7,date:'2026-11-06',source:'https://fx.example'}});
 const s=slot();await runner.model('research',[],100,s,true);await runner.model('write',[],100,s);assert.equal(providers.filter(u=>!u.includes('openrouter.ai')).length,1);assert.equal(state.calls.at(-1).event.currency,'CNY');assert.equal(state.calls.at(-1).event.amountMicros,8400);assert.equal(state.calls.at(-1).cost.actualUsd,.0012);
});
test('complete fallback preparation records actual writer provenance and keeps every paid stage reported',async()=>{
 const quote='A sufficiently long quotation from an independently opened original source.',article={slug:'led-mask-guide',title:'LED红光面罩值得买吗？',summary:'建议先核对说明',takeaway:'建议先核对说明',sections:[{heading:'频次与禁忌',paragraphs:['建议先核对具体产品的适用条件。'.repeat(40)+'[1]']}],tips:[],caution:'建议先核对说明'};
 const review={slug:article.slug,approved:true,decisionGain:'提供明确可执行的选购条件与核对顺序',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote}))};
 const order=[],{runner,state}=setup(async(url,options)=>{
  if(url.includes('matrix.example')){order.push('report:'+JSON.parse(options.body).status);return new Response('{}');}
  if(!url.includes('openrouter.ai')){order.push('primary');return new Response('{}',{status:403});}
  const body=JSON.parse(options.body),stage=body.plugins?'research':body.messages[0].content.includes('Write only the exact')?'write':'review';order.push('paid:'+stage);
  const content=stage==='research'?{urls:[{url:'https://www.aad.org/one'},{url:'https://www.fda.gov/two'}]}:stage==='write'?article:review,result=completion('or-'+stage);result.choices[0].message.content=JSON.stringify(content);return new Response(JSON.stringify(result));
 });runner.source=async ref=>({...ref,title:'Original',text:quote,checkedAt:runner.at(),contentHash:ref.url,textHash:ref.url});
 const s={...slot(),question:{id:'BCJ-002',slug:'led-mask-guide',question:'LED?',category:'美容仪'}};
 await runner.prepare(s,{writing:{instructions:[{id:'beauty',name:'Beauty',version:'1',instructions:'Use original sources'}]}});assert.equal(s.phase,'approved');assert.equal(s.article.provider,'openrouter');assert.equal(s.article.model,'qwen/qwen-plus');assert.equal(state.calls.length,4);assert.equal(order.filter(x=>x==='primary').length,1);
 for(const name of['research','write','review'])assert.match(order[order.indexOf('paid:'+name)-1],/^report:/);
 const before=JSON.stringify(state.calls);await runner.prepare(s,{writing:{instructions:[{instructions:'Use original sources'}]}});assert.equal(JSON.stringify(state.calls),before);
});
test('pilot migration spaces article two from the first new fallback start and preserves original start',async()=>{
 let clock=new Date('2026-11-06T02:00:00Z');const first={...slot(),startedAt:'2026-11-06T01:00:00Z',phase:'failed',failure:'research failed: Qwen HTTP 403'},second={...slot(),slot:2,question:{id:'BCJ-003'},phase:'skipped',failure:'qwen-plus permission blocked; no fallback'},old={id:'old',matrixDay:first.day,matrixSlot:1,articleId:first.question.id,stage:'research',status:'http-error',httpStatus:403,startedAt:first.startedAt,response:{error:{code:'access_denied'}}};
 const state={calls:[old],matrixRuns:{days:{[first.day]:{snapshot:{writing:{}},slots:[first,second]}},outbox:[],providerBlocked:{status:403}}},plan={site:{id:'beauty',domain:'beautychoicejournal.com'},daily:{enabled:true,quota:2,publishMode:'auto',timezone:'Asia/Shanghai',time:'09:00'},writing:{ready:true},reportUrl:'https://matrix.example/api/runner/report/beauty',searchUrl:'https://matrix.example/api/runner/search/beauty'};
 const{runner}=setup(async url=>url.includes('/plan/')?{ok:true,json:async()=>plan}:url.includes('openrouter.ai')?new Response(JSON.stringify(completion())):new Response('{}'),{state,origin:'https://matrix.example',siteId:'beauty',token:'test',now:()=>clock,sleep:async ms=>{clock=new Date(clock.getTime()+ms);}});
 runner.publish=async s=>{await runner.model('write',[],100,s);s.phase='published';s.publishedAt=clock.toISOString();};await runner.main('publish');const fresh=state.calls.filter(c=>c.provider==='openrouter');assert.equal(fresh.length,2);assert.equal(Date.parse(fresh[1].startedAt)-Date.parse(fresh[0].startedAt),600000);assert.equal(first.startedAt,'2026-11-06T01:00:00Z');
});


