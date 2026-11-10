// Explicit local initialization. No database, network, credentials import or service restart.
import {readFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vault from '../src/model-vault.cjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url))),args=process.argv.slice(2);
try{
 if(process.platform!=='darwin'||args.length!==3||args[0]!=='--instance'||args[2]!=='--confirm-create'||!/^main$/.test(args[1]))throw Error('ARGUMENTS');
 const manifest=JSON.parse(await readFile(join(root,'.local/persistent/main/instance.json'),'utf8'));
 if(manifest.root!==root||manifest.name!=='main'||manifest.mode!=='real'||manifest.fixture)throw Error('INSTANCE');
 const file=vault.vaultPath(manifest.id,await realpath(process.env.HOME));vault.initialize(file);
 console.log('主密钥已创建（不显示内容）：'+file);console.log('请单独保护备份。未配置模型Key、未修改数据库、未启动服务。');
}catch(e){console.error('未完成初始化：'+(e instanceof vault.VaultError?e.code:'INVALID_LOCAL_SETUP')+'。不会覆盖已有主密钥或修改系统权限。');process.exitCode=1;}
