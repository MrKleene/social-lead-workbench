import {useAutomationPreferences} from './settings-data';
import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import type {AutoContactOverview} from '@crm/contracts';
import {api} from '@/lib/api';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Separator} from '@/components/ui/separator';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {MatchingSettings,ReplySettings} from './automation-panels';
import {useConfirmDiscard,useDraftGuard} from './draft-guard';
import type {AutomationTab,SetupIssue} from './automation-validation';
export function AutomationSettings({open,onClose,tab,onTab,collectionDirty,collectionBusy,collectionReady,children,issue,onReturnFocus}:{open:boolean;onClose:()=>void;tab:AutomationTab;onTab:(tab:AutomationTab)=>void;collectionDirty:boolean;collectionBusy:boolean;collectionReady:boolean;children:(manage:(module:'settings'|'accounts'|'templates'|'review')=>void)=>ReactNode;issue:SetupIssue|null;onReturnFocus:()=>void}){
 const preferences=useAutomationPreferences(open);
 const navigate=useNavigate(),[params]=useSearchParams();
 const review=useReviewOverview(open),contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),enabled:open,retry:false});
 const [matching,setMatching]=useState({dirty:false,busy:false}),[reply,setReply]=useState({dirty:false,busy:false}),confirm=useConfirmDiscard();
 const changeMatching=useCallback((dirty:boolean,busy:boolean)=>setMatching(s=>s.dirty===dirty&&s.busy===busy?s:{dirty,busy}),[]);
 const changeReply=useCallback((dirty:boolean,busy:boolean)=>setReply(s=>s.dirty===dirty&&s.busy===busy?s:{dirty,busy}),[]);
 const busy=collectionBusy||matching.busy||reply.busy,dirty=collectionDirty||matching.dirty||reply.dirty;
 useDraftGuard(open&&dirty,'modal');useDraftGuard(open&&busy,'pending');
 const close=async()=>{if(busy)return false;if(dirty&&!await confirm('有选择未能应用。关闭会放弃尚未生效的选择，已保存配置保持不变。'))return false;onClose();return true;};
 const globalSettings=async(module:'settings'|'accounts'|'templates'|'review')=>{if(!await close())return;const next=new URLSearchParams(params);if(module==='review'){navigate('/comment-review?manage=1');return;}next.set('module',module);next.delete('panel');next.delete('settingsTab');navigate('/work?'+next);};
 useEffect(()=>{if(!open){setMatching({dirty:false,busy:false});setReply({dirty:false,busy:false});}},[open]);
 const p=(review.data?.policies.find(p=>p.id===preferences.data?.policyId)||review.data?.policies[0]),r=(contact.data?.rules.find(r=>r.enabled)||contact.data?.rules[0]);
 const labels={collect:collectionReady?'已配置':'未配置',review:review.isError?'读取失败':review.isPending?'读取中':!p?'未配置':!p.autoEnabled?'已关闭':review.data?.connection.state!=='READY'?'未就绪':'已开启',contact:contact.isError?'读取失败':contact.isPending?'读取中':!r?'未配置':!r.enabled?'已关闭':!r.content||!r.accountIds.length||r.pauseReason?'未就绪':'已开启'};
 return <Sheet open={open} onOpenChange={next=>{if(!next)void close();}}><SheetContent className="task-settings-sheet automation-settings-sheet" data-applying={busy} closeDisabled={busy} onCloseAutoFocus={e=>{e.preventDefault();onReturnFocus();}}><SheetHeader><SheetTitle>自动化设置</SheetTitle><SheetDescription>修改内容请前往对应管理入口。</SheetDescription></SheetHeader><><Tabs value={tab} onValueChange={value=>onTab(value as AutomationTab)}><TabsList variant="line" className="automation-tabs" aria-label="自动化设置分组">{(['collect','review','contact'] as const).map((id,i)=><TabsTrigger key={id} value={id}>{['采集','评论匹配','自动回复'][i]}<small>{labels[id]}</small></TabsTrigger>)}</TabsList>{issue&&<p role="alert" className="automation-validation">{issue.message}</p>}
 <TabsContent value="collect" forceMount hidden={tab!=='collect'}>{children(module=>void globalSettings(module))}</TabsContent>
 <TabsContent value="review" forceMount hidden={tab!=='review'}><div className="task-settings-body">{review.isPending?<Loading/>:review.data?<><ErrorNotice error={review.error}/><MatchingSettings initialId={params.get("policy")||undefined} overview={review.data} onChange={changeMatching} onGlobal={()=>void globalSettings("settings")} onManage={()=>void globalSettings("review")}/></>:<><ErrorNotice error={review.error}/><Button variant="outline" onClick={()=>void review.refetch()}>重新读取匹配设置</Button></>}</div></TabsContent>
 <TabsContent value="contact" forceMount hidden={tab!=='contact'}><div className="task-settings-body"><ReplySettings onChange={changeReply} onGlobal={()=>void globalSettings("accounts")} onTemplates={()=>void globalSettings("templates")}/></div></TabsContent>
 </Tabs><Separator/><footer className="automation-settings-footer"><p className="automation-save-status" role="status">{busy?'正在应用…':dirty?'有选择尚未生效':''}</p><Button variant="outline" disabled={busy} onClick={()=>void close()}>{dirty?'关闭 / 放弃未生效选择':'完成设置'}</Button></footer></></SheetContent></Sheet>;
}
