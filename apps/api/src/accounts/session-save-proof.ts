import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname} from 'node:path';
import {privateFile} from '../../../../runtime/platform.cjs';

// Only called for the current, explicitly authorized candidate AFTER its writer
// has stopped. Never used to scan existing credentials or during startup.
export function validSessionPayload(value:unknown, mode:'real'|'offline'):boolean {
  if(mode==='offline')return !!value&&typeof value==='object'&&(value as any).fixture===true&&(value as any).status==='SUCCESS';
  const envelope=value as {version?:unknown;cookies?:unknown};
  const cookies=Array.isArray(value)?value:envelope?.version===2?envelope.cookies:null;
  if(!Array.isArray(cookies)||!cookies.length||cookies.length>1000)return false;
  // Upstream saves all cookies in its isolated browser, including auxiliary
  // domains. Validate their structure; require a nonempty XHS cookie as well.
  const seen=new Set<string>();
  return cookies.every(c=>{
    if(!c||typeof c!=='object'||typeof c.name!=='string'||!c.name||c.name.length>256||typeof c.value!=='string'||c.value.length>32768||typeof c.domain!=='string'||c.domain.length>253||!/^\.?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(c.domain)||typeof c.path!=='string'||!c.path.startsWith('/'))return false;
    const key=JSON.stringify([c.name,c.domain,c.path]);if(seen.has(key))return false;seen.add(key);return true;
  })&&cookies.some(c=>c.value.length>0&&/^\.?([a-z0-9-]+\.)*xiaohongshu\.com$/i.test(c.domain));
}
export async function confirmSessionFile(path:string,mode:'real'|'offline',signal:AbortSignal):Promise<void>{
  let file:Awaited<ReturnType<typeof open>>|undefined;
  try{
    if(signal.aborted)throw Error();
    const before=await privateFile(path);
    if(before.size<2||before.size>1048576)throw Error();
    file=await open(path,constants.O_RDWR|(constants.O_NOFOLLOW||0));
    const opened=await file.stat();
    if(opened.dev!==before.dev||opened.ino!==before.ino||opened.nlink!==1||opened.size!==before.size)throw Error();
    // Bounded read also protects against a file growing after the stat.
    const data=Buffer.alloc(1048577);let size=0;
    try{
      while(size<data.length){const read=await file.read(data,size,data.length-size,size);if(!read.bytesRead)break;size+=read.bytesRead;}
      if(size!==opened.size||!validSessionPayload(JSON.parse(data.subarray(0,size).toString('utf8')),mode))throw Error();
    }finally{data.fill(0);}
    await file.sync();
    const after=await privateFile(path);
    if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||signal.aborted)throw Error();
    // Flush the new directory entries on POSIX. Windows file flush uses fsync;
    // its directory handle API is different and is not claimed tested on Mac.
    if(process.platform!=='win32')for(const dir of [dirname(path),dirname(dirname(path))]){const handle=await open(dir,constants.O_RDONLY);try{await handle.sync();}finally{await handle.close();}}
    if(signal.aborted)throw Error();
  }catch{throw Error('SESSION_SAVE_UNCONFIRMED');}
  finally{await file?.close();}
}
