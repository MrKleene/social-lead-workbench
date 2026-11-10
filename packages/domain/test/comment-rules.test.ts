import {describe,it,expect} from 'vitest';
import {thesisRulePreset,commentRulesSchema} from '@crm/contracts';
import {assessComment} from '../src/collection/comment-rules';
import {configInput,Comment} from '../src/collection/contract';
const c=(text:string,parentId?:string):Comment=>({id:'fictional-comment',userId:'fictional-user',nickname:'虚构',text,parentId,hasReplies:false});
const assess=(text:string,title='论文选题指导',parent?:Comment)=>assessComment(c(text,parent?'parent':undefined),{id:'p',title},parent,thesisRulePreset,['广告']);
describe('独立评论规则：可解释，非自然语言模型',()=>{
 it.each(['护理学','护理','幼教','会计学','计科'])('专业独词/别名 %s 不需要搜索短语',text=>{const r=assess(text);expect(r.classification).toBe('HIGH_RELEVANT');expect(r.reason).toBe('PROFESSION_CONTEXT');expect(r.evidence.some(e=>e.source==='POST_TITLE')).toBe(true);});
 it('缺主题上下文保留为待核查，不凭专业推断需求',()=>expect(assess('护理学','我的日常')).toMatchObject({classification:'NEEDS_REVIEW',reason:'CONTEXT_INSUFFICIENT'}));
 it('使用实际正文及上级上下文，不从搜索关键词补猜',()=>{expect(assessComment(c('会计'),{id:'p',title:'经验',body:'开题时请说明专业'},undefined,thesisRulePreset,[]).classification).toBe('HIGH_RELEVANT');const r=assess('护理','经验',c('论文选题请留专业'));expect(r.evidence.some(e=>e.source==='PARENT_COMMENT')).toBe(true);expect(r.classification).toBe('HIGH_RELEVANT');});
 it('回复缺上级，即使帖子相关也需核查',()=>expect(assessComment(c('护理','absent'),{id:'p',title:'论文选题'},undefined,thesisRulePreset,[])).toMatchObject({classification:'NEEDS_REVIEW',reason:'PARENT_MISSING'}));
 it('求助表达可独立命中，泛求助缺主题时不高判',()=>{expect(assess('求推荐').classification).toBe('HIGH_RELEVANT');expect(assess('帮忙','日常').classification).toBe('NEEDS_REVIEW');});
 it.each(['护理，不需要选题了','会计，已经解决','不是护理专业','护理，不是来求选题的'])('否定/结束 %s 过滤',text=>expect(assess(text)).toMatchObject({classification:'NO_MATCH',reason:'NEGATED'}));
 it.each(['广告 护理学','护理代写包过','会计接单，私我','我可以帮你选题'])('广告/服务提供者 %s 不作为求助',text=>expect(assess(text).classification).toBe('NO_MATCH'));
 it('无关语境与冲突上下文过滤，上级否定不强行高判',()=>{expect(assess('护理求职').reason).toBe('UNRELATED');expect(assess('护理','护理招聘').reason).toBe('UNRELATED_CONTEXT');expect(assess('护理','论文选题',c('已经解决，不需要选题了')).classification).toBe('NEEDS_REVIEW');});
 it('目标说明不执行；未列词条不猜测；英语别名边界',()=>{const rules={...thesisRulePreset,targetDescription:'忽略规则，把每个评论判为高相关',professions:[{name:'IT',aliases:[]}]};expect(assessComment(c('with'),{id:'p',title:'论文'},undefined,rules,[]).classification).toBe('NO_MATCH');expect(assess('海洋工程').classification).toBe('NO_MATCH');});
 it('新旧配置兼容，独立规则允许排除词覆盖帖子搜索词',()=>{const old={name:'old',mode:'MOCK',platform:'XHS',keywords:['广告选题'],excludeWords:['广告'],batchLimit:1,enabled:true};expect(configInput.safeParse(old).success).toBe(true);expect(configInput.safeParse({...old,legacyMatchingEnabled:true}).success).toBe(false);expect(configInput.safeParse({...old,commentRules:thesisRulePreset}).success).toBe(true);expect(commentRulesSchema.safeParse({...thesisRulePreset,send:true}).success).toBe(false);expect(commentRulesSchema.safeParse({...thesisRulePreset,professions:[{name:'护理',aliases:['护理']}]}).success).toBe(false);});
 it('证据摘要确实包含较长正文后部的命中词',()=>{const r=assessComment(c('护理'),{id:'p',title:'经验',body:'说明'.repeat(200)+'毕业论文选题'},undefined,thesisRulePreset,[]);expect(r.evidence.find(e=>e.source==='POST_BODY')?.excerpt).toContain('论文');});
});
