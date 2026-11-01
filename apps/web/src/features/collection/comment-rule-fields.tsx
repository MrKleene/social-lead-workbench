import { FormField } from '@/components/form-field';
import { FieldSet, FieldLegend } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import './comment-rule-fields.css';
import { useState } from 'react';
import { CommentRules, thesisRulePreset } from '@crm/contracts';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
const words=(text:string)=>text.split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean);
const fields=(r:CommentRules)=>({description:r.targetDescription,professions:r.professions.map(p=>[p.name,...p.aliases].join(' | ')).join('\n'),help:r.helpExpressions.join('\n'),context:r.contextTerms.join('\n')});
export function useCommentRuleDraft(initial:CommentRules|null|undefined,newConfig:boolean){
 const initialFields=fields(initial||thesisRulePreset),initialEnabled=newConfig||!!initial;
 const [enabled,setEnabled]=useState(initialEnabled),[value,setValue]=useState(initialFields);
 const rules:CommentRules={version:1,targetDescription:value.description,professions:value.professions.split('\n').filter(l=>l.trim()).map(line=>{const [name,...aliases]=line.split('|').map(s=>s.trim()).filter(Boolean);return {name:name||'',aliases};}),helpExpressions:words(value.help),contextTerms:words(value.context)};
 return {enabled,setEnabled,value,setValue,rules,dirty:enabled!==initialEnabled||JSON.stringify(value)!==JSON.stringify(initialFields),preset:()=>setValue(fields(thesisRulePreset))};
}
export function CommentRuleFields({draft,legacy}:{draft:ReturnType<typeof useCommentRuleDraft>;legacy:boolean}){
 const set=(field:keyof typeof draft.value,value:string)=>draft.setValue(v=>({...v,[field]:value}));
 return <FieldSet className="rule-fields"><FieldLegend>评论筛选规则</FieldLegend>
 <FormField className="check-label"><Checkbox  checked={draft.enabled} onCheckedChange={e=>draft.setEnabled((e === true))}/>启用独立评论规则（保存后生效）</FormField>
 {!draft.enabled?<p className="helper-text">{legacy?'此配置沿用旧规则：评论必须包含帖子搜索词。':'当前选择兼容旧规则：评论必须包含帖子搜索词。'}不会自动升级或重放历史采集。</p>:<>
 <p className="helper-text">按词条匹配评论，非模型分析。</p>
 <FormField>目标需求说明（仅供人阅读）<Textarea aria-label="目标需求说明（仅供人阅读）" value={draft.value.description} onChange={e=>set('description',e.target.value)} maxLength={500} rows={3}/></FormField>
 <FormField>专业名与别名<Textarea aria-label="专业名与别名" value={draft.value.professions} onChange={e=>set('professions',e.target.value)} maxLength={7380} rows={5} placeholder="护理学 | 护理&#10;每行一个专业，用 | 分隔别名；最多30个专业，每个最多5个别名"/></FormField>
 <FormField>求助表达<Textarea aria-label="求助表达" value={draft.value.help} onChange={e=>set('help',e.target.value)} maxLength={1230} rows={3}/></FormField>
 <FormField>上下文主题词<Textarea aria-label="上下文主题词" value={draft.value.context} onChange={e=>set('context',e.target.value)} maxLength={1230} rows={3}/></FormField>
 <p className="helper-text">上下文不足的评论保留待核查。</p>
 <Button type="button" variant="ghost" onClick={draft.preset}>载入选题/开题预设</Button>
 </>}
 </FieldSet>;
}
