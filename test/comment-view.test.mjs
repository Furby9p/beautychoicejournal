import test from 'node:test';import assert from 'node:assert/strict';
import{renderThread}from'../ui/comment-view.js';
test('compact comment layout, nested parent label and expandable replies are shared by preview and live',()=>{
 const items=[{id:'a',nickname:'柚*',body:'选择问题<script>',createdAt:'2026-11-02T01:00:00Z',region:'广东'},...Array.from({length:3},(_,i)=>({id:'b'+i,parentId:'a',nickname:'月*',body:'回应'+i,createdAt:'2026-11-03T01:00:00Z'}))];const html=renderThread(items);
 assert.ok(html.includes('comment-content'));assert.ok(html.includes('comment-like'));assert.ok(html.includes('回复 柚*'));assert.ok(html.includes('展开 2 条回复'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('aria-pressed="false"'));
});
