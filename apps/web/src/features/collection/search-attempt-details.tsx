import {safeSearchAttempts,searchAttemptLabel} from '@crm/contracts';
/** Ordinals refer to this task's stored keyword order; never render upstream text. */
export function SearchAttemptDetails({value}:{value:unknown}){
 const attempts=safeSearchAttempts(value);
 if(!attempts?.length)return null;
 return <section aria-label="搜索诊断"><h4>搜索读取</h4>{attempts.map(a=><div key={`${a.keywordOrdinal}:${a.requestStep}`}><p>第 {a.keywordOrdinal} 个关键词：{searchAttemptLabel(a)}</p>{a.observation&&<small>返回前 {a.observation.rawCount??'未知'} 项 · 笔记 {a.observation.noteCount??'未知'} · 已知非笔记 {a.observation.knownOtherCount??'未知'} · 未知类型 {a.observation.unknownCount??'未知'} · 实际返回 {a.returnedCount??'未知'} 篇；{a.observation.observations} 次本页观察，{a.observation.waitedMs} 毫秒。<br/>字段：{a.observation.selected}（value: {a.observation.valueType} / _value: {a.observation.rawValueType}）；停止：{a.observation.stop==='DEADLINE'?'等待到限':a.observation.stop==='NOTES_AVAILABLE'?'取得笔记':a.observation.stop}。{a.observation.parseIssue&&<><br/>解析位置：第 {a.observation.parseIssue.itemOrdinal} 项 · {a.observation.parseIssue.field}；预期 {a.observation.parseIssue.expected}，实际 {a.observation.parseIssue.actual}；原因 {a.observation.parseIssue.reason}。</>}未取得搜索结束证明。</small>}</div>)}</section>;
}
