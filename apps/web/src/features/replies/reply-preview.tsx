import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorNotice } from '@/components/feedback';
import { ReplyPreview, useLeadReply } from './use-replies';
export function PreviewText({ value }: { value: ReplyPreview }) {
  return <div className="reply-preview"><p className="helper-text">{value.source || `${value.name} · ${value.channel === 'DM' ? '私信' : '评论'}`}</p><pre>{value.text}</pre>{value.missing.length > 0 && <p role="status">缺少来源字段：{value.missing.join('、')}。请人工补充事实，不会自动猜测。</p>}{value.unknown.length > 0 && <Alert role="alert"><AlertDescription>未知占位符：{value.unknown.join('、')}</AlertDescription></Alert>}<small>预览 · 未发送</small></div>;
}
export function LeadReplyPreview({ id }: { id: string }) { const query = useLeadReply(id); const previews = query.data?.filter((item, index, items) => items.findIndex(other => other.source === item.source && other.name === item.name && other.channel === item.channel && other.text === item.text) === index); return <div><ErrorNotice error={query.error}/>{query.isPending ? <p>正在读取默认话术…</p> : !query.isError && (!query.data?.length ? <p>该来源搜索设置未选择默认话术。管理员可在搜索设置中关联。</p> : previews?.map((p,i) => <PreviewText key={i} value={p}/>))}</div>; }
