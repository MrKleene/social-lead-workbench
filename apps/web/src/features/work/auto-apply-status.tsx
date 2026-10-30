import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
export function AutoApplyStatus({busy,error,applied,retry}:{busy:boolean;error:Error|null;applied:boolean;retry:()=>void}){
 return <>{!busy&&error&&<div className="auto-apply-status"><ErrorNotice error={error}/><p>当前选择尚未生效，已保存的配置仍保留。</p><Button variant="outline" size="sm" onClick={retry}>重试应用</Button></div>}<span className="sr-only" role="status">{!busy&&applied?'选择已保存':''}</span></>;
}
