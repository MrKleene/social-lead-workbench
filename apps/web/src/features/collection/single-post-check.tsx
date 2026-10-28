import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {InfoSection} from '@/components/information-panel';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {useSinglePostCheck} from './use-single-post-check';
import {CoverageDiagnostics} from './coverage-diagnostics';
import {ImageDiagnostics} from './image-diagnostics';
import {BoundedCheckResult} from './bounded-check-result';
import {reasonLabels} from './types';
function CheckForm(){
 const s=useSinglePostCheck();
 return <div className="task-settings-body"><FormField>使用账号<SelectField aria-label="单帖检查账号" value={s.accountId} disabled={s.busy||s.submitted} onValueChange={e=>s.setAccountId(e)}>{!s.accounts.length&&<SelectOption value="">没有可核验的账号</SelectOption>}{s.accounts.map(a=><SelectOption key={a.id} value={a.id}>{accountOptionName(a)}{a.reason==='UNVERIFIED'?' · 将先检查登录':''}</SelectOption>)}</SelectField></FormField>
 <FormField>小红书原文链接<Input aria-label="单帖原文链接" type="url" aria-describedby="single-post-link-status" aria-invalid={!!s.url&&!s.link.valid&&!s.submitted} autoComplete="off" spellCheck={false} value={s.url} onChange={e=>s.setUrl(e.target.value)} disabled={s.submitted} placeholder="粘贴浏览器中可打开的完整帖子链接"/></FormField>
 {!s.submitted&&<p id="single-post-link-status" role="status" aria-live="polite">{s.link.message}</p>}
 {!s.submitted&&<FormField className="login-consent"><Checkbox  aria-label="验证评论翻页与回复" checked={s.expandReplies} onCheckedChange={e=>{s.setExpandReplies((e === true));s.setConsent(false);}}/><span>验证评论翻页与回复</span></FormField>}
 {!s.submitted&&s.expandReplies&&<p>最多滚动主评论 3 次、尝试展开回复 12 次，限时 15 秒；不写入采集信息。</p>}
 {!s.submitted&&<FormField className="login-consent"><Checkbox  aria-label="确认本次只读检查" checked={s.consent} onCheckedChange={e=>s.setConsent((e === true))}/><span>使用本机已保存会话，核验账号并只读检查这一篇。{s.expandReplies?'按上述限额展开回复；不开新采集任务，不下载头像。':'不开新采集任务，不翻页或展开回复，不下载头像。'}</span></FormField>}
 {s.readiness.isError?<Alert role="alert"><AlertDescription>无法确认本机状态，请稍后重新打开。</AlertDescription></Alert>:!s.readiness.data?.device?.online&&!s.readiness.isPending&&<p role="status">请先在账号中心确认专用电脑在线。</p>}
 <Button disabled={s.submitted||s.busy||!s.consent||!s.link.valid||!s.accountId||!s.readiness.data?.device?.online} onClick={()=>void s.check()}>{s.busy?'正在核验并读取这一篇…':s.error?'未取得检查结果':s.submitted?'本次检查已提交':'只读检查这一篇'}</Button>
 {s.error&&<Alert role="alert"><AlertDescription>{s.error}</AlertDescription></Alert>}
 {s.result?.status==='LOGIN_NOT_READY'&&<p role="status">登录核验未通过，尚未读取帖子。请到账号中心查看状态；不一定需要重新扫码。</p>}
 {s.result?.status==='FAILED'&&<Alert role="alert"><AlertDescription>本次检查停止：{reasonLabels[s.result.reason||'']||'检查未完成，请核查账号与设备状态'}。不会自动重试。</AlertDescription></Alert>}
 {s.result?.status==='CHECKED'&&<section aria-label="单帖检查结果"><p>读取方式：{s.result.mode==='BOUNDED_REPLIES'?'验证评论翻页与回复':'初始窗口（不展开）'}</p>{s.result.mode==='BOUNDED_REPLIES'&&<BoundedCheckResult value={s.result.boundedRead}/>}<p>本次读取 {s.result.roots?.count} 条主评论、{s.result.replies?.count} 条回复；可用于显示的头像地址分别为 {s.result.roots?.displayableAvatars}、{s.result.replies?.displayableAvatars} 个。</p><p>仅检查地址与返回结构，没有下载图片，不代表全部评论；结果不写入采集信息。</p>{s.result.mode==='BOUNDED_REPLIES'?<InfoSection  title={<>展开前的初始窗口诊断</>}><CoverageDiagnostics value={s.result.coverageDiagnostic}/></InfoSection>:<CoverageDiagnostics value={s.result.coverageDiagnostic}/>}<ImageDiagnostics value={s.result.imageDiagnostics}/></section>}
 </div>;
}
export function SinglePostCheck(){const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);return <><Button ref={trigger} variant="ghost" onClick={()=>setOpen(true)}>单帖检查</Button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="task-settings-sheet" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>单帖只读检查</SheetTitle><SheetDescription>管理员诊断。链接只在本次请求中使用，不保存到浏览器或日志。关闭面板不撤回已发出的请求。</SheetDescription></SheetHeader>{open&&<CheckForm/>}</SheetContent></Sheet></>;}
