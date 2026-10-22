import {inspectImageUrl,type ImageDiagnostic,type ImageReason} from '@crm/contracts';
const record=(v:unknown):Record<string,unknown>|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
function diagnose(value:unknown,values:unknown[],fieldCount:number,kind:'cover'|'avatar',supported:boolean,truncated=false){
 const counts=new Map<ImageReason,number>();let url:string|undefined;
 for(const candidate of values){const result=inspectImageUrl(candidate,kind);counts.set(result.reason,(counts.get(result.reason)||0)+1);url??=result.url;}
 const diagnostic:ImageDiagnostic={version:1,truncated,shape:value===undefined?'NOT_RETURNED':value===null||value===''||Array.isArray(value)&&!value.length?'EMPTY':supported?'SUPPORTED':'UNSUPPORTED',fieldCount,outcomes:[...counts].map(([reason,count])=>({reason,count}))};
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
export function inspectXhsAvatar(value:unknown){return diagnose(value,[value],value===undefined?0:1,'avatar',typeof value==='string');}
export function xhsCover(value:unknown){return inspectXhsCover(value).url;}
export function xhsDetailCover(value:unknown){return inspectXhsDetailCover(value).url;}
