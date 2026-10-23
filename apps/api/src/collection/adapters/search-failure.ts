import {searchFailureEnvelopeSchema,type CollectionDiagnostic} from '@crm/contracts';
/** Inspect in memory only. Never retain arbitrary upstream error text. */
export function searchFailureReason(text:string):NonNullable<CollectionDiagnostic['searchReason']>{
 try{const p=searchFailureEnvelopeSchema.safeParse(JSON.parse(text));if(p.success)return p.data.crmSearchFailure.reason;}catch{/* Old MCP uses plain text. */}
 // Narrow compatibility with the reviewed older source, not arbitrary guessed keywords.
 if(text==='搜索Feeds失败: 没有捕获到 feeds 数据')return 'SEARCH_DATA_MISSING';
 if(text.startsWith('搜索Feeds失败: 等待搜索页面初始数据失败: '))return 'PAGE_NOT_READY';
 if(text.startsWith('搜索Feeds失败: failed to unmarshal feeds: '))return 'DESERIALIZATION_FAILED';
 return 'UNKNOWN';
}
