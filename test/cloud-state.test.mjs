import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {seal,unseal,estimateCost} from '../scripts/cloud-state.mjs';
test('encrypted cost history round-trips and rejects tampering',()=>{const key=randomBytes(32);const data={calls:[{inputTokens:100,costCny:.0012}]};const encoded=seal(data,key);assert(!encoded.includes('inputTokens'));assert.deepEqual(unseal(encoded,key),data);assert.throws(()=>unseal(encoded,randomBytes(32)));});
test('fees use actual token usage and preserve unknown values',()=>{assert.equal(estimateCost({prompt_tokens:1000000,completion_tokens:1000000,prompt_tokens_details:{cached_tokens:100000}}).modelEstimateCny,46.95);assert.equal(estimateCost(null).modelEstimateCny,null);});
