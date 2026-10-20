import { describe, it, expect } from 'vitest';
import { runRequest, sourceModeLabel, shouldRefreshRun } from './mode';
describe('来源模式与有限运行', () => {
    it('模拟保持验收场景，MCP永远使用真实读取窗口场景', () => {
        expect(runRequest({mode:'MOCK'},'NEW','key')).toEqual({mode:'MOCK',scenario:'NEW',requestKey:'key'});
        for(const mode of ['XHS_FIXTURE','XHS_MCP'] as const) expect(runRequest({mode},'NEW','key').scenario).toBe('READ_WINDOW');
    });
    it('只刷新三分钟内的本地活动任务，不自动再次采集', () => {
        const now = Date.now();
        const config = (age:number,status='RUNNING') => ({activeRunId:'run',runs:[{id:'run',status,createdAt:new Date(now-age).toISOString(),scenario:'READ_WINDOW',reason:null,requests:0,observed:0,matched:0,added:0,notices:0,finishedAt:null}]});
        expect(shouldRefreshRun(config(1000),now)).toBe(true);
        expect(shouldRefreshRun(config(181000),now)).toBe(false);
        expect(shouldRefreshRun(config(1000,'PARTIAL'),now)).toBe(false);
        expect(shouldRefreshRun({...config(1000),activeRunId:null},now)).toBe(false);
    });
    it('模拟、离线夹具和平台来源清楚区分', () => {
        expect(sourceModeLabel('fixture-xhs-u',true)).toContain('离线MCP夹具');
        expect(sourceModeLabel('demo-collect-u',true)).toBe('虚构模拟');
        expect(sourceModeLabel('abc',false)).toContain('平台来源');
    });
});
