import {useEffect,useRef,useState} from 'react';
/** One writer, latest queued value. No background retry after an unknown/failed result. */
export function useAutoApply<T>(initial:T,apply:(value:T)=>Promise<T>){
 const [value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState<Error|null>(null),[applied,setApplied]=useState(false);
 const current=useRef(initial),writer=useRef(apply),pending=useRef<{value:T;generation:number}|null>(null),running=useRef(false),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 writer.current=apply;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 const drain=async()=>{
  if(running.current||timer.current||!pending.current)return;
  running.current=true;
  while(pending.current&&!timer.current){
   const job=pending.current;pending.current=null;
   try{const saved=await writer.current(job.value);if(mounted.current&&job.generation===generation.current){current.current=saved;setValue(saved);setApplied(true);}}
   catch(e){pending.current=null;if(timer.current){clearTimeout(timer.current);timer.current=null;}if(mounted.current){setError(e instanceof Error?e:new Error('应用失败，请重试'));setApplied(false);}break;}
  }
  running.current=false;if(mounted.current)setBusy(!!pending.current||!!timer.current);
 };
 const change=(next:T,delay=0)=>{current.current=next;setValue(next);setError(null);setApplied(false);setBusy(true);pending.current={value:next,generation:++generation.current};if(timer.current)clearTimeout(timer.current);timer.current=delay?setTimeout(()=>{timer.current=null;void drain();},delay):null;if(!delay)void drain();};
 return {value,busy,error,applied,change,retry:()=>change(current.current),flush:()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;void drain();}}};
}
