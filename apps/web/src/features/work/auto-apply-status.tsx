import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';

export function AutoApplyStatus({busy,error,applied,retry}:{busy:boolean;error:Error|null;applied:boolean;retry:()=>void}){
 return <>{!busy&&error&&<div className="auto-apply-status"><ErrorNotice error={error}/><Button variant="outline" size="sm" onClick={retry}>重试</Button></div>}<span className="sr-only" role="status">{!busy&&applied?'已保存':''}</span></>;
}
