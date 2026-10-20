import { Injectable } from '@nestjs/common';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, readdir, statfs, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { userInfo } from 'node:os';
import { deviceVault } from './device-vault';
export type DeviceCapability = { os: string; supported: boolean; adapter: 'mac-local-v1' | 'unsupported'; remote: false };
export type DeviceIdentity = { id:string; keyId:string; publicKey:string; provider:string };
// A local execution adapter. No HTTP device enrollment/heartbeat endpoint is exposed.
// Windows/remote transports must implement this boundary with their own verified adapter.
export interface ExecutionAdapter {
  capability():DeviceCapability;
  prove(identity:DeviceIdentity, challenge:Buffer):Promise<Buffer>;
  validateRoot(path:string, create:boolean, empty?:boolean):Promise<string>;
}
@Injectable()
export class LocalDeviceRuntime implements ExecutionAdapter {
  capability():DeviceCapability { return {os:process.platform==='darwin'?'macOS':process.platform==='win32'?'Windows':process.platform,supported:process.platform==='darwin'&&process.arch==='arm64',adapter:process.platform==='darwin'&&process.arch==='arm64'?'mac-local-v1':'unsupported',remote:false}; }
  enabled(){return process.env.CRM_DEVICE_MANAGEMENT==='1';}
  provider(){return process.env.XHS_ACCOUNT_LOGIN_MODE==='offline'?'offline':'real';}
  id(){const id=process.env.CRM_DEVICE_ID;if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('设备配置无效');return id;}
  instance(){const p=process.env.CRM_INSTANCE_DIRECTORY||'',root=process.env.CRM_PROJECT_ROOT||'';if(!isAbsolute(p)||normalize(p)!==p||!p.startsWith(root+'/.local/')||!root.startsWith('/'))throw Error('执行机目录配置无效');return p;}
  legacyBase(){return join(this.instance(),'credential-roots');}
  applicationBase(){return join(userInfo().homedir,'Library','Application Support','SocialLeadWorkbench','devices',this.id());}
  allowedBase(){return this.provider()==='offline'?this.legacyBase():join(this.applicationBase(),'credential-roots');}
  keyProtection(){return this.provider()==='offline'?'offline-fixture':'macos-login-keychain';}
  async identityProtection(identity:DeviceIdentity){
    const key=await this.readIdentityFile(identity);
    return key.kind==='crm-device-key-v2'?'macos-login-keychain':'legacy-private-file';
  }
  defaultRoot(){return join(this.allowedBase(),'default');}
  private async privateDir(path:string,create=false){
    if(create)await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const st=await lstat(path);if(st.isSymbolicLink()||!st.isDirectory()||st.uid!==process.getuid!()||(st.mode&0o077)||await realpath(path)!==path)throw Error('目录必须归属执行机用户、私有且不能是符号链接');
  }
  async validateRoot(path:string,create=false,empty=false){
    if(!this.capability().supported)throw Error('当前仅支持 macOS ARM64 执行适配器');
    const base=path.startsWith(this.legacyBase()+'/')?this.legacyBase():this.allowedBase();
    if(!isAbsolute(path)||normalize(path)!==path||!path.startsWith(base+'/')||! /^[A-Za-z0-9_-]{1,60}$/.test(path.slice(base.length+1)))throw Error('目录必须是执行机允许区域下的独立子目录');
    if(/\/(?:Volumes|Network|Shared|Public|CloudStorage|Mobile Documents|Dropbox[^/]*|OneDrive[^/]*|Google Drive[^/]*|iCloudDrive)(?:\/|$)/i.test(path))throw Error('不允许共享盘或同步目录');
    const root=process.env.CRM_PROJECT_ROOT!;if(await realpath(root)!==root)throw Error('执行机项目路径必须规范化');
    let p=join(root,'.local');await this.privateDir(p);
    for(const part of this.instance().slice(p.length+1).split('/')){p=join(p,part);await this.privateDir(p);}
    // macOS APFS only in v1: unknown/network filesystems are not silently trusted.
    if((await statfs(this.instance())).type!==26)throw Error('首版仅验证本地 APFS，其他文件系统未支持');
    if(base!==this.legacyBase()){
      const home=userInfo().homedir;
      for(const parent of [home,join(home,'Library'),join(home,'Library','Application Support')]){
        const s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid!()||(s.mode&0o022)||await realpath(parent)!==parent)throw Error('目录祖先必须是执行机用户的本地应用数据目录');
      }
      if((await statfs(join(home,'Library','Application Support'))).type!==26)throw Error('首版仅验证本地 APFS');
      p=join(home,'Library','Application Support');
      for(const part of ['SocialLeadWorkbench','devices',this.id()]){p=join(p,part);await this.privateDir(p,create);}
    }
    await this.privateDir(base,create);await this.privateDir(path,create);
    if(empty&&(await readdir(path)).length)throw Error('目标目录必须为空；不会导入或搬运现有会话');
    if(create){const probe=join(path,`.write-check-${randomBytes(12).toString('hex')}`);await writeFile(probe,'directory verification',{flag:'wx',mode:0o600});await unlink(probe);}
    return path;
  }
  async createIdentity(){
    if(!this.enabled()||!this.capability().supported)throw Error('设备适配器未启用');
    const directory=join(this.instance(),'device-keys');await this.privateDir(directory,true);
    const keyId=randomUUID(),pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
    const identity={id:this.id(),keyId,publicKey,provider:this.provider()};
    const privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
    if(this.provider()==='real'){
      await deviceVault('put',identity.id,keyId,Buffer.from(privateKey).toString('base64'));
      await writeFile(join(directory,keyId+'.json'),JSON.stringify({kind:'crm-device-key-v2',...identity,protection:'macos-login-keychain'}),{flag:'wx',mode:0o600});
    }else await writeFile(join(directory,keyId+'.json'),JSON.stringify({kind:'crm-device-key-v1',...identity,privateKey}),{flag:'wx',mode:0o600});
    return identity;
  }
  private async readIdentityFile(identity:DeviceIdentity){
    if(!this.capability().supported||identity.id!==this.id()||identity.provider!==this.provider()||!/^[a-f0-9-]{36}$/.test(identity.keyId))throw Error('执行设备不匹配');
    const directory=join(this.instance(),'device-keys');await this.privateDir(directory);
    const path=join(directory,identity.keyId+'.json'),st=await lstat(path);
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid!()||(st.mode&0o077)||st.size>8192)throw Error('设备认证文件不安全');
    // Only this feature's private device key. Never read platform cookies.
    const key=JSON.parse(await readFile(path,'utf8'));
    if(!['crm-device-key-v1','crm-device-key-v2'].includes(key.kind)||key.id!==identity.id||key.keyId!==identity.keyId||key.provider!==identity.provider||key.publicKey!==identity.publicKey)throw Error('设备认证不匹配');
    return key;
  }
  async prove(identity:DeviceIdentity,challenge:Buffer){
    const key=await this.readIdentityFile(identity);
    if(key.kind==='crm-device-key-v2'){
      if(identity.provider!=='real')throw Error('设备认证不匹配');
      const secret=await deviceVault('get',identity.id,identity.keyId);
      return sign(null,challenge,Buffer.from(secret,'base64'));
    }
    // Existing explicitly approved v1 devices remain usable; never auto-migrate.
    return sign(null,challenge,key.privateKey);
  }
  fingerprint(publicKey:string){return createHash('sha256').update(publicKey).digest('hex');}
}
