import {inspectImageUrl,imageUrlClass,type ImageDiagnostic,type ImageReason,type ImageUrlClass} from '@crm/contracts';
const record=(v:unknown):Record<string,unknown>|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
function diagnose(value:unknown,values:unknown[],fieldCount:number,kind:'cover'|'avatar',supported:boolean,truncated=false){
 const counts=new Map<ImageReason,number>(),classes=new Map<string,ImageUrlClass & {count:number}>();let url:string|undefined,upgradedUrl:string|undefined,httpsUpgrades=0;
 for(const candidate of values){
  const facts=imageUrlClass(candidate,kind);if(facts){const key=facts.protocol+':'+facts.host;classes.set(key,{...facts,count:(classes.get(key)?.count||0)+1});}
  let result=inspectImageUrl(candidate,kind);let upgraded=false;
  // Local reviewed source accepts HTTP image references. Only this existing public CDN
  // passed a credential-free HTTPS/TLS check (2026-10-22); never upgrade other hosts,
  // ports, query-bearing references or avatars. Keep the exact source path, prefer native HTTPS.
  if(kind==='cover'&&result.reason==='PROTOCOL'&&typeof candidate==='string'&&candidate.startsWith('http://sns-webpic-qc.xhscdn.com/')){
   const secure=inspectImageUrl('https:'+candidate.slice(5),'cover');if(secure.url){result=secure;upgraded=true;httpsUpgrades++;}
  }
  counts.set(result.reason,(counts.get(result.reason)||0)+1);if(upgraded)upgradedUrl??=result.url;else url??=result.url;
 }
 url??=upgradedUrl;
 const diagnostic:ImageDiagnostic={version:1,truncated,urlClasses:[...classes.values()],httpsUpgrades,shape:value===undefined?'NOT_RETURNED':value===null||value===''||Array.isArray(value)&&!value.length?'EMPTY':supported?'SUPPORTED':'UNSUPPORTED',fieldCount,outcomes:[...counts].map(([reason,count])=>({reason,count}))};
 return {url,diagnostic};
}
/** Pinned types.go: search cover and detail imageList[0]; never construct URLs from file IDs. */
export function inspectXhsCover(value:unknown){
 const image=record(value);if(!image)return diagnose(value,[],0,'cover',false);
 const info=Array.isArray(image.infoList)?image.infoList.slice(0,8):[];
 const names=['urlDefault','urlPre','url'];
 const values=[...names.map(k=>image[k]),...info.map(i=>record(i)?record(i)!.url:{unsupported:true})];
 if(image.infoList!=null&&!Array.isArray(image.infoList))values.push({unsupported:true});
 return diagnose(value,values,names.filter(k=>Object.hasOwn(image,k)).length+info.filter(i=>{const v=record(i);return v&&Object.hasOwn(v,'url');}).length,'cover',true,Array.isArray(image.infoList)&&image.infoList.length>8);
}
export function inspectXhsDetailCover(value:unknown){
 if(!Array.isArray(value))return diagnose(value,[],0,'cover',false);
 if(!value.length)return diagnose(value,[],0,'cover',true);
 return inspectXhsCover(value[0]);
}
export function inspectXhsAvatar(value:unknown,sourceField?:unknown){const result=diagnose(value,[value],value===undefined?0:1,'avatar',typeof value==='string');if(sourceField==='avatar'||sourceField==='image')result.diagnostic.sourceField=sourceField;return result;}
export function xhsCover(value:unknown){return inspectXhsCover(value).url;}
export function xhsDetailCover(value:unknown){return inspectXhsDetailCover(value).url;}
