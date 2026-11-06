import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {parseHTML} from 'linkedom';
import {decodePage,safeSource} from './content.mjs';

const primaryHosts=['aad.org','fda.gov','nhs.uk','clevelandclinic.org','nuface.com','mynuface.com','foreo.com','currentbody.com','lorealparisusa.com','paulaschoice.com','cerave.com','laroche-posay.us','aveneusa.com','nmpa.gov.cn','gov.cn','pubmed.ncbi.nlm.nih.gov','pmc.ncbi.nlm.nih.gov','bad.org.uk','skincancer.org',
 // Explicit original journal sites; this does not authorize generic publisher/CDN hosts.
 'onlinelibrary.wiley.com','www.sciencedirect.com','link.springer.com','www.nature.com','jamanetwork.com','www.bmj.com','journals.plos.org'];
const HTML_BYTES=2*1024*1024,PDF_BYTES=12*1024*1024,HTML_CHARS=12000,PDF_CHARS=16000;
const hash=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const excerpt=(text,max,marker='[Source excerpt truncated]')=>text.length<=max?text:text.slice(0,max-marker.length-1).trimEnd()+'\n'+marker;
function rejectChallenge(text){if(/just a moment|verify (?:you are|that you are) human|access denied|checking your browser|enable javascript and cookies|captcha|unusual traffic|security verification/i.test(text))throw Error('Blocked original source: robot challenge');}

function trustedUrl(value){
 let url;try{url=new URL(value);}catch{throw Error('Unsafe primary-source URL');}
 const proxy=/(^|[.\/_-])(proxy|localhost|internal|private)([.\/_-]|$)/i;
 if(!safeSource(value)||url.port||proxy.test(url.hostname)||/\/(proxy|redirect|fetch)(\/|$)/i.test(url.pathname)||[...url.searchParams.keys()].some(k=>/^(url|uri|redirect|target|destination)$/i.test(k))||!primaryHosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('Source outside primary-source allowlist');
 url.hash='';return url.href;
}

function htmlText(bytes,contentType,ref){
 const {document}=parseHTML(decodePage(bytes,contentType));
 const title=clean(document.querySelector('title')?.textContent);
 for(const node of document.querySelectorAll('script,style,nav,header,footer,aside,form,dialog,noscript,template,svg,iframe,[hidden],[aria-hidden="true"]'))node.remove();
 const main=document.querySelector('main,[role="main"]');
 const articles=[...document.querySelectorAll('article')];
 const root=main||articles.sort((a,b)=>b.textContent.length-a.textContent.length)[0]||document.body||document;
 // Keep word boundaries between adjacent block elements without inventing source text.
 for(const node of root.querySelectorAll('p,div,section,h1,h2,h3,h4,li,tr,br,td'))node.append(' ');
 const text=clean(root.textContent);
 const challenge=title+' '+text.slice(0,2000);
 rejectChallenge(challenge);
 if(text.length<250)throw Error('Original source has too little readable text');
 return{title:title||clean(ref.title)||new URL(ref.url).hostname,text:excerpt(text,HTML_CHARS)};
}

function cancel(body){try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{}}

async function readBytes(response,maxBytes,signal){
 const declared=Number(response.headers.get('content-length'));
 if(declared>maxBytes){cancel(response.body);throw Error('Original source size limit exceeded');}
 if(!response.body?.getReader)throw Error('Original source has no readable stream');
 const reader=response.body.getReader(),parts=[];let size=0;
 const abort=()=>cancel(reader);signal.addEventListener('abort',abort,{once:true});
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Original source size limit exceeded');parts.push(Buffer.from(value));}
  return Buffer.concat(parts,size);
 }finally{signal.removeEventListener('abort',abort);cancel(reader);}
}

function pdfText(bytes){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{bcjPdf:true,bytes:new Uint8Array(bytes)},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32},execArgv:[],env:{}});
  const timer=setTimeout(()=>finish(Error('PDF extraction timeout')),10000);
  let finished=false;
  function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);worker.terminate().catch(()=>{});error?reject(error):resolve(result);}
  worker.once('message',message=>message.error?finish(Error(message.error)):finish(null,message));
  worker.once('error',()=>finish(Error('PDF extraction failed or memory limit exceeded')));
  worker.once('exit',()=>{if(!finished)finish(Error('PDF extraction worker ended without text'));});
 });
}

