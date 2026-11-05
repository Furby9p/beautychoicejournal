import {randomInt, randomUUID} from 'node:crypto';
const DAY=86400000;
// Simulated locations are independent of documentation-only IP addresses.
const regions=[['广东',13],['江苏',10],['浙江',10],['山东',9],['河南',8],['四川',7],['上海',6],['北京',6],['湖北',5],['福建',5],['湖南',5],['安徽',5],['河北',5],['重庆',3],['陕西',3],['辽宁',3],['广西',3],['江西',3],['云南',2],['贵州',2],['山西',2],['天津',2],['黑龙江',2],['吉林',1],['内蒙古',1],['甘肃',1],['海南',1],['新疆',1],['宁夏',1],['青海',1],['西藏',1]];
function region(){if(randomInt(100)>=95)return ['中国香港','中国台湾','新加坡','日本'][randomInt(4)];let p=randomInt(regions.reduce((s,r)=>s+r[1],0));for(const [name,weight] of regions){p-=weight;if(p<0)return name;}}
export function validateGenerated(rows,count){
 if(!Number.isInteger(count)||count<2||count>60||!Array.isArray(rows)||rows.length!==count)throw Error('Invalid demo comment count');
 for(const [i,r] of rows.entries()){
 if(typeof r.body!=='string'||r.body.trim().length<2||r.body.length>100||/我亲测|我用了|用了.{0,8}(有效|改善)|我买了|治好了|治愈|保证有效|医生推荐/.test(r.body))throw Error('Invalid demo discussion text');
 if(r.parent!==null&&(!Number.isInteger(r.parent)||r.parent<0||r.parent>=i||rows[r.parent].parent!==null))throw Error('Invalid parent comment');
 }
 return rows;
}
export function makePlan(note,rows){
 validateGenerated(rows,rows.length);
 const start=Date.parse(note.publishedAt.slice(0,10)+'T00:00:00+08:00');if(!Number.isFinite(start))throw Error('Invalid article publication date');
 const items=rows.map((r,i)=>{const parent=r.parent===null?null:rows[r.parent];let at=start+(1+randomInt(7))*DAY+(1+randomInt(3))*3600000+randomInt(3600000);if(parent)at=Math.max(at,Date.parse(parent._at)+60000);at=Math.min(at,start+8*DAY-1);r._at=new Date(at).toISOString();r._id='demo-'+randomUUID();return{id:r._id,thread:note.slug,body:r.body.trim(),parentId:parent?parent._id:null,nickname:['小桃','奶油','薄荷','橘子','月亮','晴天','莓莓','小鹿','柚子','糯米'][randomInt(10)]+'*'+randomInt(10,100),ip:['192.0.2','198.51.100','203.0.113'][randomInt(3)]+'.'+randomInt(1,255),region:region(),createdAt:r._at,demo:true};});
 return{slug:note.slug,publishedAt:note.publishedAt,target:items.length,demo:true,items};
}
export function released(plans,now=new Date()){
 return plans.map(p=>({slug:p.slug,items:p.items.filter(x=>Date.parse(x.createdAt)<=now.getTime())})).filter(p=>p.items.length);
}
