// 用新生成的合成值验证本机密钥加密：只读写私有临时目录，不触碰真实凭据。
// 覆盖 app 实际使用的 createProtector（本机派生密钥 + AES-256-GCM），不再依赖 Electron safeStorage。
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {CredentialStore}=require('@crm/local-runtime/credentials');
const {createProtector}=require('../../apps/desktop/src/local-crypto.cjs');
const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'desktop-credential-test-')));
try{
 const vaultDir=path.join(directory,'vault');fs.mkdirSync(vaultDir,{mode:0o700});
 const checkPrivateFile=file=>{if(process.platform==='win32')require('../../apps/desktop/src/windows-native.cjs').windowsNative({isPackaged:false},{operation:'file',path:file});};
 if(process.platform==='win32')require('../../apps/desktop/src/windows-native.cjs').windowsNative({isPackaged:false},{operation:'directory',path:vaultDir,create:false});
 const vault=new CredentialStore(vaultDir,createProtector(),{checkPrivateFile});
 const synthetic='synthetic-only-'+randomBytes(24).toString('hex');vault.put('MODEL_KEY','qwen',synthetic);
 assert.equal(vault.get('MODEL_KEY','qwen'),synthetic);
 for(const name of fs.readdirSync(vaultDir))assert.equal(fs.readFileSync(path.join(vaultDir,name)).includes(Buffer.from(synthetic)),false);
 vault.remove('MODEL_KEY','qwen');assert.equal(vault.has('MODEL_KEY','qwen'),false);
 const evidence={platform:process.platform,arch:process.arch,localKeyDerivation:true,syntheticRoundtrip:true,plaintextOnDisk:false,existingCredentialsRead:false};
 const out=path.resolve(__dirname,'../../.local/desktop-qa');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'os-credentials.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(error){
 console.error(error.message);process.exitCode=1;
}finally{
 fs.rmSync(directory,{recursive:true,force:true});
}
