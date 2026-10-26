import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {ErrorNotice} from '@/components/feedback';
import type {ReviewOverview} from '@crm/contracts';
import type {useReviewWorkspace} from './use-comment-review';
export function ReviewDialogs({state:s,overview,onAuthClose}:{state:ReturnType<typeof useReviewWorkspace>;overview:ReviewOverview;onAuthClose:()=>void}){
 return <Sheet open={s.authorization} onOpenChange={v=>{if(!s.busy)s.setAuthorization(v);}}><SheetContent className="task-settings-sheet" onCloseAutoFocus={e=>{e.preventDefault();onAuthClose();}}><SheetHeader><SheetTitle>开启采集后自动识别</SheetTitle><SheetDescription>后续每篇评论读取完成且覆盖检查通过后，将持续分批调用模型并产生费用。</SheetDescription></SheetHeader><div className="task-settings-body"><p>{s.target}</p><p>审核会把脱敏的需求、评论和必要上下文发送到所配置的北京模型端点。</p><p>{overview.connection.model} · {overview.connection.priceDescription}</p><p>模型按使用量计费，{overview.connection.dailyLimit===null?'不限制累计调用次数':`保留每日 ${overview.connection.dailyLimit} 次上限`}。自动脱敏无法可靠完成时停止。自动调用不再逐批询问；范围为开启后新完成的帖子及评论，每批最多 5 条。关闭可阻止新调用，在途请求仍可能计费。修改目标或模型后需要重新确认。</p><div className="action-row"><Button disabled={s.busy||!overview.connection.priceVersion||!overview.connection.priceDescription} onClick={()=>s.toggle.mutate({enabled:true,consent:true})}>同意持续调用并开启</Button><Button variant="ghost" disabled={s.busy} onClick={()=>s.setAuthorization(false)}>取消</Button></div><ErrorNotice error={s.toggle.error}/></div></SheetContent></Sheet>;
}
