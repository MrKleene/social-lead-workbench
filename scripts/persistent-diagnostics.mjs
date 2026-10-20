// Only fixed codes/messages are exposed. Never persist raw stderr, argv or env.
import {spawnSync} from 'node:child_process';
import {writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import platform from '../runtime/platform.cjs';
const messages={
 DOCKER_CLI_MISSING:'找不到 Docker 命令；请确认 Docker Desktop 已安装且命令可用，然后重试原启动命令。',
 DOCKER_DAEMON_UNAVAILABLE:'Docker 引擎不可连接；请打开 Docker Desktop，等引擎运行后重试原启动命令。无需重启电脑或再次恢复锁。',
 DOCKER_PERMISSION_DENIED:'Docker 访问被拒绝；请检查当前用户的 Docker Desktop 访问权限，不要删除实例或数据卷。',
 DOCKER_TIMEOUT:'Docker 操作超时；请确认 Docker Desktop 引擎就绪后重试。',
 DOCKER_CONTEXT_UNAVAILABLE:'Docker 上下文不可用；请检查当前 Docker Desktop 上下文配置，未自动更换上下文。',
 POSTGRES_IMAGE_MISSING:'Docker 可连接，但本地缺少 postgres:17 镜像；未自动下载镜像、创建数据库或替换数据卷。',
 REDIS_IMAGE_MISSING:'Docker 可连接，但本地缺少 redis:7-alpine 镜像；未自动下载镜像或替换数据卷。',
 DOCKER_OPERATION_FAILED:'Docker 操作失败；原数据保留。请提供此错误代码和失败阶段，原始输出已隐藏以保护凭据。',
 DOCKER_INSPECT_FAILED:'无法确认 Docker 资源是否存在；已停止，未将检查失败当作资源缺失来创建替代资源。',
 INSTANCE_MISMATCH:'原实例配置与当前目录/模式不匹配；未创建替代实例。',
 INSTANCE_METADATA_INVALID:'原实例元数据或端口/资源引用无效；请保留配置检查，未重建数据。',
 CREDENTIAL_CONFIG_INVALID:'本地数据库连接配置格式无效；内容未输出，未覆盖凭据。',
 RESOURCE_OWNERSHIP_MISMATCH:'Docker 资源归属与原实例不匹配；未接管或替换。',
 PERSISTENT_VOLUME_MISSING:'原实例数据卷不存在；拒绝创建空库，请先核查原数据卷。',
 PERSISTENT_MOUNT_MISMATCH:'原容器的数据卷挂载不匹配；未替换容器或数据卷。',
 PERSISTENT_PORT_MISMATCH:'原容器的端口映射不匹配；未改动原端口。',
 SERVICE_READINESS_TIMEOUT:'数据库或 Redis 未在期限内就绪；原数据卷保留。',
 LOCAL_COMMAND_FAILED:'本地构建或迁移命令失败；请提供失败阶段和退出码，未输出可能含凭据的子进程原始日志。',
 SERVICE_EXITED:'工作台服务意外退出；正在清理本次自有进程，原数据保留。',
 DATABASE_AUTH_FAILED:'数据库认证失败；未输出连接串或口令，未重置管理员或数据库。',
 DATABASE_UNREACHABLE:'无法连接原数据库；请确认 Docker 和原数据库容器就绪。',
 DATABASE_TIMEOUT:'连接原数据库超时；未创建替代数据库。',
 ADMIN_INITIALIZATION_REQUIRED:'原数据库没有管理员，首次初始化需要交互终端；未自动创建管理员。',
 ADMIN_UNAVAILABLE:'数据库没有启用的管理员；未自动重建或重置账号。',
 LOCAL_PERMISSION_DENIED:'本地文件或系统操作权限不足；未修改权限或覆盖原配置。',
 LOCAL_FILE_MISSING:'当前阶段需要的本地文件不存在；未创建替代实例，请保留目录检查。',
 LOCAL_STORAGE_FULL:'本地存储空间不足；请释放空间后重试，原数据保留。',
 LOCAL_CONFIG_INVALID:'当前阶段的本地 JSON 配置无效；未覆盖原配置。',
 LOCAL_PATH_UNSAFE:'本地目录或文件不符合私有目录要求；未修改已有权限。',
 INSTANCE_LOCK_CONFLICT:'实例锁冲突；没有覆盖锁或接管已有服务。',
 STARTUP_INTERRUPTED:'启动收到停止请求；保留原实例和数据。',
 STARTUP_FAILED:'当前阶段执行失败；请提供错误代码和失败阶段。原始错误未输出，以免暴露凭据。'
};
const stages={local:'本地目录检查',lock:'实例锁核验',docker:'Docker 引擎检查',images:'本地镜像检查',instance:'原实例配置检查',credentials:'本地数据库配置检查',volumes:'原数据卷检查',containers:'原容器检查/启动',readiness:'数据库/Redis就绪检查',generate:'Prisma客户端生成',migrate:'原数据库迁移',build:'本地工作区构建',admin:'原管理员检查',services:'工作台服务启动/运行',cleanup:'本次资源退出清理'};
export class StartupError extends Error{constructor(code,exitCode){super(code);this.code=code;if(Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255)this.exitCode=exitCode;}}
function dockerFailure(result,fallback='DOCKER_OPERATION_FAILED'){
 const text=typeof result.stderr==='string'?result.stderr.slice(0,16384):'';
 if(result.error?.code==='ENOENT')return 'DOCKER_CLI_MISSING';
 if(result.error?.code==='ETIMEDOUT')return 'DOCKER_TIMEOUT';
 if(['EACCES','EPERM'].includes(result.error?.code)||/permission denied|access is denied/i.test(text))return 'DOCKER_PERMISSION_DENIED';
 if(/context .* (not found|does not exist)|unable to resolve docker endpoint/i.test(text))return 'DOCKER_CONTEXT_UNAVAILABLE';
 if(/cannot connect|is the docker daemon running|connection refused|failed to connect|docker.*pipe.*cannot find/i.test(text))return 'DOCKER_DAEMON_UNAVAILABLE';
 return fallback;
}
export function createDocker(env,run=spawnSync){
 const invoke=(args,extra={})=>run('docker',args,{env:{...env,...extra},encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
 const execute=(args,extra={})=>{const r=invoke(args,extra);if(r.status!==0)throw new StartupError(dockerFailure(r),r.status);return r.stdout.trim();};
 return {execute,
  ready(){execute(['info','--format','{{.ServerVersion}}']);},
  image(image){const r=invoke(['image','inspect','--format','{{.Id}}',image]);if(r.status!==0){const missing=/no such image/i.test(r.stderr||'');throw new StartupError(dockerFailure(r,missing?(image==='postgres:17'?'POSTGRES_IMAGE_MISSING':'REDIS_IMAGE_MISSING'):'DOCKER_OPERATION_FAILED'),r.status);}},
  exists(type,id){const r=invoke([type==='volume'?'volume':'container','inspect',id]);if(r.status===0)return true;const missing=type==='volume'?/no such volume/i:/no such (container|object)/i;if(!r.error&&missing.test(r.stderr||'')&&dockerFailure(r)==='DOCKER_OPERATION_FAILED')return false;throw new StartupError(dockerFailure(r,'DOCKER_INSPECT_FAILED'),r.status);}
 };
}
const knownErrors={
 'Instance mismatch':'INSTANCE_MISMATCH','Invalid instance metadata':'INSTANCE_METADATA_INVALID','Invalid saved port':'INSTANCE_METADATA_INVALID','Invalid resource reference':'INSTANCE_METADATA_INVALID','Invalid local database credential':'CREDENTIAL_CONFIG_INVALID','Resource ownership mismatch':'RESOURCE_OWNERSHIP_MISMATCH','Existing persistent volume missing; refusing to silently create an empty database':'PERSISTENT_VOLUME_MISSING','Persistent mount mismatch':'PERSISTENT_MOUNT_MISMATCH','Port mapping mismatch':'PERSISTENT_PORT_MISMATCH','Readiness timeout':'SERVICE_READINESS_TIMEOUT','First startup requires interactive administrator initialization':'ADMIN_INITIALIZATION_REQUIRED','Administrator initialization incomplete':'ADMIN_UNAVAILABLE','Stopped':'STARTUP_INTERRUPTED','Unsafe local directory':'LOCAL_PATH_UNSAFE','UNSAFE_PRIVATE_DIRECTORY':'LOCAL_PATH_UNSAFE','UNSAFE_PRIVATE_FILE':'LOCAL_PATH_UNSAFE'
};
const codeErrors={P1000:'DATABASE_AUTH_FAILED',P1001:'DATABASE_UNREACHABLE',P1002:'DATABASE_TIMEOUT',EACCES:'LOCAL_PERMISSION_DENIED',EPERM:'LOCAL_PERMISSION_DENIED',ENOENT:'LOCAL_FILE_MISSING',ENOSPC:'LOCAL_STORAGE_FULL',EEXIST:'INSTANCE_LOCK_CONFLICT'};
export function diagnostic(error,stage){
 const code=error instanceof StartupError&&Object.hasOwn(messages,error.code)?error.code:(Object.hasOwn(codeErrors,error?.code)?codeErrors[error.code]:undefined)||(Object.hasOwn(knownErrors,error?.message)?knownErrors[error.message]:undefined)||(error instanceof SyntaxError?'LOCAL_CONFIG_INVALID':'STARTUP_FAILED');
 const value={kind:'crm-startup-failure-v1',code,stage:Object.hasOwn(stages,stage)?stage:'local',message:messages[code]};
 if(error instanceof StartupError&&Number.isInteger(error.exitCode)&&error.exitCode>=0&&error.exitCode<=255)value.exitCode=error.exitCode;
 return value;
}
export function diagnosticText(value){return `启动失败 [${value.code}] 阶段：${stages[value.stage]}${value.exitCode===undefined?'':`；退出码：${value.exitCode}`}。${value.message}`;}
export async function saveDiagnostic(directory,value){
 // Re-whitelist input; no arbitrary properties can leak to disk.
 const record=diagnostic(new StartupError(value.code,value.exitCode),value.stage);record.at=new Date().toISOString();
 const file=join(directory,'last-failure.json'),temporary=file+'.'+randomUUID()+'.tmp';
 try{await platform.privateFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(temporary,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});try{await rename(temporary,file);}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
