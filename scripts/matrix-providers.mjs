export const PROVIDER_REVISION='geo-shared-openrouter-v1';
export const OPENROUTER_ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
export const openRouterConfigured=(key,model)=>!!key&&model==='qwen/qwen-plus';
export const knownRejection=status=>[401,402,403,404,429].includes(status)||(status>=500&&status<=599);
export const hasCompletion=result=>!!result?.choices?.some(choice=>choice.message?.content||choice.delta?.content);
export function openRouterCost(usage,fxRate){
 const actualUsd=typeof usage?.cost==='number'&&Number.isFinite(usage.cost)&&usage.cost>=0?usage.cost:null;
 const fx=fxRate&&Number.isFinite(fxRate.rate)&&fxRate.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(fxRate.date)&&typeof fxRate.source==='string'&&fxRate.source?{rate:fxRate.rate,date:fxRate.date,source:fxRate.source}:null;
 return{actualUsd,modelEstimateCny:actualUsd!==null&&fx?actualUsd*fx.rate:null,...(fx?{fxRate:fx}:{}),priceSource:'https://openrouter.ai/docs/guides/guides/usage-accounting'};
}
export function sourceAnnotations(result){
 const annotations=(result.choices||[]).flatMap(choice=>choice.message?.annotations||[]),refs=annotations.filter(a=>a.type==='url_citation'&&typeof a.url_citation?.url==='string').map(a=>({...a.url_citation}));
 if(!refs.length)return result;
 return{...result,search_info:{...result.search_info,search_results:[...(result.search_info?.search_results||[]),...refs]}};
}
