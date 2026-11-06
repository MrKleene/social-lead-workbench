// Run with Electron. Tests only a newly generated synthetic value in a private temp dir.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {CredentialStore}=require('../../runtime/local/credentials.cjs');
const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'desktop-credential-test-')));
app.setName('SocialLeadDesktopCredentialTest');app.setPath('userData',directory);
app.whenReady().then(()=>{
 assert.equal(safeStorage.isEncryptionAvailable(),true);
 const vaultDir=path.join(directory,'vault');fs.mkdirSync(vaultDir,{mode:0o700});
 const vault=new CredentialStore(vaultDir,{available:()=>true,encrypt:s=>safeStorage.encryptString(s),decrypt:b=>safeStorage.decryptString(b)});
 const synthetic='synthetic-only-'+randomBytes(24).toString('hex');vault.put('MODEL_KEY','qwen',synthetic);
 assert.equal(vault.get('MODEL_KEY','qwen'),synthetic);
 for(const name of fs.readdirSync(vaultDir))assert.equal(fs.readFileSync(path.join(vaultDir,name)).includes(Buffer.from(synthetic)),false);
 vault.remove('MODEL_KEY','qwen');assert.equal(vault.has('MODEL_KEY','qwen'),false);
 const evidence={platform:process.platform,arch:process.arch,osEncryptionAvailable:true,syntheticRoundtrip:true,plaintextOnDisk:false,existingCredentialsRead:false};
 const out=path.resolve(__dirname,'../../.local/desktop-qa');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'os-credentials.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{fs.rmSync(directory,{recursive:true,force:true});app.exit(process.exitCode||0);});
