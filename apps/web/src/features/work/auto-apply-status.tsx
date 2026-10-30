import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
export function AutoApplyStatus({busy,error,applied,retry,progress=true}:{busy:boolean;error:Error|null;applied:boolean;retry:()=>void;progress?:boolean}){
 return <div className="auto-apply-status" aria-live="polite">{busy?(progress?<p role="status">正在应用选择…</p>:null):error?<><ErrorNotice error={error}/><p>当前选择尚未生效，已保存的配置仍保留。</p><Button variant="outline" size="sm" onClick={retry}>重试应用</Button></>:applied&&progress?<p role="status">已应用</p>:null}</div>;
}
