export type DisplayMetadata={authorNickname?:string;authorAvatarUrl?:string;publishedAt?:string};
export function displayNickname(value:unknown){if(typeof value!=='string')return;const n=value.trim();return n&&n.length<=200&&!/[\u0000-\u001f\u007f]/.test(n)?n:undefined;}
/** Public unsigned avatar URLs only. No proxy or local download. */
export function displayAvatar(value:unknown){
 if(typeof value!=='string'||value.length>2048||!/^https:\/\//.test(value)||/[\s\\%]/.test(value))return;
 try{const u=new URL(value);if(u.hostname!=='sns-avatar-qc.xhscdn.com'||u.username||u.password||u.port||u.search||u.hash||!/^\/avatar\/[A-Za-z0-9_/.!@,=+-]+$/.test(u.pathname))return;return u.href;}catch{return;}
}
/** Render normalized ISO timestamps only; never interpret relative text or collection time as publication. */
export function displayPublication(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return;
 const n=Date.parse(value);if(!Number.isFinite(n)||n<Date.UTC(2000,0,1)||n>Date.now()+86400000)return;
 const iso=new Date(n).toISOString();if(iso.replace('.000Z','Z')!==value.replace('.000Z','Z'))return;return iso;
}
export function readingTime(value:string){const n=Date.parse(value);return Number.isFinite(n)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(n):'时间未返回';}
