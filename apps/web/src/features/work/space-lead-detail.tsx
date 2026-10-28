import {Badge} from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {InfoDrawer} from '@/components/information-panel';
import {MatchExplanation} from '@/features/collection/match-explanation';
import {assessmentLabels} from '@crm/contracts';
import { sourceModeLabel } from '@/features/collection/mode';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { useLead } from '@/features/leads/use-leads';
import { DetailForms } from '@/features/leads/lead-detail-forms';
import { ContactActions, contactLabels } from '@/features/leads/contact-actions';
import { LeadReplyPreview } from '@/features/replies/reply-preview';
import { ErrorNotice, Loading } from '@/components/feedback';
import { platformLabel } from '@/lib/types';
export function SpaceLeadDetail({id,admin,onClose,scrollMemory}:{id:string;admin:boolean;onClose:()=>void;scrollMemory?:Map<string,number>}) {
  const state=useLead(id,admin), lead=state.query.data;
  const heading=useRef<HTMLHeadingElement>(null), origin=useRef(document.activeElement);
  const closeRef=useRef(onClose); closeRef.current=onClose;
  useEffect(()=>{heading.current?.focus({preventScroll:true});const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[role="dialog"]')){e.preventDefault();closeRef.current();}};document.addEventListener('keydown',esc);return()=>{document.removeEventListener('keydown',esc);if(origin.current instanceof HTMLElement&&origin.current.isConnected)origin.current.focus();else (document.querySelector<HTMLElement>('.aurora-dock-active, .space-node.selected')||document.querySelector<HTMLElement>('.core-start'))?.focus();};},[]);
  const scroll=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{if(lead&&scroll.current)scroll.current.scrollTop=scrollMemory?.get(id)||0;},[id,!!lead,scrollMemory]);
  const first=lead?.identity.comments?.find(c=>c.matches?.length)||lead?.identity.comments?.[0];
  return <section className="space-detail glass-panel" aria-label="线索来源与处理">
    <header className="space-detail-header"><span>评论来源</span>{lead&&<span className="platform-pill">{platformLabel[lead.identity.platform]}</span>}<span className="detail-post">{first?.post.title||'来源详情'}</span><Button variant="ghost" size="content" aria-label="关闭来源详情" onClick={onClose}><X size={18}/></Button></header>
    <div ref={scroll} className="space-detail-scroll" onScroll={e=>scrollMemory?.set(id,e.currentTarget.scrollTop)}><h2 ref={heading} tabIndex={-1}>{lead?.identity.nickname||'线索详情'}</h2><ErrorNotice error={state.query.error}/>{state.query.isPending?<Loading/>:!state.query.isError&&lead&&<DetailForms key={id} lead={lead} state={state} admin={admin}>
      <div className="space-source-summary"><Badge variant="secondary" className="soft-tag">{contactLabels[lead.contactStage||'MATCHED']}</Badge>{<Badge variant="secondary" className="soft-tag">{sourceModeLabel(lead.identity.platformUserId, lead.isDemo)}</Badge>}<p className="source-original">{first?.originalText||lead.evidence}</p><p className="source-match">匹配原因：<strong>{first?.matches?.map(m=>`${m.keywords.join('、')}（${assessmentLabels[m.classification]||m.classification}）`).join('；')||'待人工核验'}</strong></p><p className="helper-text">规则匹配不代表已确认意向，也不代表同意联系。</p>{first?.matches?.map((m,i)=><MatchExplanation key={i} assessment={m.assessment}/>)}<ContactActions lead={lead}/><InfoDrawer className="space-reply" title={<><MessageCircle size={16}/>预览话术</>}><LeadReplyPreview id={id}/></InfoDrawer><p className="helper-text">仅记录状态，不会发送消息。</p></div>
    </DetailForms>}</div>
  </section>;
}
