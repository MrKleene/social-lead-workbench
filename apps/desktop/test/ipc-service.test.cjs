const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateCall}=require('../src/ipc-policy.cjs');
function trusted(){const frame={url:'workbench://app/desktop.html'},contents={mainFrame:frame};return {event:{sender:contents,senderFrame:frame},window:{webContents:contents}};}
test('IPC accepts only this window main frame and fixed methods',()=>{const {event,window}=trusted();assert.doesNotThrow(()=>validateCall(event,window,'status'));for(const url of ['https://evil.test','file:///tmp/x','workbench://other/x','workbench://user@app/x','workbench://app:123/x']){const original=event.senderFrame.url;event.senderFrame.url=url;assert.throws(()=>validateCall(event,window,'status'));event.senderFrame.url=original;}assert.throws(()=>validateCall({...event,sender:{}},window,'status'));assert.throws(()=>validateCall(event,window,'getModelKey'));assert.throws(()=>validateCall(event,window,'execute'));assert.throws(()=>validateCall(event,window,'saveConfiguration',{text:'x'.repeat(65537)}));});

test('IPC method tables match each other and LocalService',()=>{
 const preload=fs.readFileSync(require('node:path').join(__dirname,'../src/preload.cjs'),'utf8');
 const policy=fs.readFileSync(require('node:path').join(__dirname,'../src/ipc-policy.cjs'),'utf8');
 const names=(source)=>{const start=source.indexOf('const methods'),open=source.indexOf('[',start),close=source.indexOf(']',open);return [...source.slice(open+1,close).matchAll(/'([^']+)'/g)].map(x=>x[1]);};
 const exposed=names(preload),allowed=names(policy);
 assert.deepEqual(allowed,exposed);
 const handledInMain=new Set(['reportPendingSends','cancelPostDiagnostic','cancelEvidence','cancelLogin','reconcilePlatform']);
 const {LocalService}=require('@crm/local-runtime/service');
 const missing=exposed.filter(name=>!handledInMain.has(name)&&typeof LocalService.prototype[name]!=='function');
 assert.deepEqual(missing,[],'exposed IPC methods without an implementation: '+missing.join(','));
});
