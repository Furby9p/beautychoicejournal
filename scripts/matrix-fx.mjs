const source='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const shanghaiDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
function valid(value,now){return value&&value.source===source&&Number.isFinite(value.rate)&&value.rate>.1&&value.rate<30&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Date.parse(value.date)<=now.getTime()&&now.getTime()-Date.parse(value.date)<8*86400000;}
export function parseReferenceFx(xml,now=new Date()){
 if(typeof xml!=='string'||xml.length>65536)throw Error('Invalid reference rate document');
 const date=xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
 const get=currency=>Number(xml.match(new RegExp("<Cube\\s+currency=['\"]"+currency+"['\"]\\s+rate=['\"]([0-9.]+)['\"]"))?.[1]);
 const usd=get('USD'),cny=get('CNY'),value={rate:cny/usd,date,source};if(!Number.isFinite(usd)||usd<=0||!valid(value,now))throw Error('Reference exchange rate unavailable, stale or in future');return value;
}
export async function loadReferenceFx({state,save,fetchImpl=fetch,now=()=>new Date()}){
 const clock=now(),previous=state.matrixFx;if(previous?.fetchedDay===shanghaiDay(clock)&&valid(previous,clock))return{rate:previous.rate,date:previous.date,source};
 try{
  const response=await fetchImpl(source,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Reference rate unavailable');
  const rate=parseReferenceFx(await response.text(),clock);state.matrixFx={...rate,fetchedDay:shanghaiDay(clock),fetchedAt:clock.toISOString()};save();return rate;
 }catch{if(valid(previous,clock))return{rate:previous.rate,date:previous.date,source};return null;}
}
