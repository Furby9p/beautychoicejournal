export function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function decodePage(bytes,contentType=''){const hint=contentType+' '+new TextDecoder('ascii').decode(bytes.slice(0,3000));const charset=/charset\s*=\s*["']?([a-z\d_-]+)/i.exec(hint)?.[1]||'utf-8';return new TextDecoder(/^(gb2312|gbk|gb18030)$/i.test(charset)?'gb18030':charset).decode(bytes);}
export function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|[^.]+$)/i.test(u.hostname);}catch{return false;}}
export function validateArticle(a){
 if(!a.title||!Array.isArray(a.sections)||a.sections.length<1||a.sections.some(s=>typeof s.heading!=='string'||!Array.isArray(s.paragraphs)||s.paragraphs.some(p=>typeof p!=='string'))||a.sections.flatMap(s=>s.paragraphs).join('').length<500)throw Error('正文不完整');
 if(!Array.isArray(a.sources)||a.sources.some(s=>!safeSource(s.url)||typeof s.title!=='string')||new Set(a.sources.map(s=>s.url)).size<2)throw Error('至少需要两个有效来源，且所有来源必须为安全网页');
 if(a.provider!=='dashscope'||!a.model?.startsWith('qwen'))throw Error('文章必须由千问直接生成');
 return a;
}
