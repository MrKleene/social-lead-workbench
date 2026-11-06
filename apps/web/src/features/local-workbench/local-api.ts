export type ConfigurationKind='KEYWORDS'|'MATCHING'|'COMMENT_TEMPLATE'|'DM_TEMPLATE';
export type LocalConfiguration={id:string;kind:ConfigurationKind;name:string;body:{keywords?:string[];excludeWords?:string[];text?:string};revision:number};
export type LocalStatus={initialized:boolean;storage:'SQLITE';loginRequired:false;modelKeyConfigured:boolean;credentialsAvailable:boolean;platform:{ready:boolean;reason:string}};
export type LocalJob={id:string;kind:string;state:string;created_at:number};
type Methods={status:LocalStatus;initialize:{initialized:true};configurations:LocalConfiguration[];saveConfiguration:{id:string};archiveConfiguration:{ok:true};saveModelKey:{configured:true};jobs:LocalJob[];accounts:unknown[];messages:unknown[];markRead:{updated:boolean};backup:{saved:boolean;name:string};restore:{cancelled?:boolean;restored?:boolean;name?:string;activated?:false}};
type Result<T>={ok:true;data:T}|{ok:false;error:string};
declare global {interface Window{localWorkbench?:{[K in keyof Methods]:(input?:unknown)=>Promise<Result<Methods[K]>>}}}
const messages:Record<string,string>={INVALID_KEYWORDS:'每组支持 1–100 条关键词，每条最多 40 个字。',CONFIGURATION_CHANGED:'配置已在其他操作中变化，请刷新后再保存。',INVALID_CONFIGURATION:'请填写名称和有效内容。',BACKUP_REQUIRES_IDLE:'请先结束正在执行或排队的任务，再备份。',OS_CREDENTIAL_PROTECTION_UNAVAILABLE:'系统凭据保护尚未就绪，密钥未保存。',INVALID_MODEL_KEY:'密钥格式不正确，请检查后重试。',LOCAL_OPERATION_FAILED:'本地操作失败，原数据已保留。'};
export async function localApi<K extends keyof Methods>(method:K,input?:unknown):Promise<Methods[K]>{
 const bridge=window.localWorkbench;if(!bridge)throw new Error('请从桌面应用打开本地工作台。');
 const result=await bridge[method](input);if(!result.ok)throw new Error(messages[result.error]||'本地操作未完成：'+result.error);return result.data;
}
