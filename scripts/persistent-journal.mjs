import {openSync,writeSync,closeSync,fsyncSync,constants} from 'node:fs';
import {join} from 'node:path';
const events=new Set(['START','CHILD_START','CHILD_EXIT','STOP_REQUESTED','OUTPUT_CLOSED','CLEANUP_COMPLETE','CLEANUP_INCOMPLETE','EXIT']);
const roles=new Set(['api','collector','web','local-command']);
const signals=new Set(['SIGINT','SIGTERM','SIGHUP','SIGKILL']);
export function lifecycleJournal(directory,launchId){
 const file=join(directory,'lifecycle-'+launchId+'.jsonl');
 const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);let closed=false;
 const record=(event,data={})=>{
  if(closed||!events.has(event))return;
  const row={at:new Date().toISOString(),event};
  for(const key of ['pid','ppid','code'])if(Number.isInteger(data[key]))row[key]=data[key];
  if(roles.has(data.role))row.role=data.role;
  if(signals.has(data.signal))row.signal=data.signal;
  try{writeSync(fd,JSON.stringify(row)+'\n');fsyncSync(fd);}catch{} // Diagnostics never replace lock ownership.
 };
 return {file,record,close(){if(!closed){closed=true;closeSync(fd);}}};
}
