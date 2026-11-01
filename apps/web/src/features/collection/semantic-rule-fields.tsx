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
 return <FieldSet className="rule-fields"><FieldLegend>自然语言语义审核 · 可选</FieldLegend><FormField className="check-label"><Checkbox  checked={d.enabled} onCheckedChange={e=>d.setEnabled((e === true))}/>启用自然语言审核（保存后生效）</FormField><p className="helper-text">仅保存审核目标；模型调用需另行启用与授权。</p>{d.enabled&&<><FormField>目标需求（自然语言）<Textarea required minLength={10} maxLength={1500} rows={4} value={d.target} onChange={e=>d.setTarget(e.target.value)} placeholder="例如：寻找正在为毕业论文选题或开题报告求助的学生，排除提供代写服务的人。结合帖子和父评论判断，缺少语境时待核查。"/></FormField><FormField>审核优先分数<Input type="number" required min={0} max={100} value={d.threshold} onChange={e=>d.setThreshold(e.target.valueAsNumber)}/></FormField><p className="helper-text">排序分 0–100，不代表概率或发送授权。</p></>}</FieldSet>;
}