async function extractPdf(bytes){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,verbosity:0});
 const pdf=await loading.promise;
 try{
  if(pdf.numPages>120)throw Error('PDF page limit exceeded');
  const parts=[];let characters=0,truncated=false;
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
   const page=await pdf.getPage(pageNumber),stream=page.streamTextContent({disableNormalization:false}),reader=stream.getReader(),items=[];let pageSize=0;
   try{
    while(true){const chunk=await reader.read();if(chunk.done)break;for(const item of chunk.value.items){if(typeof item.str==='string'){pageSize+=item.str.length;if(pageSize>2000000)throw Error('PDF page text limit exceeded');items.push(item.str+(item.hasEOL?'\n':' '));}}}
   }finally{cancel(reader);page.cleanup();}
   const text=clean(items.join(''));
   if(text){parts.push(`[Page ${pageNumber}]\n${text}`);characters+=text.length+30;}
   if(characters>=PDF_CHARS){truncated=pageNumber<pdf.numPages;break;}
  }
  const text=parts.join('\n\n');
  if(text.replace(/\[Page \d+\]/g,'').trim().length<250)throw Error('PDF has too little readable text (image-only/scanned PDF requires OCR)');
  const limited=excerpt(text+(truncated?'\n[PDF excerpt truncated; remaining pages omitted]':''),PDF_CHARS,'[PDF excerpt truncated; remaining text/pages omitted]');
  const metadata=await pdf.getMetadata().catch(()=>null);
  return{text:limited,title:clean(metadata?.info?.Title)};
 }finally{await loading.destroy();}
}

if(!isMainThread&&workerData?.bcjPdf){
 try{parentPort.postMessage(await extractPdf(workerData.bytes));}
 catch(error){parentPort.postMessage({error:'PDF extraction failed: '+String(error.message).slice(0,250)});}
}

export async function readPrimarySource(ref,{fetch=globalThis.fetch,now=()=>new Date()}={}){
 const controller=new AbortController();let activeBody;
 const timeout=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Original source reading timeout')),{once:true});});
 const timer=setTimeout(()=>{controller.abort();cancel(activeBody);},25000);
 async function read(){
  let url=trustedUrl(ref?.url);
  for(let hop=0;hop<5;hop++){
   url=trustedUrl(url);
   const response=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'BeautyChoiceJournal research (+https://beautychoicejournal.com/about/)','Accept':'text/html,application/pdf;q=0.9,text/plain;q=0.8'}});
   if(controller.signal.aborted){cancel(response.body);throw Error('Original source reading timeout');}
   activeBody=response.body;
   if(response.status>=300&&response.status<400){
    cancel(response.body);const location=response.headers.get('location');if(!location)throw Error('Original source redirect has no location');
    url=trustedUrl(new URL(location,url).href);continue;
   }
   if(!response.ok){cancel(response.body);throw Error('Unreadable original source HTTP '+response.status);}
   const type=(response.headers.get('content-type')||'').toLowerCase();
   const pdfType=/application\/pdf/.test(type),possiblePdf=pdfType||/application\/octet-stream/.test(type)||/\.pdf$/i.test(new URL(url).pathname);
   if(!possiblePdf&&!/text\/html|application\/xhtml\+xml|text\/plain/.test(type)){cancel(response.body);throw Error('Unsupported original source content type');}
   const bytes=await readBytes(response,possiblePdf?PDF_BYTES:HTML_BYTES,controller.signal);
   if(controller.signal.aborted)throw Error('Original source reading timeout');
   const pdfMagic=bytes.subarray(0,5).toString('ascii')==='%PDF-';
   if(pdfType&&!pdfMagic)throw Error('Invalid PDF signature');
   let result;
   if(pdfMagic)result=await pdfText(bytes);
   else if(/text\/plain/.test(type)){const text=clean(decodePage(bytes,type));rejectChallenge(text.slice(0,2000));if(text.length<250)throw Error('Original source has too little readable text');result={text:excerpt(text,HTML_CHARS)};}
   else if(/html/.test(type))result=htmlText(bytes,type,{...ref,url});
   else throw Error('Invalid PDF or unsupported original source content type');
   return{url,title:result.title||clean(ref.title)||new URL(url).hostname,text:result.text,checkedAt:now().toISOString(),contentHash:hash(bytes),textHash:hash(result.text)};
  }
  throw Error('Original source redirect limit exceeded');
 }
 try{return await Promise.race([read(),timeout]);}
 finally{clearTimeout(timer);}
}
