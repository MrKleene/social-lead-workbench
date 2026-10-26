/** Safe diagnostics only: never interpolate model text, IDs, quotes or schema issues. */
const messages={
 OUTPUT_JSON_INVALID:'模型内容不是有效 JSON',
 OUTPUT_STRUCTURE_INVALID:'返回结构、字段类型或取值不符合要求',
 OUTPUT_COUNT_INVALID:'返回条数不符合本次批次要求',
 OUTPUT_ID_INVALID:'临时条目标识的类型或长度不符合要求',
 OUTPUT_ID_DUPLICATE:'临时条目标识重复',
 OUTPUT_ID_UNKNOWN:'临时条目标识不属于本次批次',
 OUTPUT_ID_MISSING:'缺少本次批次要求的临时条目标识',
 OUTPUT_REASON_INVALID:'理由必须是 1–1000 字符的非空文本',
 OUTPUT_EVIDENCE_INVALID:'证据结构或条数不符合要求',
 OUTPUT_EVIDENCE_SOURCE_INVALID:'证据来源不在允许范围内',
 OUTPUT_EVIDENCE_QUOTE_INVALID:'证据引用必须是 1–500 字符的文本',
 OUTPUT_COMMENT_EVIDENCE_MISSING:'缺少来自评论原文的证据',
 OUTPUT_EVIDENCE_NOT_EXACT:'证据引用并非对应外发原文中的逐字片段',
 OUTPUT_CONTEXT_REDACTION_MARKER:'证据引用了上下文脱敏占位符',
} as const;
export type ModelOutputFailureCode=keyof typeof messages;
export function modelOutputFailureCode(code:ModelOutputFailureCode,itemIndex?:number){
 return code+(typeof itemIndex==='number'&&Number.isInteger(itemIndex)&&itemIndex>=1&&itemIndex<=5?`_ITEM_${itemIndex}`:'');
}
export function modelOutputFailure(code:string|null|undefined){
 const match=/^(OUTPUT_[A-Z_]+?)(?:_ITEM_([1-5]))?$/.exec(code||'');
 if(!match||match[0]!==code||!Object.hasOwn(messages,match[1]))return null;
 return {code:match[1] as ModelOutputFailureCode,itemIndex:match[2]?Number(match[2]):null,message:messages[match[1] as ModelOutputFailureCode]};
}
export function outputFailureReason(code:string|null|undefined){
 const failure=modelOutputFailure(code);if(!failure)return null;
 return `模型输出校验未通过（${code}）：${failure.itemIndex?`模型返回第 ${failure.itemIndex} 条：`:''}${failure.message}。本批整体未采纳，不代表每条评论均独立校验失败；未生成评分，不自动重试。`;
}
export function isBatchOutputFailure(reason:string|null|undefined){return /\bINVALID_EVIDENCE\b/.test(reason||'')||!!modelOutputFailure(reason?.match(/\bOUTPUT_[A-Z_]+(?:[1-5])?\b/)?.[0]);}
export function displayReviewFailure(reason:string|null|undefined){
 if(/\bINVALID_EVIDENCE\b/.test(reason||''))return '模型输出校验未通过（INVALID_EVIDENCE）。旧记录未保存具体原因，无法确定失败条目或校验分支。本批整体未采纳，不代表每条评论均独立校验失败。';
 return reason||'未获得可用评估结果。';
}
