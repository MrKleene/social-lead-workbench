/** Public image references only. No proxy, credentials, query tokens or guessed URLs. */
export function safePostCoverUrl(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>2048||!/^https:\/\//.test(value)||/[\s\\%]/.test(value))return;
 try{const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return;
  if(!['sns-webpic-qc.xhscdn.com','sns-webpic-qn.xhscdn.com'].includes(url.hostname))return;
  if(!/^\/[A-Za-z0-9_/.!@,=+-]+$/.test(url.pathname)||url.pathname==='/')return;
  return url.href;
 }catch{return;}
}
