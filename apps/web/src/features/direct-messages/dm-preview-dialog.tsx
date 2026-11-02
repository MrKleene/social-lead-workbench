import {Button} from '@/components/ui/button';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {ErrorNotice,Loading} from '@/components/feedback';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import type {ReplyTemplate} from '@/features/replies/use-replies';
import {SavedText} from '@/features/collection/saved-text';
import {useState} from 'react';
import {useDmPreview,capabilityError} from './use-dm-preview';
import './dm-preview.css';
import {DmSendConfirmation} from './dm-send-confirmation';
import {previewKey} from './use-dm-preview';
export function DmPreviewButton({template}:{template:ReplyTemplate}){
 const [open,setOpen]=useState(false);
 if(template.channel!=='DM')return null;
 return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline" size="sm">私信预览</Button></SheetTrigger><SheetContent className="dm-preview"><SheetHeader><SheetTitle>私信预览</SheetTitle><SheetDescription>先核对收件人与内容；预览不发送。</SheetDescription></SheetHeader>{open&&<DmPreviewForm key={`${template.id}:${template.version}`} template={template}/>}</SheetContent></Sheet>;
}
export function DmPreviewForm({template}:{template:ReplyTemplate}){
 const s=useDmPreview(template),busy=s.prepare.isPending;
 if(s.capability.isPending)return <Loading/>;
 if(s.capability.isError)return <div role="alert"><p>{capabilityError(s.capability.error)}</p><Button variant="outline" onClick={()=>void s.capability.refetch()}>重试读取</Button></div>;
 if(!s.capability.data?.previewAvailable)return <p role="status">当前服务不支持私信预览。</p>;
 const p=s.preview,accounts=s.accounts.data?.accounts.filter(a=>!a.isDemo)||[];
 return <div className="dm-preview-body">{!s.capability.data.sendingAvailable&&<p className="dm-unavailable" role="status">{s.capability.data.reason} · 不可发送</p>}<div className="dm-fields"><FormField>预览账号<SelectField aria-label="私信预览账号" value={s.accountId} onValueChange={s.changeAccount} disabled={busy||s.accounts.isPending||s.accounts.isError}><SelectOption value="">选择账号</SelectOption>{accounts.map(a=><SelectOption key={a.id} value={a.id}>{a.loginNickname||a.label} · {a.platform==='XHS'?'小红书':'抖音'}</SelectOption>)}</SelectField></FormField><FormField>评论来源方案<SelectField aria-label="私信评论来源方案" value={s.policyId} onValueChange={s.changePolicy} disabled={busy||s.overview.isPending||s.overview.isError}><SelectOption value="">选择已有方案</SelectOption>{s.overview.data?.policies.map(x=><SelectOption key={x.id} value={x.id}>{x.name}</SelectOption>)}</SelectField></FormField></div>
 <ErrorNotice error={s.accounts.error||s.overview.error}/>{(s.accounts.isError||s.overview.isError)&&<Button variant="outline" onClick={()=>{void s.accounts.refetch();void s.overview.refetch();}}>重试读取账号与方案</Button>}
 {!s.accounts.isPending&&!s.accounts.isError&&!accounts.length&&<p>暂无真实账号。</p>}{!s.overview.isPending&&!s.overview.isError&&!s.overview.data?.policies.length&&<p>暂无评论匹配方案。</p>}
 {s.policyId&&<section aria-label="选择原评论" className="dm-sources"><h3>选择原评论</h3><div className="dm-source-list"><ErrorNotice error={s.results.error}/>{s.results.isPending?<Loading/>:s.results.isError?<Button variant="outline" onClick={()=>void s.results.refetch()}>重试读取评论</Button>:!s.results.data?.items.length?<p>该方案暂无已保存评论。</p>:s.results.data.items.map(r=><label key={r.id} className="dm-source"><input type="radio" name="dm-source" aria-label={`选择 ${r.source?.authorNickname||'未记录昵称'} 的评论`} checked={s.reviewId===r.id} disabled={busy||r.isDemo} onChange={()=>s.changeReview(r.id)}/><span><strong>{r.source?.authorNickname||'昵称未记录'} · {r.score===null?'未评分':`${r.score} 分`}{r.reviewStatus==='REJECTED'?' · 已人工排除':''}{r.isDemo?' · 模拟数据不可用于私信':''}</strong><SavedText text={r.snapshot.comment} label="评论" limit={120}/><small>{r.snapshot.title||'帖子标题未记录'}</small></span></label>)}</div>{s.results.data&&<footer className="dm-paging"><small>共 {s.results.data.total} 条 · 每页 20 条 · 第 {s.results.data.total?Math.floor(s.offset/20)+1:0}/{Math.ceil(s.results.data.total/20)} 页</small><div><Button size="sm" variant="ghost" disabled={busy||s.results.isFetching||!s.offset} onClick={()=>s.changePage(Math.max(0,s.offset-20))}>上一页</Button><Button size="sm" variant="ghost" disabled={busy||s.results.isFetching||!s.results.data.hasMore} onClick={()=>s.changePage(s.offset+20)}>下一页</Button></div></footer>}</section>}
 <div className="dm-preview-action"><span>模板：{template.name}</span><Button disabled={busy||!s.input||s.accounts.isError||s.results.isError} onClick={s.previewNow}>{busy?'正在准备…':'生成本地预览'}</Button></div><ErrorNotice error={s.prepare.error}/>
 {p&&<section className="dm-result" aria-label="私信准备结果"><h3>私信预览内容</h3><dl><div><dt>收件人</dt><dd>{p.source.authorNickname||'昵称未记录'} · {p.source.recipientId}</dd></div><div><dt>来源帖子</dt><dd>{p.source.postTitle||'未记录'}</dd></div><div><dt>原评论</dt><dd><SavedText text={p.source.comment||'未记录'} label="原评论" limit={180}/></dd></div><div><dt>预览时额度</dt><dd>已占用 {p.quota.occupied}/{p.quota.accountDailyLimit} · 剩余 {p.quota.remaining}</dd></div></dl><pre>{p.content}</pre>{!!p.missingFields.length&&<p>未获取字段：{p.missingFields.join('、')}</p>}{!!p.unknownFields.length&&<p>未知变量：{p.unknownFields.join('、')}</p>}<ul aria-label="私信限制">{p.issues.map(i=><li key={i.code}>{i.message}</li>)}</ul>{s.capability.data.sendingAvailable&&s.input&&!p.issues.some(i=>!['DM_UNAVAILABLE','CONVERSATION_UNVERIFIED'].includes(i.code))&&<DmSendConfirmation key={previewKey(s.input)} input={s.input}/>}</section>}
 </div>;
}
