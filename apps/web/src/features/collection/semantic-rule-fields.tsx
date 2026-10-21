import { useState } from 'react';
import type { SemanticRules } from '@crm/contracts';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export function useSemanticDraft(initial?:SemanticRules|null){
 const [enabled,setEnabled]=useState(!!initial),[target,setTarget]=useState(initial?.target||''),[threshold,setThreshold]=useState(initial?.reviewThreshold??70);
 return {enabled,setEnabled,target,setTarget,threshold,setThreshold,dirty:enabled!==!!initial||target!==(initial?.target||'')||threshold!==(initial?.reviewThreshold??70),value:enabled?{version:1 as const,target,reviewThreshold:threshold}:null};
}
export function SemanticRuleFields({draft:d}:{draft:ReturnType<typeof useSemanticDraft>}){
 return <fieldset className="rule-fields"><legend>自然语言语义审核 · 可选</legend><label className="check-label"><input type="checkbox" checked={d.enabled} onChange={e=>d.setEnabled(e.target.checked)}/>启用自然语言审核（保存后生效）</label><p className="helper-text">模型未配置，真实 LLM 质量未验收。搜索词只找帖子；启用后为新获取的评论保存原文与上下文，进入独立待审核队列。旧关键词规则继续工作，不回补历史评论，不自动联系。</p>{d.enabled&&<><label>目标需求（自然语言）<Textarea required minLength={10} maxLength={1500} rows={4} value={d.target} onChange={e=>d.setTarget(e.target.value)} placeholder="例如：寻找正在为毕业论文选题或开题报告求助的学生，排除提供代写服务的人。结合帖子和父评论判断，缺少语境时待核查。"/></label><label>审核优先分数<Input type="number" required min={0} max={100} value={d.threshold} onChange={e=>d.setThreshold(e.target.valueAsNumber)}/></label><p className="helper-text">0–100仅用于排序，不是概率。分数不能授予发送权限；去重、拒绝联系、平台状态与发送授权独立检查。当前不连接外部模型，所有真实发送关闭。</p></>}</fieldset>;
}
