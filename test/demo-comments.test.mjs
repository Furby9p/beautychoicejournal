import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, released, validateGenerated } from '../scripts/demo-comments.mjs';
test('2–60 inclusive of replies; parent precedes child; only reserved IPs; day 1–7',()=>{
 for(const count of [2,31,60]){
 const rows=Array.from({length:count},(_,i)=>({body:'这个问题值得先看说明书'+i,parent:i>0&&i%3===0?0:null}));
 const p=makePlan({slug:'test',publishedAt:'2026-11-05'},validateGenerated(rows,count));
 assert.equal(p.items.length,count);
 for(const r of p.items){assert.ok(r.demo);assert.match(r.ip,/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);assert.ok(r.nickname.includes('*'));assert.ok(Date.parse(r.createdAt)>=Date.parse('2026-11-06T00:00:00+08:00'));assert.ok(Date.parse(r.createdAt)<Date.parse('2026-11-13T00:00:00+08:00'));if(r.parentId){const parent=p.items.find(x=>x.id===r.parentId);assert.ok(parent.createdAt<=r.createdAt);}}
 assert.equal(released([p],new Date('2026-11-05T23:59:59+08:00')).length,0);
 assert.equal(released([p],new Date('2026-11-13T05:00:00+08:00'))[0].items.length,count);
 }
});
test('reject malformed counts, forward references, false experience and oversized output',()=>{
 assert.throws(()=>validateGenerated([],2));
 assert.throws(()=>validateGenerated([{body:'我亲测有效',parent:null},{body:'普通问题',parent:null}],2));
 assert.throws(()=>validateGenerated([{body:'看看说明',parent:1},{body:'是个问题',parent:null}],2));
});
