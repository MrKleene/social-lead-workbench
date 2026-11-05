import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorNotice } from '@/components/feedback';
import { ReplyPreview } from './use-replies';
export function PreviewText({ value }: { value: ReplyPreview }) {
  return <div className="reply-preview"><p className="helper-text">{value.source || `${value.name} · ${value.channel === 'DM' ? '私信' : '评论'}`}</p><pre>{value.text}</pre>{value.missing.length > 0 && <p role="status">缺少来源字段：{value.missing.join('、')}。请人工补充事实，不会自动猜测。</p>}{value.unknown.length > 0 && <Alert role="alert"><AlertDescription>未知占位符：{value.unknown.join('、')}</AlertDescription></Alert>}<small>预览 · 未发送</small></div>;
}
