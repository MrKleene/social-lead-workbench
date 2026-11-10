const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),events=require('node:events');
const api=require('../../../scripts/desktop/platform-support/platform.cjs');
const root='C:\\Users\\测试 User\\AppData\\Local';
test('Windows support is native Windows 11 x64, not Windows 10, ARM64 or WSL',()=>{
 assert.equal(api.platformCapability('win32','x64','10.0.22631').adapter,'windows-local-v1');
 for(const args of [['win32','x64','10.0.19045'],['win32','arm64','10.0.26100'],['linux','x64','6.6']])assert.equal(api.platformCapability(...args).supported,false);
 assert.equal(api.platformCapability('darwin','arm64','25').supported,true);
});
test('Windows paths preserve spaces/non-ASCII but refuse UNC, ADS, traversal, reserved names and device namespace',()=>{
 assert.equal(api.windowsPath(root),root);
 for(const p of ['\\\\server\\share','\\\\?\\C:\\secret','C:relative','C:\\x\\..\\y','C:\\x:stream','C:\\Users\\NUL','C:\\test.','C:\\test ','C:/test','C:\\x\\COM1.txt'])assert.throws(()=>api.windowsPath(p),p);
 assert(api.isWithin(root,root+'\\SocialLeadWorkbench','win32'));
 assert(!api.isWithin(root,root+'-other\\secret','win32'));assert(!api.isWithin(root,'D:\\other','win32'));
});
test('case-insensitive Windows environment has one canonical value and no application secrets',()=>{
 assert.deepEqual(api.minimalEnvironment({Path:'fake',SystemRoot:'C:\\Windows',LOCALAPPDATA:root,AUTH_TOKEN:'fictional',DATABASE_URL:'fictional'}),{PATH:'fake',SYSTEMROOT:'C:\\Windows',LOCALAPPDATA:root});
 assert.throws(()=>api.minimalEnvironment({Path:'one',PATH:'two'}));
});
test('npm cmd shim is replaced with node npm-cli.js without shell interpolation',()=>{
 const args=['run','build','--','space & % value'],cli='C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
 const command=api.npmCommand(args,{npm_execpath:cli},'win32');assert.equal(command[0],process.execPath);assert.deepEqual(command[1],[cli,...args]);
 assert.throws(()=>api.npmCommand(args,{npm_execpath:'npm.cmd'},'win32'));
});
test('pinned Windows MCP uses local app data; browser path matches upstream cache contract',()=>{
 const plan=api.toolPlan('', 'win32',root);assert(plan.mcp.endsWith('xiaohongshu-mcp-windows-amd64.exe'));assert(plan.browserBase.endsWith('xiaohongshu-mcp\\browser\\148.0.7778.215'));assert.match(plan.hash,/^[a-f0-9]{64}$/);
});
function simulatedWindows(spawnSync){const box={exports:{}};const code=fs.readFileSync(__dirname+'/../../../scripts/desktop/platform-support/platform.cjs','utf8');vm.runInNewContext(code,{module:box,require:name=>name==='./windows-tools.json'?require('../../../scripts/desktop/platform-support/windows-tools.json'):name==='node:child_process'?{spawnSync}:name==='node:fs'?{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false})}:name==='node:os'?{release:()=> '10.0.22631'}:require(name),__dirname,process:{platform:'win32',arch:'x64',env:{},execPath:'C:\\node.exe'},Buffer,setTimeout,clearTimeout});return box.exports;}
test('native request uses bounded stdin transport and failures do not return a plaintext fallback',()=>{
 const secret='fictional-base64-only';let input;
 const mock=simulatedWindows((binary,args,options)=>{input={binary,args,options};return {status:0,stdout:'{"value":"ciphertext-fixture"}'};});
 assert.equal(mock.windowsCall({operation:'protect',value:secret}),'ciphertext-fixture');
 assert.equal(input.args.length,0);assert(input.options.input.includes(secret));assert(!input.binary.includes(secret));assert.equal(input.options.timeout,15000);assert.equal(input.options.maxBuffer,32768);
 const failed=simulatedWindows(()=>({status:1,stdout:'{"value":"must-not-return"}'}));assert.throws(()=>failed.windowsCall({operation:'unprotect',value:secret}),/CHECK_FAILED/);
});
test('native source uses current-user DPAPI and a job assigned before resume; no shell/policy bypass',()=>{
 const source=fs.readFileSync(__dirname+'/../../../native/windows/WindowsHost.cs','utf8');
 assert(source.includes('DataProtectionScope.CurrentUser'));assert(!source.includes('DataProtectionScope.LocalMachine'));
 assert(source.indexOf('AssignProcessToJobObject(job,pi.process)')<source.indexOf('ResumeThread(pi.thread)'));
 assert(source.includes('limits.basic.flags=0x2000'));assert(source.includes('pid!=ParentId()'));
 assert(!/powershell|ExecutionPolicy|cmd\.exe|taskkill/i.test(source.replace(/\/\/[^\n]*/g,'')));
});

test('unreviewed browser blocks before any file access; complete approved fixture detects tamper and extra files',async()=>{
 await assert.rejects(api.inspectWindowsBrowser('/fictional/nonexistent'),/REVIEW_REQUIRED/);
 const fsp=require('node:fs/promises'),os=require('node:os'),crypto=require('node:crypto');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'crm-browser-review-'));
 try{
  const bin=path.join(dir,'chrome.exe'),content='fictional non-executable test payload';await fsp.writeFile(bin,content,{mode:0o700});
  const review={state:'approved',archiveSha256:'a'.repeat(64),files:{'chrome.exe':crypto.createHash('sha256').update(content).digest('hex')}};
  assert.equal(await api.inspectWindowsBrowser(dir,review),bin);
  await fsp.writeFile(path.join(dir,'unexpected.dll'),'fictional',{mode:0o700});await assert.rejects(api.inspectWindowsBrowser(dir,review),/UNREVIEWED/);await fsp.unlink(path.join(dir,'unexpected.dll'));
  await fsp.writeFile(bin,'changed');await assert.rejects(api.inspectWindowsBrowser(dir,review),/REVIEW_REQUIRED/);
 }finally{await fsp.rm(dir,{recursive:true});}
});
