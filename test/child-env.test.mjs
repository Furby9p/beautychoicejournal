import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {childEnvironment} from '../scripts/child-env.mjs';
test('verification children drop all writer behavior and secrets while retaining Hosting workload identity',()=>{
 const env=childEnvironment({PATH:'existing-path',MATRIX_CONTENT_REVISION:'beauty-evidence-v5',MATRIX_RUNNER_TOKEN:'test-secret',DASHSCOPE_API_KEY:'test-secret',OPENROUTER_MODEL:'qwen/qwen3.7-plus',BCJ_LEDGER_KEY:'test-secret',GOOGLE_APPLICATION_CREDENTIALS:'/existing/oidc.json'});assert.deepEqual(env,{PATH:'existing-path',GOOGLE_APPLICATION_CREDENTIALS:'/existing/oidc.json'});
});
test('legacy and current-version fixture cases pass inside a production writer child environment',()=>{
 const env=childEnvironment({...process.env,MATRIX_CONTENT_REVISION:'beauty-evidence-v5',MATRIX_PROVIDER_REVISION:'geo-shared-openrouter-v1',OPENROUTER_MODEL:'qwen/qwen3.7-plus'});
 delete env.NODE_TEST_CONTEXT;
 const result=execFileSync(process.execPath,['--test','test/matrix-recovery.test.mjs','test/matrix-composition-scope.test.mjs'],{env,timeout:20000,encoding:'utf8',windowsHide:true});assert.match(result,/fail 0/);
});
