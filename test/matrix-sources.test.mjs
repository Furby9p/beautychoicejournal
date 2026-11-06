import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {readPrimarySource} from '../scripts/matrix-sources.mjs';

const url='https://www.mynuface.com/manual';
const prose='Use only the instructions for this exact device model. Review the warnings and contraindications before treatment. Do not transfer frequency or intensity instructions between different models. ';
const now=()=>new Date('2026-11-06T03:00:00Z');
const digest=x=>createHash('sha256').update(x).digest('hex');
const htmlResponse=html=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
const readHtml=(html,ref={url})=>readPrimarySource(ref,{now,fetch:async()=>htmlResponse(html)});

// A real, compressed, two-page PDF; changing extraction to metadata-only must fail.
function pdfFixture({empty=false,pages=2}={}){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages} /Kids [${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<pages;i++){
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
  const text=empty?'':`BT /F1 10 Tf 40 740 Td (Page${i+1} ${prose.repeat(3)}) Tj ET`;
  const compressed=deflateSync(text);
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),compressed,Buffer.from('\nendstream')]));
 }
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let size=parts[0].length;
 objects.forEach((value,i)=>{const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(value),Buffer.from('\nendobj\n')]);offsets.push(size);parts.push(b);size+=b.length;});
 parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
 return Buffer.concat(parts);
}

test('extracts article text, decodes entities, removes chrome and hashes actual bytes',async()=>{
 const html=`<html><head><title>Official &amp; instructions</title></head><body><nav>${'Shop '.repeat(3000)}</nav><main><nav>Products</nav><article><h1>Model guide</h1><p>Warnings &amp; care&nbsp;instructions &#8212; ${prose.repeat(3)}</p></article><aside>Related shopping</aside><script>fake claims</script></main><footer>Subscribe</footer></body></html>`;
 const got=await readHtml(html);
 assert.match(got.text,/Warnings & care instructions —/);
 assert.doesNotMatch(got.text,/Shop|Products|shopping|fake claims|Subscribe/);
 assert.equal(got.title,'Official & instructions');assert.equal(got.checkedAt,'2026-11-06T03:00:00.000Z');
 assert.equal(got.contentHash,digest(Buffer.from(html)));assert.equal(got.textHash,digest(got.text));
});

test('body fallback preserves readable paragraphs without a main tag',async()=>{
 const got=await readHtml(`<html><body><header>${'Brand '.repeat(2000)}</header><div><h1>Original instructions</h1><p>${prose.repeat(3)}</p></div><form>Search</form></body></html>`);
 assert.match(got.text,/Original instructions/);assert.doesNotMatch(got.text,/Brand|Search/);
});

test('truncation is explicit and bounded after main content selection',async()=>{
 const got=await readHtml(`<main><h1>Model</h1><p>${prose.repeat(150)}</p></main>`);
 assert.ok(got.text.length<=12000);assert.match(got.text,/excerpt truncated/i);
});

test('rejects challenges even when wrapped inside long website chrome',async()=>{
 for(const challenge of ['Just a moment...','Verify you are human','Access Denied','Checking your browser before accessing','Enable JavaScript and cookies to continue']){
  await assert.rejects(readHtml(`<head><title>${challenge}</title></head><body><nav>${prose.repeat(10)}</nav><main><h1>${challenge}</h1><p>${prose.repeat(3)}</p></main></body>`),/blocked|challenge/i);
 }
});

test('rejects short pages and unsupported binary responses',async()=>{
 await assert.rejects(readHtml('<main>No content</main>'),/readable|short/i);
 await assert.rejects(readPrimarySource({url},{fetch:async()=>new Response('binary',{headers:{'content-type':'application/zip'}})}),/content|type|unreadable/i);
});

test('requires explicit primary hosts and rejects credentials, private IPs, proxy routes and alternate ports before fetch',async()=>{
 for(const bad of ['http://127.0.0.1/','https://10.1.1.1/','https://www.mynuface.com.evil.test/','https://user:pass@www.mynuface.com/','https://www.mynuface.com:8443/','https://www.manualslib.com/guide/4036630/','https://r.jina.ai/https://www.mynuface.com/','https://www.mynuface.com/proxy?url=http://localhost/']){
  let called=false;await assert.rejects(readPrimarySource({url:bad},{fetch:async()=>{called=true;return htmlResponse(`<main>${prose.repeat(3)}</main>`);}}),/allowlist|unsafe|primary/i);assert.equal(called,false,bad);
 }
});

test('validates every redirect before following it and cancels redirect bodies',async()=>{
 let calls=0,cancelled=false;
 await assert.rejects(readPrimarySource({url},{fetch:async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}});}}),/allowlist|unsafe|primary/i);
 assert.equal(calls,1);assert.equal(cancelled,true);
});

