import test from 'node:test';
import assert from 'node:assert/strict';
import {MatrixRunner,validateReview} from '../scripts/matrix-runner.mjs';

const quote='This is a literal original source instruction with a verifiable scope.';
const slot=()=>({day:'2026-11-07',slot:1,question:{id:'BCJ-002',slug:'led-mask-guide',question:'怎样核对美容仪？'},sources:[1,2].map(id=>({url:`https://www.fda.gov/${id}`,title:'Original',text:quote})),factPack:{facts:[1,2,1,2].map(sourceId=>({sourceId,quote,claim:'Unverified translation excluded',scope:'Only the named model'}))},article:{slug:'led-mask-guide',title:'怎样核对美容仪？',summary:'建议核对',takeaway:'建议先核对',sections:[{heading:'核对清单',paragraphs:['具体说明[1]']}],tips:[],caution:'建议先核对'}});
function setup(response){const state={calls:[],matrixRuns:{days:{},outbox:[],providerBlocked:{status:403}}},requests=[];const runner=new MatrixRunner({state,save:()=>{},contentRevision:'beauty-evidence-v4',openRouterKey:'existing-site-key',openRouterModel:'qwen/qwen3.7-plus',now:()=>new Date('2026-11-07T01:07:00Z'),fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify(response));}});runner.acceptedReport=async()=>{};return{runner,state,requests};}
test('fresh daily reviews use reasoned stage identity, literal evidence and enough total output space',async()=>{
 const {runner,state,requests}=setup({usage:{cost:.003},choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:false,issues:['unsupported scope']})}}]});
 const result=await runner.reviewArticle(slot(),'Keep factual gates','review-grounded');
 assert.equal(result.approved,false);assert.equal(state.calls[0].stage,'review-grounded-reasoned');assert.equal(requests[0].max_tokens,16000);assert.deepEqual(requests[0].reasoning,{enabled:true,exclude:true});assert(!JSON.stringify(requests[0].messages).includes('Unverified translation excluded'));assert(requests[0].messages[1].content.includes('verifiedQuotations'));assert.equal(state.calls[0].cost.actualUsd,.003);
 await runner.reviewArticle(slot(),'Keep factual gates','review-grounded');assert.equal(requests.length,1);
});
test('reasoning output exhaustion retains real usage and cannot be blindly retried or published',async()=>{
 const {runner,state,requests}=setup({usage:{cost:.01,completion_tokens:16000,completion_tokens_details:{reasoning_tokens:16000}},choices:[{finish_reason:'length',message:{content:''}}]});
 await assert.rejects(runner.reviewArticle(slot(),'Keep factual gates','review-grounded'));assert.equal(state.calls[0].cost.actualUsd,.01);assert.equal(state.calls[0].response.choices[0].finish_reason,'length');await assert.rejects(runner.reviewArticle(slot(),'Keep factual gates','review-grounded'),/ambiguous|inspection/i);assert.equal(requests.length,1);
});
test('reasoned approval still requires every field, matching quotations and adjacent citations',()=>{
 const s=slot(),review={slug:s.article.slug,approved:true,decisionGain:'给出实际核查路径和适用条件',issues:[],checks:['title','summary','takeaway','sections.0.heading','sections.0.paragraphs.0','caution'].map(target=>({target,kind:target==='sections.0.paragraphs.0'?'supported':'editorial',sourceId:1,quote}))};
 assert.doesNotThrow(()=>validateReview(s.article,review,s.sources));review.checks.pop();assert.throws(()=>validateReview(s.article,review,s.sources),/Unreviewed/);review.checks.push({target:'caution',kind:'supported',sourceId:1,quote:'A fabricated nonmatching quotation sufficiently long'});assert.throws(()=>validateReview(s.article,review,s.sources),/quote/);
});
