import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export function prepareSearch(root,dist){
 const config=JSON.parse(fs.readFileSync(path.join(root,'search-verification.json'),'utf8'));
 if(!/^[A-Za-z0-9-]{8,128}$/.test(config.indexNowKey))throw Error('Invalid IndexNow key');
 fs.writeFileSync(path.join(dist,config.indexNowKey+'.txt'),config.indexNowKey);
 const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
 const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).filter(url=>!url.includes('/community/'));
 const manifest={version:1,domain:'beautychoicejournal.com',key:config.indexNowKey,urls:urls.map(url=>{const pathname=new URL(url).pathname;const file=path.join(dist,pathname,'index.html');const content=fs.readFileSync(file);if(/<meta[^>]+noindex/i.test(content.toString()))throw Error('Non-indexable URL in manifest');return{url,hash:createHash('sha256').update(content).digest('hex')};})};
 fs.writeFileSync(path.join(dist,'search-manifest.json'),JSON.stringify(manifest,null,2));
}
