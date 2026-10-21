// Keep handlers installed throughout cleanup: a second terminal signal must not
// restore Node's default immediate exit while owned services are still stopping.
export function installStopHandlers(stop, target=process) {
 let requested=false;
 const handler=()=>{if(!requested){requested=true;stop();}};
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])target.on(signal,handler);
 return ()=>{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])target.off(signal,handler);};
}
export async function ownedChildrenExited(children,timeoutMs=5000) {
 if(!children.length)return true;
 let timer;
 try{return await Promise.race([Promise.all(children.map(child=>child.done)).then(()=>true),new Promise(ok=>{timer=setTimeout(()=>ok(false),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
