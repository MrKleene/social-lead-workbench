import {z} from 'zod';
const count=z.number().int().min(0).max(200);
const shape=z.enum(['MISSING','NULL','ARRAY','OBJECT','STRING','NUMBER','BOOLEAN','OTHER']);
export const searchParseIssueSchema=z.object({
 itemOrdinal:z.number().int().min(0).max(200),
 field:z.enum(['items','item','modelType','id','xsecToken','noteCard','noteCard.displayTitle']),
 expected:z.enum(['ARRAY','OBJECT','STRING']),actual:z.enum(['MISSING','NULL','ARRAY','OBJECT','STRING','NUMBER','BOOLEAN','INVALID_JSON']),
 reason:z.enum(['TYPE','MISSING','EMPTY','FORMAT','LENGTH','JSON']),
}).strict().superRefine((d,c)=>{
 const expected=d.field==='items'?'ARRAY':['item','noteCard'].includes(d.field)?'OBJECT':'STRING';
 if(d.expected!==expected||(d.field==='items'?d.itemOrdinal!==0:d.itemOrdinal<1)||(d.reason==='MISSING'&&d.actual!=='MISSING')||(['EMPTY','FORMAT'].includes(d.reason)&&d.actual!=='STRING'))c.addIssue({code:'custom',message:'Inconsistent parsing evidence'});
});
export const searchObservationSchema=z.object({
 version:z.literal(1),parseIssue:searchParseIssueSchema.optional(),state:z.enum(['NOTES_AVAILABLE','EMPTY_UNCONFIRMED','FILTERED_NON_NOTES','UNKNOWN_ITEM_TYPES','STATE_MISSING','FEEDS_MISSING','UNSUPPORTED_SHAPE','AMBIGUOUS_FIELDS','ROUTE_UNCONFIRMED','PAGE_LOADING','ACCESS_BLOCKED','INVALID_NOTE','RESULT_LIMIT']),
 stop:z.enum(['NOTES_AVAILABLE','DEADLINE','BLOCKED','CANCELLED','EVALUATION_FAILED','DESERIALIZATION_FAILED']),
 initialState:z.boolean(),searchState:z.boolean(),documentReady:z.boolean(),routeMatches:z.boolean(),
 valueType:shape,rawValueType:shape,selected:z.enum(['NONE','VALUE','RAW_VALUE','BOTH']),
 rawCount:count.nullable(),noteCount:count.nullable(),knownOtherCount:count.nullable(),unknownCount:count.nullable(),malformedCount:count.nullable(),acceptedCount:count,
 observations:z.number().int().min(1).max(400),waitedMs:z.number().int().min(0).max(120000),firstRawCount:count.nullable(),completionSignal:z.literal('UNSUPPORTED'),
}).strict().superRefine((d,ctx)=>{
 if(d.parseIssue&&(d.stop!=='DESERIALIZATION_FAILED'||(d.rawCount!==null&&d.parseIssue.itemOrdinal>d.rawCount)))ctx.addIssue({code:'custom',message:'Unexpected parsing evidence'});
 const counts=[d.noteCount,d.knownOtherCount,d.unknownCount,d.malformedCount];
 const invalid=()=>ctx.addIssue({code:'custom',message:'Inconsistent search evidence'});
 if(d.rawCount===null){if(counts.some(n=>n!==null)||d.acceptedCount!==0)invalid();}
 else if(counts.some(n=>n===null)||(d.noteCount??0)+(d.knownOtherCount??0)+(d.unknownCount??0)!==d.rawCount||d.malformedCount!>d.rawCount||d.acceptedCount>d.noteCount!)invalid();
 if(d.stop==='NOTES_AVAILABLE'&&(d.state!=='NOTES_AVAILABLE'||d.acceptedCount<1||d.acceptedCount!==d.noteCount||d.malformedCount!==0||!d.routeMatches||!d.documentReady||!d.searchState||!d.initialState||d.selected==='NONE'))invalid();
 if(d.stop!=='NOTES_AVAILABLE'&&d.acceptedCount!==0)invalid();
 if(d.state==='EMPTY_UNCONFIRMED'&&d.rawCount!==0)invalid();
 if(d.state==='FILTERED_NON_NOTES'&&(!(d.knownOtherCount!>0)||d.noteCount!==0||d.unknownCount!==0||d.malformedCount!==0))invalid();
 if(d.state==='UNKNOWN_ITEM_TYPES'&&(!(d.unknownCount!>0)||d.noteCount!==0||d.malformedCount!==0))invalid();
 if(d.state==='INVALID_NOTE'&&!(d.malformedCount!>0))invalid();
});
export type SearchObservation=z.infer<typeof searchObservationSchema>;
export function safeSearchObservation(v:unknown):SearchObservation|undefined{const p=searchObservationSchema.safeParse(v);return p.success?p.data:undefined;}
export const searchAttemptSchema=z.object({keywordOrdinal:z.number().int().min(1).max(10),requestStep:z.number().int().min(1).max(32),evidence:z.enum(['AVAILABLE','LEGACY_UNAVAILABLE','INVALID_DIAGNOSTIC']),returnedCount:count.nullable(),observation:searchObservationSchema.optional()}).strict().superRefine((v,c)=>{
 if((v.evidence==='AVAILABLE')!==!!v.observation||(v.observation&&v.returnedCount!==v.observation.acceptedCount))c.addIssue({code:'custom',message:'Inconsistent search attempt'});
});
export const searchAttemptsSchema=z.array(searchAttemptSchema).max(10).superRefine((rows,ctx)=>{
 if(rows.some((r,i)=>i>0&&(r.keywordOrdinal<=rows[i-1].keywordOrdinal||r.requestStep<=rows[i-1].requestStep)))ctx.addIssue({code:'custom',message:'Repeated or unordered search evidence'});
});
export type SearchAttempt=z.infer<typeof searchAttemptSchema>;
export function safeSearchAttempts(v:unknown):SearchAttempt[]|undefined{const p=searchAttemptsSchema.safeParse(v);return p.success?p.data:undefined;}
export const searchObservationLabels:Record<SearchObservation['state'],string>={
 NOTES_AVAILABLE:'已取得笔记；搜索覆盖仍未确认',EMPTY_UNCONFIRMED:'返回空列表，但尚未确认搜索加载完成',FILTERED_NON_NOTES:'当前返回内容均为已知非笔记条目',UNKNOWN_ITEM_TYPES:'返回条目类型未识别，未作为笔记读取',STATE_MISSING:'未取得搜索状态',FEEDS_MISSING:'搜索状态存在，但未取得结果字段',UNSUPPORTED_SHAPE:'搜索结果字段结构不支持',AMBIGUOUS_FIELDS:'两个结果字段不一致，未擅自选用',ROUTE_UNCONFIRMED:'尚未确认进入本次关键词的搜索页面',PAGE_LOADING:'页面仍在加载',ACCESS_BLOCKED:'页面显示访问异常，已停止',INVALID_NOTE:'返回笔记缺少有效必需字段',RESULT_LIMIT:'返回结构超出已审核读取范围',
};
export function searchAttemptLabel(a:SearchAttempt):string{return a.observation?searchObservationLabels[a.observation.state]:a.evidence==='INVALID_DIAGNOSTIC'?'搜索诊断不符合安全结构，覆盖待确认':'当前响应未提供搜索就绪证据';}
