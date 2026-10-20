import type { Config, ConfigDraft } from './types';
export const modeLabels = { MOCK: '内置模拟', XHS_FIXTURE: '离线MCP夹具', XHS_MCP: '小红书只读' } as const;
export function runRequest(config: Pick<ConfigDraft, 'mode'>, scenario: string, requestKey: string) {
    return { mode: config.mode, scenario: config.mode === 'MOCK' ? scenario : 'READ_WINDOW', requestKey };
}
export function sourceModeLabel(platformUserId: string, isDemo: boolean) {
    return platformUserId.startsWith('fixture-xhs-') ? '离线MCP夹具 · 虚构' : isDemo ? '虚构模拟' : '平台来源 · 待人工核验';
}

export function shouldRefreshRun(config: Pick<Config, 'activeRunId' | 'runs'>, now: number) {
    const run = config.runs.find(r => r.id === config.activeRunId);
    const elapsed = now - Date.parse(run?.createdAt || '');
    return !!run && ['QUEUED','RUNNING'].includes(run.status) && elapsed >= 0 && elapsed < 180000;
}
