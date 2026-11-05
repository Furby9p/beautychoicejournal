import {getStore} from '@netlify/blobs';
import {createHash,randomUUID} from 'node:crypto';
import topics from '../../content/topics.json' with {type:'json'};
const articleSlugs=new Set(topics.map(t=>t.slug));
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function invalid(message,status=400){throw Object.assign(new Error(message),{status});}
function field(value,min,max,label){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)invalid(`${label}需为 ${min}—${max} 个字符`);return value.trim();}
const validThread=id=>articleSlugs.has(id)||/^topic-[0-9a-f-]{36}$/.test(id);
export function createHandler(storeFactory){return async(request,context)=>{try{
 const url=new URL(request.url),method=request.method;if(!['GET','POST'].includes(method))return response({error:'不支持此操作'},405);
 if(method==='POST'&&request.headers.get('origin')!==url.origin)invalid('请从本站页面发布',403);
 const store=storeFactory();
 if(method==='GET'){
  const thread=url.searchParams.get('thread')||'';if(thread&&!validThread(thread))invalid('讨论不存在',404);
  const prefix=thread?'replies/'+thread+'/':'threads/';const page=await store.list({prefix});
  const keys=page.blobs.map(b=>b.key).sort().slice(0,50);const items=(await Promise.all(keys.map(key=>store.get(key,{type:'json'})))).filter(Boolean);
  return response({items:items.sort((a,b)=>thread?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt))});
 }
 if(process.env.COMMUNITY_READ_ONLY==='true')invalid('讨论区暂时只读，请稍后再试',503);
 if(!request.headers.get('content-type')?.includes('application/json'))invalid('请求格式不正确',415);
 if(Number(request.headers.get('content-length')||0)>12000)invalid('内容过长',413);
 const raw=await request.text();if(Buffer.byteLength(raw)>12000)invalid('内容过长',413);let input;try{input=JSON.parse(raw);}catch{invalid('请求格式不正确');}
 if(!input||typeof input!=='object'||Array.isArray(input))invalid('请求格式不正确');
 if(input.website)invalid('提交未通过，请不要填写隐藏字段');
 const nickname=field(input.nickname,1,24,'昵称'),body=field(input.body,5,1200,'内容'),thread=typeof input.thread==='string'?input.thread:'';
 let title;if(thread){if(!validThread(thread)||(!articleSlugs.has(thread)&&!await store.get('topic-ids/'+thread,{type:'json'})))invalid('讨论不存在',404);}else title=field(input.title,4,80,'标题');
 if(!context.ip)invalid('暂时无法校验请求，请稍后重试',503);
 const ipHash=createHash('sha256').update(context.site?.id+':'+context.ip).digest('hex');const slot=Math.floor(Date.now()/120000);
 const lock=await store.setJSON('cooldowns/'+ipHash+'/'+slot,{at:new Date().toISOString()},{onlyIfNew:true});if(!lock.modified)invalid('发布得有点快，请两分钟后再试',429);
 const id=thread?'reply-'+randomUUID():'topic-'+randomUUID(),createdAt=new Date().toISOString(),item={id,nickname,body,createdAt,...(title?{title}:{thread})};
 const reverse=String(9999999999999-Date.now()).padStart(13,'0');
 if(!thread)await store.setJSON('topic-ids/'+id,{id});await store.setJSON((thread?'replies/'+thread+'/':'threads/')+reverse+'-'+id,item,{onlyIfNew:true});return response({id},201);
 }catch(error){if(!error.status)console.error('Community storage request failed');return response({error:error.status?error.message:'讨论服务暂时不可用，请稍后再试'},error.status||503);}};}
export default createHandler(()=>getStore({name:'beautychoicejournal-community',consistency:'strong'}));
export const config={path:'/api/community'};
