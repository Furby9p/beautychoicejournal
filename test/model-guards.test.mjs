import test from 'node:test';
import assert from 'node:assert/strict';
import {openRouterConfigured} from '../scripts/matrix-providers.mjs';

test('OpenRouter routing requires a key and exactly one of the two approved Qwen model IDs',()=>{
 for(const model of ['qwen/qwen-plus','qwen/qwen3.7-plus']){
  assert.equal(openRouterConfigured('configured-key',model),true);
  for(const key of ['',undefined,null])assert.equal(openRouterConfigured(key,model),false);
 }
 for(const model of [undefined,null,'','qwen/qwen-max','qwen/qwen3.7-max','qwen/qwen3.7-plus:free','qwen/qwen3.7-plus-latest','qwen/qwen3.7-plus\n','Qwen/qwen3.7-plus','openai/gpt-4o']){
  assert.equal(openRouterConfigured('configured-key',model),false,String(model));
 }
});
