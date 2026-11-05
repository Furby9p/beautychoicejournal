import test from 'node:test';import assert from 'node:assert/strict';import {commentEndpoint} from '../scripts/qwen-config.mjs';
test('use configured GEO endpoint and reject credentials or non-provider hosts',()=>{
 assert.equal(commentEndpoint('https://example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/'),'https://example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.throws(()=>commentEndpoint('https://evil.example/compatible-mode/v1'));assert.throws(()=>commentEndpoint('https://user:password@dashscope.aliyuncs.com/compatible-mode/v1'));assert.throws(()=>commentEndpoint('http://dashscope.aliyuncs.com/compatible-mode/v1'));
});
