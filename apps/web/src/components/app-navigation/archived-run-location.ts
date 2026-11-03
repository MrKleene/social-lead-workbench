/** Remove only the confirmed archived selection; unrelated deep links stay intact. */
export function clearArchivedRunUrl(value:string,archivedId:string){
 const queryAt=value.indexOf('?');
 if(queryAt<0||!archivedId)return value;
 const path=value.slice(0,queryAt),tail=value.slice(queryAt+1),hashAt=tail.indexOf('#');
 const hash=hashAt<0?'':tail.slice(hashAt),params=new URLSearchParams(hashAt<0?tail:tail.slice(0,hashAt));
 if(params.get('run')!==archivedId)return value;
 for(const key of ['run','fresh','post','reviewVersion'])params.delete(key);
 if(path==='/automation'||params.get('module')==='runs')params.set('stage','collect');
 return path+(params.size?'?'+params:'')+hash;
}
export function clearedRunId(state:unknown){
 return state&&typeof state==='object'&&'archivedRunId' in state&&typeof state.archivedRunId==='string'?state.archivedRunId:'';
}
