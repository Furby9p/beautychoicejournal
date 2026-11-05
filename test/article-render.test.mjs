import test from 'node:test';import assert from 'node:assert/strict';
import {renderTable,renderCitations} from '../scripts/article-render.mjs';
test('comparison retains source links and escapes source-provided text',()=>{
 const html=renderTable({caption:'需求与判断',columns:['需求','判断'],rows:[['<script>alert(1)</script>','核对说明[1]']]},2);
 assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('href="#source-1"'));assert(html.includes('scope="col"'));assert(html.includes('<caption>需求与判断</caption>'));
 assert.throws(()=>renderTable({columns:['a','b'],rows:[['missing']]},2),/列数/);
 assert.equal(renderCitations('不合法编号[9]',2),'不合法编号[9]');
});
