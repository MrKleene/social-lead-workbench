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
 return <fieldset className="rule-fields"><legend>评论筛选规则</legend>
 <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={e=>draft.setEnabled(e.target.checked)}/>启用独立评论规则（保存后生效）</label>
 {!draft.enabled?<p className="helper-text">{legacy?'此配置沿用旧规则：评论必须包含帖子搜索词。':'当前选择兼容旧规则：评论必须包含帖子搜索词。'}不会自动升级或重放历史采集。</p>:<>
 <p className="helper-text">帖子搜索词只用于找帖子。以下词条独立判断评论；这是可解释规则，不是 AI 语义理解。“高相关”也须人工核验，不代表已同意联系。</p>
 <label>目标需求说明（仅供人阅读）<Textarea aria-label="目标需求说明（仅供人阅读）" value={draft.value.description} onChange={e=>set('description',e.target.value)} maxLength={500} rows={3}/></label>
 <label>专业名与别名<Textarea aria-label="专业名与别名" value={draft.value.professions} onChange={e=>set('professions',e.target.value)} maxLength={7380} rows={5} placeholder="护理学 | 护理&#10;每行一个专业，用 | 分隔别名；最多30个专业，每个最多5个别名"/></label>
 <label>求助表达<Textarea aria-label="求助表达" value={draft.value.help} onChange={e=>set('help',e.target.value)} maxLength={1230} rows={3}/></label>
 <label>上下文主题词<Textarea aria-label="上下文主题词" value={draft.value.context} onChange={e=>set('context',e.target.value)} maxLength={1230} rows={3}/></label>
 <p className="helper-text">只检查已获取的帖子标题/正文、当前评论及直接上级评论；主题或上级评论缺失时进入待核查。否定、无关用途及服务提供表达按固定保守规则过滤；未列出的专业不会被猜测。</p>
 <Button type="button" variant="ghost" onClick={draft.preset}>载入选题/开题预设</Button>
 </>}
 </fieldset>;
}
