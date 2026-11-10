import { Assessment, CommentRules, RuleEvidence } from '@crm/contracts';
import type { Comment, Post } from './contract';
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase();
function contains(text:string,term:string){const t=normalize(term),s=normalize(text);if(/^[a-z0-9]+$/.test(t))return new RegExp(`(^|[^a-z0-9])${t}($|[^a-z0-9])`).test(s);return s.includes(t);}
const provider=/代写|代做|接单|接稿|承接|包过|保过|有偿|收费|加我|私我|联系我|我可以帮|我能帮|提供.{0,8}(辅导|指导|选题)|帮你.{0,8}(选题|开题)|可辅导/;
const negated=/不需要|无需|不用.{0,8}(帮|指导|选题)|不想.{0,8}(写|选题)|不求|不再需要|已[经]*解决|已[经]*完成|写完了|非求助|不是.{0,10}(求助|专业|护理|会计|学前|法学|论文|开题|选题)|非.{0,8}专业/;
const unrelated=/招聘|求职|找工作|工资|薪资|旅游攻略|游戏攻略|买房|租房/;
function evidence(source:RuleEvidence['source'],text:string,terms:string[]):RuleEvidence{return {source,terms,excerpt:text.slice(Math.max(0,normalize(text).indexOf(normalize(terms[0]||''))-70),Math.max(0,normalize(text).indexOf(normalize(terms[0]||''))-70)+240)};}
/** Bounded, explicit rules. Description/search terms never enter evaluation. */
export function assessComment(comment:Comment,post:Post,parent:Comment|undefined,rules:CommentRules,exclude:string[]):Assessment{
 const text=normalize(comment.text),missingParent=!!comment.parentId&&!parent;
 const professions=rules.professions.filter(p=>[p.name,...p.aliases].some(t=>contains(text,t)));
 const professionHits=professions.flatMap(p=>[p.name,...p.aliases].filter(t=>contains(text,t)));
 const helpHits=rules.helpExpressions.filter(t=>contains(text,t));
 const ownHits=[...new Set([...professionHits,...helpHits])];
 const contexts:[RuleEvidence['source'],string][]=[['COMMENT',comment.text],['POST_TITLE',post.title],['POST_BODY',post.body||''],['PARENT_COMMENT',parent?.text||'']];
 const contextEvidence=contexts.flatMap(([source,value])=>{const hits=rules.contextTerms.filter(t=>contains(value,t));return hits.length?[evidence(source,value,hits)]:[];});
 const result:Assessment={version:1,classification:'NO_MATCH',reason:'NO_SIGNAL',keywords:ownHits,professions:professions.map(p=>p.name),parentAvailable:!!parent,contextAvailable:contextEvidence.length>0,evidence:ownHits.length?[evidence('COMMENT',comment.text,ownHits)]:[]};
 const reject=(reason:string,terms:string[]=[])=>({...result,reason,evidence:terms.length?[...result.evidence,evidence('COMMENT',comment.text,terms)]:result.evidence});
 const exclusions=exclude.filter(t=>contains(text,t));if(exclusions.length)return reject('EXCLUDED',exclusions);
 if(provider.test(text))return reject('PROVIDER',text.match(provider)||[]);
 if(negated.test(text))return reject('NEGATED',text.match(negated)||[]);
 if(unrelated.test(text))return reject('UNRELATED',text.match(unrelated)||[]);
 if(!ownHits.length)return result;
 const conflicting=contexts.slice(1).find(([,value])=>unrelated.test(normalize(value)));
 if(conflicting)return {...result,reason:'UNRELATED_CONTEXT',evidence:[...result.evidence,evidence(conflicting[0],conflicting[1],normalize(conflicting[1]).match(unrelated)||[])]};
 const deniedContext=contexts.slice(1).find(([,value])=>negated.test(normalize(value)));
 if(deniedContext)return {...result,classification:'NEEDS_REVIEW',reason:'CONTEXT_NEGATED',evidence:[...result.evidence,evidence(deniedContext[0],deniedContext[1],normalize(deniedContext[1]).match(negated)||[])]};
 result.evidence.push(...contextEvidence);
 if(missingParent)return {...result,classification:'NEEDS_REVIEW',reason:'PARENT_MISSING'};
 if(!contextEvidence.length)return {...result,classification:'NEEDS_REVIEW',reason:'CONTEXT_INSUFFICIENT'};
 return {...result,classification:'HIGH_RELEVANT',reason:professions.length?'PROFESSION_CONTEXT':'HELP_CONTEXT'};
}
