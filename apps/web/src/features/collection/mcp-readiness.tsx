import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import { formatDate } from '@/lib/types';
import { useMcpReadiness, useWorkspaceMutation } from './use-collection';
import { modeLabels } from './mode';
import { reasonLabels } from './types';
export function McpReadinessPanel() {
    const query = useMcpReadiness(), check = useWorkspaceMutation();
    const state = query.data;
    return <section className="connection-banner" aria-label="只读连接状态"><Settings2 size={18}/><div>
        <strong>{query.isPending ? '正在读取服务端配置…' : query.isError ? '连接状态不可用 · 未确认接入' : state?.enabled ? `${modeLabels[state.mode!]} · 仅允许手动有限读取` : '内置模拟可用 · MCP默认关闭'}</strong>
        <p>{query.isError ? '当前 API 未提供就绪状态或暂不可用。不会自动检查平台；现有模拟仍可使用。' : state?.enabled ? '只读白名单：登录状态、搜索、帖子详情。仅返回有限评论窗口，无自动轮询、登录操作或发送。' : reasonLabels[state?.reason || 'REAL_DISABLED']}</p>
        {state?.mode === 'XHS_FIXTURE' && <p>离线服务返回虚构内容；这不代表真实小红书已连接。</p>}
        {state?.lastCheck && <p>上次手动检查 · {modeLabels[state.lastCheck.metadata.mode]} · {formatDate(state.lastCheck.createdAt)}：{reasonLabels[state.lastCheck.metadata.reason] || '检查未通过'}{state.lastCheck.metadata.nextAllowedAt && ` · 最早重试 ${formatDate(state.lastCheck.metadata.nextAllowedAt)}`}</p>}
        <ErrorNotice error={check.error}/>
    </div><Button variant="outline" disabled={!state?.enabled || check.isPending} onClick={() => check.mutate({ path: '/collection/mcp/check' })}>{check.isPending ? '检查中…' : '手动检查只读连接'}</Button></section>;
}
