import type {JourneyLiveProgress} from '@crm/contracts';
export function JourneyLiveTrail({live}:{live?:JourneyLiveProgress}){
 if(!live?.recent.length)return null;
 return <details className="journey-live-trail"><summary>执行进展</summary><ol aria-label="已记录执行进展">{live.recent.map((e,i)=><li key={e.at+e.stage+i}><time dateTime={e.at}>{new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><span>{e.label.replace(/^正在/,'')}</span></li>)}</ol></details>;
}
