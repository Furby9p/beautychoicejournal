import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArticle,escapeHtml,safeSource,decodePage} from '../scripts/content.mjs';
test('Chinese source pages preserve GBK text',()=>{assert.equal(decodePage(Uint8Array.from([0xc3,0xc0,0xc8,0xdd]),'text/html; charset=gbk'),'美容');});
test('unverified or single-source article cannot publish',()=>{
 assert.throws(()=>validateArticle({title:'测试',sections:[],sources:[]}),/正文|来源/);
 assert.throws(()=>validateArticle({title:'测试',sections:[{heading:'步骤',paragraphs:['内容'.repeat(300)]}],sources:[{url:'https://example.com/a',title:'一'}],provider:'dashscope',model:'qwen-flash'}),/来源/);
});
test('HTML and unsafe reference links cannot execute',()=>{
 assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 for(const u of ['javascript:alert(1)','http://127.0.0.1','https://user:pass@example.com','https://localhost/a'])assert.equal(safeSource(u),false);
 assert.equal(safeSource('https://www.aad.org/public'),true);
});
test('article provenance permits only the approved OpenRouter Qwen Plus pair',()=>{
 const article={title:'建议先核对',sections:[{heading:'步骤',paragraphs:['建议先核对具体说明。'.repeat(100)]}],sources:[{url:'https://www.aad.org/a',title:'AAD'},{url:'https://www.fda.gov/b',title:'FDA'}],provider:'openrouter',model:'qwen/qwen-plus'};
 assert.equal(validateArticle(article),article);
 for(const patch of[{model:'qwen/qwen-max'},{model:'other/model'},{provider:'unknown'}])assert.throws(()=>validateArticle({...article,...patch}));
});
