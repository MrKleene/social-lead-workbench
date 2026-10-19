import { ErrorNotice } from '@/components/feedback';
import { ReplyPreview, useLeadReply } from './use-replies';
export function PreviewText({ value }: { value: ReplyPreview }) {
  return <div className="reply-preview"><p className="helper-text">{value.source || `${value.name} · ${value.channel === 'DM' ? '私信' : '评论'}`}</p><pre>{value.text}</pre>{value.missing.length > 0 && <p role="status">缺少来源字段：{value.missing.join('、')}。请人工补充事实，不会自动猜测。</p>}{value.unknown.length > 0 && <p role="alert">未知占位符：{value.unknown.join('、')}</p>}<small>仅预览文字 · 未发送 · 不会自动评论或私信</small></div>;
}
export function LeadReplyPreview({ id }: { id: string }) { const query = useLeadReply(id); return <div><ErrorNotice error={query.error}/>{query.isPending ? <p>正在读取默认话术…</p> : !query.isError && (!query.data?.length ? <p>该来源搜索设置未选择默认话术。管理员可在搜索设置中关联。</p> : query.data.map((p,i) => <PreviewText key={i} value={p}/>))}</div>; }
