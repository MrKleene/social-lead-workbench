import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import platform from '../runtime/platform.cjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
if(process.platform==='win32'){
 if(!platform.platformCapability().supported)throw Error('Windows 11 x64 native Node is required; ARM64/WSL/Windows Server are not validated');
 const system=process.env.SystemRoot||process.env.SYSTEMROOT;if(!system)throw Error('Missing Windows system directory');
 const compiler=join(system,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 if(!lstatSync(compiler).isFile())throw Error('Built-in .NET Framework compiler unavailable; nothing installed');
 const directory=join(root,'apps/api/dist/native'),source=join(root,'native/windows/WindowsHost.cs'),desktopSource=join(root,'native/windows/WindowsDesktop.cs'),binary=join(directory,'windows-host.exe'),stamp=join(directory,'windows-build.json');
 mkdirSync(directory,{recursive:true});
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');let unchanged=false;
 try{const saved=JSON.parse(readFileSync(stamp,'utf8'));unchanged=!lstatSync(binary).isSymbolicLink()&&saved.source===hash(source)&&saved.desktopSource===hash(desktopSource)&&saved.binary===hash(binary);}catch{}
 if(!unchanged){const r=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Security.dll','/reference:System.Web.Extensions.dll',`/out:${binary}`,source,desktopSource],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('Windows host build failed; no fallback');writeFileSync(stamp,JSON.stringify({source:hash(source),desktopSource:hash(desktopSource),binary:hash(binary)}));}
}else console.log('Windows host build skipped on this OS; Windows native validation remains pending.');
