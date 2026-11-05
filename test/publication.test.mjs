import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPublished} from '../scripts/publication.mjs';
test('public release includes only explicitly approved published articles',()=>{
 const articles=[{slug:'approved',publicationStatus:'published',reviewStatus:'approved'},{slug:'review',publicationStatus:'draft',reviewStatus:'pending_user_review'},{slug:'missing-status'}];
 assert.deepEqual(selectPublished(articles).map(a=>a.slug),['approved']);
});
