import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
export function AutoApplyStatus({busy,error,applied,retry}:{busy:boolean;error:Error|null;applied:boolean;retry:()=>void}){
 return <>{!busy&&error&&<div className="auto-apply-status"><ErrorNotice error={error}/><p>未能确认当前选择，请重新读取核对或重试。</p><Button variant="outline" size="sm" onClick={retry}>重试应用</Button></div>}<span className="sr-only" role="status">{!busy&&applied?'选择已保存':''}</span></>;
}
