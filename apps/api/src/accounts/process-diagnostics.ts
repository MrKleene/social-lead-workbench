/** Drain stderr without retaining raw lines, URLs, credentials, or page text.
 * Classification is diagnostic only: it cannot prove submission or restriction. */
export class ProcessDiagnostics {
 private seen=new Set<'PANIC'|'TIMEOUT'|'BROWSER_DISCONNECTED'|'OTHER'>();
 private bytes=0;
 private tail='';
 private truncated=false;
 accept(chunk:Buffer){
  const room=Math.max(0,65536-this.bytes);this.bytes+=chunk.length;
  if(chunk.length>room)this.truncated=true;
  if(!room)return;
  const text=(this.tail+chunk.subarray(0,room).toString('utf8')).slice(-8192);
  let known=false;
  if(/panic:|fatal error:/i.test(text)){this.seen.add('PANIC');known=true;}
  if(/deadline exceeded|timed out|timeout/i.test(text)){this.seen.add('TIMEOUT');known=true;}
  if(/websocket.*closed|connection.*closed|browser.*disconnected/i.test(text)){this.seen.add('BROWSER_DISCONNECTED');known=true;}
  if(!known)this.seen.add('OTHER');
  this.tail=text.slice(-128);
 }
 snapshot(){return {categories:[...this.seen].sort(),truncated:this.truncated};}
 clear(){this.tail='';}
}
