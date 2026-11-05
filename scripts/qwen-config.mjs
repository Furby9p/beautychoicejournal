export function commentEndpoint(base=process.env.DASHSCOPE_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1'){
 const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!(u.hostname==='dashscope.aliyuncs.com'||u.hostname.endsWith('.maas.aliyuncs.com'))||!/^\/compatible-mode\/v1\/?$/.test(u.pathname))throw Error('Invalid configured Qwen endpoint');
 return u.href.replace(/\/$/,'')+'/chat/completions';
}
