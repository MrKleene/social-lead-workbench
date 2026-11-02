import {useRef,useState} from 'react';
import {DropdownMenu} from 'radix-ui';
import {MoreHorizontal} from 'lucide-react';
import type {SemanticReviewItem} from '@crm/contracts';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {FormField} from '@/components/form-field';
import {Textarea} from '@/components/ui/textarea';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {ErrorNotice} from '@/components/feedback';
import {useWorkspaceMutation} from '@/features/collection/use-collection';
import {useAuth} from '@/features/auth/use-auth';
import {manualReviewLabel} from './manual-review-label';
export function ReviewRowActions({item,index,onOpen}:{item:SemanticReviewItem;index:number;onOpen:(r:SemanticReviewItem,trigger:HTMLButtonElement|null)=>void}){
 const trigger=useRef<HTMLButtonElement>(null),opening=useRef(false);
 return <DropdownMenu.Root onOpenChange={open=>{if(open)opening.current=false;}}><DropdownMenu.Trigger asChild><Button ref={trigger} variant="ghost" size="icon" aria-label={`评论更多操作 ${index+1}`}><MoreHorizontal/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="review-actions-menu" align="end" sideOffset={4} onCloseAutoFocus={e=>{if(opening.current)e.preventDefault();}}><DropdownMenu.Item className="review-actions-item" onSelect={()=>{opening.current=true;onOpen(item,trigger.current);}}>{item.reviewStatus==='PENDING'?'人工复核':'复核记录'}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
export function ReviewManualDialog(props:{item:SemanticReviewItem;onClose:()=>void;onReviewed:()=>void;onReturnFocus:()=>void}){const {user}=useAuth();return user?.role==='ADMIN'?<ManualDialog {...props}/>:null;}
function ManualDialog({item:r,onClose,onReviewed,onReturnFocus}:{item:SemanticReviewItem;onClose:()=>void;onReviewed:()=>void;onReturnFocus:()=>void}){
 const [note,setNote]=useState(''),mutation=useWorkspaceMutation(),heading=useRef<HTMLHeadingElement>(null);
 const missing=r.state!=='EVALUATED'||r.context!=='SUFFICIENT'||!r.result||!!r.result.decision&&r.result.decision!=='MATCH';
 const decide=(decision:'APPROVED'|'REJECTED')=>mutation.mutate({path:`/collection/semantic-reviews/${r.id}`,method:'PATCH',body:{version:r.version,decision,note}},{onSuccess:onReviewed});
 return <Sheet open onOpenChange={open=>{if(!open&&!mutation.isPending)onClose();}}><SheetContent className="task-settings-sheet review-manual-dialog" closeDisabled={mutation.isPending} onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();onReturnFocus();}}><SheetHeader><SheetTitle ref={heading} tabIndex={-1}>{r.reviewStatus==='PENDING'?'人工复核（可选）':'复核记录'}</SheetTitle><SheetDescription className="sr-only">记录人工判断，不直接发送回复</SheetDescription></SheetHeader><div className="task-settings-body"><Badge variant="secondary">{manualReviewLabel(r.reviewStatus)}</Badge><p className="review-manual-comment">{r.snapshot.comment}</p>{r.reviewStatus==='PENDING'?<><FormField>复核备注（必填）<Textarea aria-label="复核备注" maxLength={500} value={note} disabled={mutation.isPending} onChange={e=>setNote(e.target.value)} placeholder="填写确认相关或排除的依据"/></FormField>{missing&&<p className="helper-text">当前结果不能人工确认相关，可保留或排除。</p>}<div className="action-row"><Button variant="outline" disabled={!note.trim()||mutation.isPending} onClick={()=>decide('REJECTED')}>排除此条</Button><Button disabled={missing||!note.trim()||mutation.isPending} onClick={()=>decide('APPROVED')}>人工确认相关</Button></div></>:<p>{r.reviewNote||'未填写备注'}</p>}<ErrorNotice error={mutation.error}/></div><footer className="graphite-review-footer"><Button variant="outline" disabled={mutation.isPending} onClick={onClose}>{r.reviewStatus==='PENDING'?'取消':'关闭'}</Button></footer></SheetContent></Sheet>;
}
