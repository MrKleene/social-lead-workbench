// Launches only the packaged app's fixed offline self-test. It chooses its own
// disposable temp directory; no user data path, provider or credential access.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const target=process.argv[2];if(!target||!path.isAbsolute(target))throw Error('Pass the absolute packaged .app or .exe');
const executable=target.endsWith('.app')?path.join(target,'Contents/MacOS/Social Lead Desktop'):target;
const env={};for(const key of ['PATH','HOME','TMPDIR','SystemRoot','SYSTEMROOT','USERPROFILE','LOCALAPPDATA','TEMP','TMP','LANG'])if(process.env[key])env[key]=process.env[key];
const result=cp.spawnSync(executable,['--self-test'],{encoding:'utf8',env,timeout:45000,maxBuffer:65536,windowsHide:true});
if(result.status!==0||result.error)throw Error('Packaged self-test did not exit successfully');
const marker=result.stdout.split('\n').find(line=>line.startsWith('DESKTOP_SELF_TEST '));if(!marker)throw Error('Packaged self-test success receipt missing');
const receipt=JSON.parse(marker.slice('DESKTOP_SELF_TEST '.length));assert.equal(receipt.initialized,true);assert.ok(Number.isInteger(receipt.configurations)&&receipt.configurations>=1);assert.equal(receipt.credentialsAvailable,false);assert.equal(receipt.externalExecutors,false);assert.equal(receipt.platform,process.platform);assert.equal(receipt.arch,process.arch);assert.equal(receipt.packaged,true);
const destination=path.resolve(__dirname,'../../.local/desktop-qa/packaged-smoke.json');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
