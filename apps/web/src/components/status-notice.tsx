import {useRef,useState} from 'react';
import {CircleAlert,Info} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import './status-notice.css';
/** Compact status with explicit, keyboard-accessible details; never hides the risk label. */
export function StatusNotice({label,details,attention=false}:{label:string;details?:string[];attention?:boolean}) {
 const trigger=useRef<HTMLButtonElement|null>(null);
 const [open,setOpen]=useState(false),lines=[...new Set(details?.filter(Boolean))];
 const Icon=attention?CircleAlert:Info;
 return <div className="compact-status-notice" data-attention={attention}>
  <div role="status" aria-live="polite" aria-atomic="true"><Icon size={15} aria-hidden="true"/><span>{label}</span></div>
  {lines.length>0&&<><Button ref={trigger} variant="ghost" size="sm" onClick={()=>setOpen(true)}>查看原因</Button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="compact-status-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><SheetHeader><SheetTitle>任务状态</SheetTitle><SheetDescription className="sr-only">所选任务的状态与注意事项</SheetDescription></SheetHeader><div className="compact-status-details">{lines.map(line=><p key={line}>{line}</p>)}</div></SheetContent></Sheet></>}
 </div>;
}
export function pauseDescription(reason:string){
 return ({SUBMISSION_UNKNOWN:'发送结果尚未确认，已暂停发送。请勿重发或换号补发；额度与去重保护保留。',DM_SUBMISSION_UNKNOWN:'私信结果尚未确认，已暂停发送。请勿重复发送；额度与去重保护保留。',RATE_LIMITED:'平台触发频率限制，已暂停发送。核查限制前不换号。',PLATFORM_REFUSED:'平台拒绝请求，已暂停发送。核查限制前不换号。',ACCOUNT_RESTRICTED:'发送账号受限，已暂停发送。'} as Record<string,string>)[reason]||`发送已暂停：${reason}。核查限制前不换号。`;
}
