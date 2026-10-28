import { FormField } from '@/components/form-field';
import { FieldSet, FieldLegend } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';
import type { SemanticRules } from '@crm/contracts';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export function useSemanticDraft(initial?:SemanticRules|null){
 const [enabled,setEnabled]=useState(!!initial),[target,setTarget]=useState(initial?.target||''),[threshold,setThreshold]=useState(initial?.reviewThreshold??70);
 return {enabled,setEnabled,target,setTarget,threshold,setThreshold,dirty:enabled!==!!initial||target!==(initial?.target||'')||threshold!==(initial?.reviewThreshold??70),value:enabled?{version:1 as const,target,reviewThreshold:threshold}:null};
}
export function SemanticRuleFields({draft:d}:{draft:ReturnType<typeof useSemanticDraft>}){
 return <FieldSet className="rule-fields"><FieldLegend>自然语言语义审核 · 可选</FieldLegend><FormField className="check-label"><Checkbox  checked={d.enabled} onCheckedChange={e=>d.setEnabled((e === true))}/>启用自然语言审核（保存后生效）</FormField><p className="helper-text">此处只保存自然语言目标，实际分析由运行模块的独立“LLM 语义匹配”开关控制，默认关闭。原文始终增量保存，不被关键词过滤丢弃；已存评论可独立选择重测。模型仍需配置与逐批确认，真实质量待验收，不自动联系。</p>{d.enabled&&<><FormField>目标需求（自然语言）<Textarea required minLength={10} maxLength={1500} rows={4} value={d.target} onChange={e=>d.setTarget(e.target.value)} placeholder="例如：寻找正在为毕业论文选题或开题报告求助的学生，排除提供代写服务的人。结合帖子和父评论判断，缺少语境时待核查。"/></FormField><FormField>审核优先分数<Input type="number" required min={0} max={100} value={d.threshold} onChange={e=>d.setThreshold(e.target.valueAsNumber)}/></FormField><p className="helper-text">0–100仅用于排序，不是概率。分数不能授予发送权限；去重、拒绝联系、平台状态与发送授权独立检查。Qwen须单独配置并逐批手动确认；保存规则不会调用模型，所有真实发送关闭。</p></>}</FieldSet>;
}