test('follows relative trusted redirects and returns the final canonical source',async()=>{
 const got=await readPrimarySource({url},{now,fetch:async value=>value===url?new Response(null,{status:302,headers:{location:'/instructions'}}):htmlResponse(`<main>${prose.repeat(3)}</main>`)});
 assert.equal(got.url,'https://www.mynuface.com/instructions');
});

test('redirect loops and missing locations fail without unbounded requests',async()=>{
 let calls=0;await assert.rejects(readPrimarySource({url},{fetch:async()=>{calls++;return new Response(null,{status:302,headers:{location:url}});}}),/redirect/i);assert.ok(calls<=5);
 await assert.rejects(readPrimarySource({url},{fetch:async()=>new Response(null,{status:302})}),/redirect/i);
});

test('streamed over-size HTML is rejected rather than silently parsed as complete',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(readPrimarySource({url},{fetch:async()=>new Response(stream,{headers:{'content-type':'text/html'}})}),/size|large|limit/i);assert.equal(cancelled,true);
});

test('a declared over-size response is cancelled before reading its bytes',async()=>{
 let cancelled=false;
 await assert.rejects(readPrimarySource({url},{fetch:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/pdf','content-length':'999999999'}})}),/size|large|limit/i);assert.equal(cancelled,true);
});

test('the deadline aborts a fetch even if the injected transport ignores its signal',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let signal;
 const request=readPrimarySource({url},{fetch:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 const failure=assert.rejects(request,/timeout/i);t.mock.timers.tick(25000);await failure;assert.equal(signal.aborted,true);
});

test('the deadline cancels a stalled body reader instead of retaining a locked stream',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;
 const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const request=readPrimarySource({url},{fetch:async()=>new Response(stream,{headers:{'content-type':'text/html'}})});
 await Promise.resolve();await Promise.resolve();
 const failure=assert.rejects(request,/timeout/i);t.mock.timers.tick(25000);await failure;assert.equal(cancelled,true);
});

test('a transport completing after the deadline cannot begin another body read',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let deliver,readStarted=false,cancelled=false;
 const request=readPrimarySource({url},{fetch:async()=>new Promise(resolve=>{deliver=resolve;})});
 const failure=assert.rejects(request,/timeout/i);t.mock.timers.tick(25000);await failure;
 deliver({ok:true,status:200,headers:new Headers({'content-type':'text/html'}),body:{cancel(){cancelled=true;},getReader(){readStarted=true;return{read:()=>new Promise(()=>{}),cancel(){cancelled=true;}};}}});
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(readStarted,false);assert.equal(cancelled,true);
});

test('plain-text robot challenges cannot masquerade as long readable sources',async()=>{
 await assert.rejects(readPrimarySource({url},{fetch:async()=>new Response('Verify you are human. '+prose.repeat(3),{headers:{'content-type':'text/plain'}})}),/blocked|challenge/i);
});

test('reads genuine compressed PDF pages with page labels and byte/text hashes',async()=>{
 const bytes=pdfFixture();const got=await readPrimarySource({url:url+'.pdf',title:'Official manual'},{now,fetch:async()=>new Response(bytes,{headers:{'content-type':'application/pdf'}})});
 assert.match(got.text,/\[Page 1\]/);assert.match(got.text,/\[Page 2\]/);assert.match(got.text,/Page1 Use only/);assert.match(got.text,/Page2 Use only/);
 assert.equal(got.title,'Official manual');assert.equal(got.contentHash,digest(bytes));assert.equal(got.textHash,digest(got.text));assert.ok(got.text.length<=16000);
});

test('sniffs PDF bytes when a manufacturer serves application/octet-stream',async()=>{
 const got=await readPrimarySource({url:url+'.pdf'},{fetch:async()=>new Response(pdfFixture(),{headers:{'content-type':'application/octet-stream'}})});assert.match(got.text,/\[Page 2\]/);
});

test('rejects fake PDF, image-only PDF and PDFs exceeding page cap',async()=>{
 for(const bytes of [Buffer.from('<html>Not a PDF</html>'),pdfFixture({empty:true}),pdfFixture({pages:121})]){
  await assert.rejects(readPrimarySource({url:url+'.pdf'},{fetch:async()=>new Response(bytes,{headers:{'content-type':'application/pdf'}})}),/PDF|readable|page/i);
 }
});

test('explicit original journal hosts can be read but arbitrary publisher storage cannot',async()=>{
 for(const source of ['https://onlinelibrary.wiley.com/doi/10.1002/test','https://www.sciencedirect.com/science/article/pii/test','https://link.springer.com/article/10.1007/test','https://www.nature.com/articles/test','https://jamanetwork.com/journals/jamadermatology/fullarticle/test','https://www.bmj.com/content/test','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0332995']){
  const got=await readHtml(`<article>${prose.repeat(3)}</article>`,{url:source});assert.equal(got.url,source);
 }
 await assert.rejects(readHtml(`<main>${prose.repeat(3)}</main>`,{url:'https://unrelated-cdn.test/article.pdf'}),/allowlist|primary/i);
});
