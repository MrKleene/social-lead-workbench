import {Button} from './ui/button';
import {ErrorNotice,Loading} from './feedback';
/** Keep the page identity and recovery action visible when its data is unavailable. */
export function PageState({title,loading,error,onRetry}:{title:string;loading?:boolean;error?:unknown;onRetry?:()=>void}){
 return <section className="page-state" aria-busy={loading}><header className="page-heading"><div><h1>{title}</h1><p>{loading?'正在读取，请稍候。':'数据暂时无法读取，未将缺失数据记为零。'}</p></div></header>{loading?<Loading/>:<div className="page-state-message"><ErrorNotice error={error}/>{onRetry&&<Button variant="outline" onClick={onRetry}>重新读取</Button>}</div>}</section>;
}
