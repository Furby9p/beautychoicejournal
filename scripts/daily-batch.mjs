import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {validateArticle,escapeHtml} from './content.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function chooseBatch(items,batches,today){
 if(Object.values(batches).some(b=>b.state==='complete'&&b.completedOn===today))return null;
 const pending=Object.values(batches).find(b=>b.state!=='complete');if(pending)return pending;
 const chosen=items.filter(q=>q.status==='planned').slice(0,2);if(chosen.length!==2)throw Error('Need two planned topics; question bank exhausted');
 return{date:today,state:'planned',ids:chosen.map(q=>q.id),slugs:chosen.map(q=>q.slug)};
}
const hash=x=>createHash('sha256').update(x).digest('hex');
async function main(){
 const action=process.argv[2]||'plan',today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const file=path.join(root,'private/daily-batches.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const lock=path.join(root,'private/daily-batch.lock');const fd=fs.openSync(lock,'wx');
 try{
 const batches=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const bankFile=path.join(root,'content/question-bank.json'),bank=JSON.parse(fs.readFileSync(bankFile,'utf8'));
 const batch=chooseBatch(bank.items,batches,today);if(!batch){console.log(JSON.stringify({today,state:'already-complete'}));return;}
 const folder=path.join(root,'private/daily',batch.date);fs.mkdirSync(folder,{recursive:true});
 const save=()=>{batches[batch.date]=batch;fs.writeFileSync(file+'.tmp',JSON.stringify(batches,null,2));fs.renameSync(file+'.tmp',file);};
 if(action==='plan'){save();console.log(JSON.stringify({...batch,folder,questions:bank.items.filter(q=>batch.slugs.includes(q.slug))},null,2));return;}
 const articles=batch.slugs.map(slug=>{const a=validateArticle(JSON.parse(fs.readFileSync(path.join(root,'content/articles',slug+'.json'),'utf8')));if(a.slug!==slug)throw Error('Article filename/slug mismatch');return a;});
 const checkApprovedHashes=()=>{if(batch.state==='approved'&&!batch.slugs.every(slug=>batch.articleHashes?.[slug]===hash(fs.readFileSync(path.join(root,'content/articles',slug+'.json')))))throw Error('Approved content changed; review both articles again before release');};
 checkApprovedHashes();
 for(const a of articles){if(!batch.slugs.includes(a.slug))throw Error('Article/slug mismatch');for(const s of a.sections){for(const p of s.paragraphs)for(const m of p.matchAll(/\[(\d+)\]/g))if(Number(m[1])<1||Number(m[1])>a.sources.length)throw Error('Broken citation');}if(!a.sources.every(s=>s.checkedAt))throw Error('Unchecked source');if(/千问|qwen|AI辅助|AI 辅助|模型生成|非亲测|我亲测/i.test(JSON.stringify({title:a.title,summary:a.summary,sections:a.sections,tips:a.tips})))throw Error('Public production or fabricated experience label');}
 if(action==='check'){console.log(JSON.stringify({date:batch.date,slugs:batch.slugs,structuralChecks:'passed',requiresFactualReview:true}));return;}
 if(action==='approve'){
 if(batch.state==='approved'){console.log(JSON.stringify(batch));return;}
 const review=JSON.parse(fs.readFileSync(path.join(folder,'review.json'),'utf8'));
 if(!review.approved||review.entries?.length!==2||!batch.slugs.every(slug=>review.entries.some(e=>e.slug===slug&&e.sourceClaimsChecked===true&&e.actionableGainChecked===true&&e.marketScopeChecked===true&&typeof e.notes==='string'&&e.notes.length>=30)))throw Error('Both factual reviews required');
 for(const a of articles){a.publicationStatus='published';a.reviewStatus='approved';a.publishedAt=today;fs.writeFileSync(path.join(root,'content/articles',a.slug+'.json'),JSON.stringify(a,null,2));}
 batch.articleHashes=Object.fromEntries(batch.slugs.map(slug=>[slug,hash(fs.readFileSync(path.join(root,'content/articles',slug+'.json')))]));batch.state='approved';batch.approvedAt=new Date().toISOString();save();console.log(JSON.stringify(batch));return;
 }
 if(action==='complete'){
 if(batch.state!=='approved')throw Error('Batch not approved');
 for(const a of articles){const url='https://beautychoicejournal.com/notes/'+a.slug+'/';const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const html=await r.text();const local=fs.readFileSync(path.join(root,'dist/notes',a.slug,'index.html'));if(r.status!==200||hash(html)!==hash(local)||!html.includes(escapeHtml(a.title)))throw Error('Live page mismatch: '+url);}
 batch.state='complete';batch.completedOn=today;batch.completedAt=new Date().toISOString();for(const q of bank.items)if(batch.slugs.includes(q.slug))q.status='published';fs.writeFileSync(bankFile,JSON.stringify(bank,null,2));save();console.log(JSON.stringify(batch));return;
 }
 throw Error('Use plan, check, approve, or complete');
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
