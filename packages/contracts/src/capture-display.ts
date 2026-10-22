/** Optional display metadata. Never used as identity, content version or model input. */
export type CaptureDisplay={authorNickname?:string;authorAvatarUrl?:string;publishedAt?:string};
export function savedNickname(value:unknown):string|undefined {
 if(typeof value!=='string')return;const name=value.trim();
 return name&&name.length<=200&&!/[\u0000-\u001f\u007f]/.test(name)?name:undefined;
}
/** Only the observed public avatar CDN and unsigned paths; no URL reconstruction. */
export function safeAvatarUrl(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>2048||!/^https:\/\//.test(value)||/[\s\\%]/.test(value))return;
 try{const u=new URL(value);if(u.hostname!=='sns-avatar-qc.xhscdn.com'||u.username||u.password||u.port||u.search||u.hash||!/^\/avatar\/[A-Za-z0-9_/.!@,=+-]+$/.test(u.pathname))return;return u.href;}catch{return;}
}
/** Epoch seconds/milliseconds from upstream; ISO only for our already-normalized records. */
export function savedPublishedAt(value:unknown):string|undefined {
 let ms:number;
 if(typeof value==='number'&&Number.isSafeInteger(value))ms=value<100000000000?value*1000:value;
 else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)){ms=Date.parse(value);if(!Number.isFinite(ms)||new Date(ms).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))return;}
 else return;
 if(ms<Date.UTC(2000,0,1)||ms>Date.now()+86400000)return;
 return new Date(ms).toISOString();
}
export function captureDisplay(value:CaptureDisplay):CaptureDisplay {
 const authorNickname=savedNickname(value.authorNickname),authorAvatarUrl=safeAvatarUrl(value.authorAvatarUrl),publishedAt=savedPublishedAt(value.publishedAt);
 return {...(authorNickname?{authorNickname}:{}),...(authorAvatarUrl?{authorAvatarUrl}:{}),...(publishedAt?{publishedAt}:{})};
}
