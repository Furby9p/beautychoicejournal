import {initializeApp} from './vendor/firebase-app.js';
import {getAuth,signInAnonymously} from './vendor/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,where,orderBy,limit,writeBatch,serverTimestamp,deleteDoc,setDoc} from './vendor/firebase-firestore-lite.js';
const app=initializeApp({projectId:'beautychoicejournal',appId:'1:1029038857624:web:309072b50562f4ea32dfed',apiKey:'AIzaSyA2zeM8UKRp5zFp62i6a4UIt-4M6B-qum8',authDomain:'beautychoicejournal.firebaseapp.com'});
const db=getFirestore(app),auth=getAuth(app);
async function identity(){await auth.authStateReady();return auth.currentUser||(await signInAnonymously(auth)).user;}
const clean=d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate().toISOString()||new Date().toISOString()});
export async function community(url='',options={}){
 try{
 const thread=new URLSearchParams(url.replace(/^\?/,'' )).get('thread');
 if(!options.method){
  const constraints=thread?[where('thread','==',thread),limit(30)]:[orderBy('createdAt','desc'),limit(30)];
  const result=await getDocs(query(collection(db,thread?'comments':'posts'),...constraints));
  const items=result.docs.map(clean);if(thread)items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));return{items};
 }
 const input=JSON.parse(options.body),user=await identity();
 if(input.website)throw Error('提交未通过');
 const isReply=!!input.thread,id=(isReply?'reply-':'topic-')+crypto.randomUUID();
 const payload={uid:user.uid,nickname:input.nickname.trim(),body:input.body.trim(),createdAt:serverTimestamp(),...(isReply?{thread:input.thread}:{title:input.title.trim(),category:input.category||'护肤心得',cover:input.cover||'skincare',...(input.image?{image:input.image}:{})})};
 const batch=writeBatch(db);batch.set(doc(db,isReply?'comments':'posts',id),payload);batch.set(doc(db,'cooldowns',user.uid),{lastAt:serverTimestamp(),itemId:id,kind:isReply?'comment':'post'});await batch.commit();return{id};
 }catch(error){if(error.code==='permission-denied')throw Error('请核对字数、分类和封面；同一访客每两分钟可发布一次。');if(/quota|resource-exhausted/.test(error.code||''))throw Error('免费服务额度已用完，暂时暂停投稿和评论，请稍后再试。');if(error.code)throw Error('社区暂时无法连接，请稍后重试。');throw error;}
}
export async function owned(uid){await auth.authStateReady();return auth.currentUser?.uid===uid;}
export async function removeOwn(kind,id){await identity();await deleteDoc(doc(db,kind,id));}
export async function reportPost(target){const user=await identity();await setDoc(doc(db,'reports',user.uid+'_'+target),{uid:user.uid,target,createdAt:serverTimestamp()});}
export async function getPost(id){const result=await getDoc(doc(db,'posts',id));if(!result.exists())throw Error('这篇投稿不存在或已被删除');return clean(result);}
