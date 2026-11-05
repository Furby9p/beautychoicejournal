import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('four current notes each have 20 isolated development entries including valid replies',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../content/development/comment-samples.json',import.meta.url)));
 assert.equal(data.environment,'development');assert.equal(data.qwenRequestId,null);assert.equal(data.notes.length,4);
 for(const n of data.notes){assert.equal(n.items.length,20);assert.ok(n.items.some(x=>x.parentId));const ids=new Set(n.items.map(x=>x.id));assert.equal(ids.size,20);for(const x of n.items){assert.equal(x.demo,true);assert.equal(x.fixture,true);assert.ok(Date.parse(x.createdAt)<=Date.now());assert.match(x.ip,/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);if(x.parentId){assert.ok(ids.has(x.parentId));const parent=n.items.find(r=>r.id===x.parentId);assert.equal(parent.parentId,null);assert.ok(Date.parse(parent.createdAt)<=Date.parse(x.createdAt));}}}
});
