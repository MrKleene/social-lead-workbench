import type {Config, McpReadiness} from '@/features/collection/types';
export type Preflight = 'loading'|'keywords'|'paused'|'backoff'|'running'|'unavailable'|'account'|'device'|'ready';
/** Local checks never log in or call a platform. The backend revalidates at execution. */
export function collectionPreflight(config:Config|undefined, readiness:McpReadiness|undefined, loading=false, now=Date.now()):Preflight {
 if(loading)return 'loading';
 if(!config||!config.keywords.some(w=>w.trim()))return 'keywords';
 if(config.activeRunId)return 'running';
 if(!config.enabled)return 'paused';
 if(config.nextAllowedAt&&Date.parse(config.nextAllowedAt)>now)return 'backoff';
 if(readiness?.captureArchiveVersion!==1)return 'unavailable';
 if(config.mode==='MOCK')return 'ready';
 if(!readiness.enabled||readiness.mode!==config.mode||!readiness.accountBound)return 'unavailable';
 if(!readiness.accounts?.some(a=>a.eligible))return 'account';
 if(!readiness.device?.online)return 'device';
 return 'ready';
}
export const preflightText:Record<Preflight,string>={loading:'正在读取本地配置与账号状态…',keywords:'先保存你的搜索关键词，下次直接复用。',paused:'所选配置已暂停；请核查原因后在设置中恢复。',backoff:'当前处于退避期；等待后手动重试，不自动换号。',running:'已有任务正在运行，查看本轮进度。',unavailable:'当前采集服务或模式未就绪；不会启动平台读取。',account:'需要至少一个当前已核验可用账号，仅补充登录或恢复会话。',device:'执行设备尚未在线或批准，请到账号中心处理。',ready:'关键词已就绪。启动前确认本轮账号授权；模型不是采集门槛。'};
