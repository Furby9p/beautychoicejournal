import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadState,persist} from './cloud-state.mjs';
import {MatrixRunner,hash,protectArticleWrite} from './matrix-runner.mjs';
import {loadReferenceFx} from './matrix-fx.mjs';

const store=loadState();
function command(program,args){
 const env={...process.env};for(const key of ['DASHSCOPE_API_KEY','DASHSCOPE_BASE_URL','OPENROUTER_API_KEY','BCJ_LEDGER_KEY','MATRIX_RUNNER_TOKEN'])delete env[key];
 execFileSync(program,args,{stdio:'inherit',env});
}
const bankFile='content/question-bank.json';
const fxRate=await loadReferenceFx({state:store.state,save:()=>persist(store)});
const runner=new MatrixRunner({state:store.state,fxRate,save:()=>persist(store),run:command,recheckProvider:process.env.MATRIX_RECHECK_PROVIDER==='true',
 articles:()=>fs.readdirSync('content/articles').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync('content/articles/'+f,'utf8'))),
 metadata:q=>JSON.parse(fs.readFileSync('content/topics.json','utf8')).find(a=>a.slug===q.slug),
 articleHash:slug=>fs.existsSync('content/articles/'+slug+'.json')?hash(fs.readFileSync('content/articles/'+slug+'.json')):null,
 writeArticle:(article,slot)=>{
  const file='content/articles/'+article.slug+'.json';
  const current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,desired=JSON.stringify(article,null,2)+'\n';
  protectArticleWrite(current,desired,slot.originalArticleHash);
  if(fs.existsSync(file)){
   const old=JSON.parse(fs.readFileSync(file,'utf8'));
   if(old.matrix?.snapshotHash!==article.matrix.snapshotHash)throw Error('Existing article or concurrent editorial changes protected');
  }
  const bank=JSON.parse(fs.readFileSync(bankFile,'utf8'));
  if(!bank.items.some(q=>q.id===article.matrix.questionId&&q.slug===article.slug))throw Error('Matrix question does not match original site question ID/slug');
  fs.writeFileSync(file,desired);
 },
 markPublished:question=>{
  const bank=JSON.parse(fs.readFileSync(bankFile,'utf8'));const q=bank.items.find(q=>q.id===question.id&&q.slug===question.slug);if(!q)throw Error('Original question metadata missing');q.status='published';fs.writeFileSync(bankFile,JSON.stringify(bank,null,2)+'\n');
 },
 commitContent:slot=>{
  if(process.env.GITHUB_ACTIONS!=='true')return;
  execFileSync('git',['add','content/articles/'+slot.question.slug+'.json',bankFile,'firestore.rules'],{stdio:'ignore'});
  if(!execFileSync('git',['diff','--cached','--name-only'],{encoding:'utf8'}).trim())return;
  execFileSync('git',['commit','-m',`Publish approved Matrix beauty note ${slot.day} slot ${slot.slot}`],{stdio:'ignore'});
  execFileSync('git',['push','origin','HEAD:main'],{stdio:'ignore'});
 }
});
const mode=process.argv[2]||'audit';
try{if(runner.logResult(await runner.main(mode)))process.exitCode=1;}
catch(error){
 const message=runner.redact(error);store.state.lastFailure={at:new Date().toISOString(),message};
 try{persist(store);if(runner.currentPlan)await runner.report({day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),slot:1,...(mode==='audit'?{runId:`${runner.runId}-audit-failure`}:{})},'failed',{failure:message,...(mode==='audit'?{activity:'audit'}:{})});}catch{}
 console.error('Matrix writer stopped: '+message);process.exitCode=1;
}
