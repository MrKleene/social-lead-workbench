import { useEffect, useRef } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { useLead } from '@/features/leads/use-leads';
import { DetailForms } from '@/features/leads/lead-detail-forms';
import { ContactActions, contactLabels } from '@/features/leads/contact-actions';
import { LeadReplyPreview } from '@/features/replies/reply-preview';
import { ErrorNotice, Loading } from '@/components/feedback';
import { platformLabel } from '@/lib/types';
export function SpaceLeadDetail({id,admin,onClose}:{id:string;admin:boolean;onClose:()=>void}) {
  const state=useLead(id,admin), lead=state.query.data;
  const heading=useRef<HTMLHeadingElement>(null), origin=useRef(document.activeElement);
  const closeRef=useRef(onClose); closeRef.current=onClose;
  useEffect(()=>{heading.current?.focus();const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[role="dialog"]')){e.preventDefault();closeRef.current();}};document.addEventListener('keydown',esc);return()=>{document.removeEventListener('keydown',esc);if(origin.current instanceof HTMLElement&&origin.current.isConnected)origin.current.focus();else document.querySelector<HTMLElement>('[aria-label="线索队列"]')?.focus();};},[]);
  const first=lead?.identity.comments?.find(c=>c.matches?.length)||lead?.identity.comments?.[0];
  return <section className="space-detail glass-panel" aria-label="线索来源与处理">
    <header className="space-detail-header"><span>评论来源</span>{lead&&<span className="platform-pill">{platformLabel[lead.identity.platform]}</span>}<span className="detail-post">{first?.post.title||'来源详情'}</span><button aria-label="关闭来源详情" onClick={onClose}><X size={18}/></button></header>
    <div className="space-detail-scroll"><h2 ref={heading} tabIndex={-1}>{lead?.identity.nickname||'线索详情'}</h2><ErrorNotice error={state.query.error}/>{state.query.isPending?<Loading/>:!state.query.isError&&lead&&<DetailForms key={id} lead={lead} state={state} admin={admin}>
      <div className="space-source-summary"><span className="soft-tag">{contactLabels[lead.contactStage||'MATCHED']}</span>{lead.isDemo&&<span className="soft-tag">虚构模拟</span>}<p className="source-original">{first?.originalText||lead.evidence}</p><p className="source-match">匹配原因：<strong>{first?.matches?.map(m=>`${m.keywords.join('、')}（${m.classification==='POSSIBLE_HELP'?'可能求助':'仅专业相关'}）`).join('；')||'待人工核验'}</strong></p><p className="helper-text">规则匹配不代表已确认意向，也不代表同意联系。</p><ContactActions lead={lead}/><details className="space-reply"><summary><MessageCircle size={16}/>预览话术</summary><LeadReplyPreview id={id}/></details><p className="helper-text">仅记录状态，不会发送消息。</p></div>
    </DetailForms>}</div>
  </section>;
}
