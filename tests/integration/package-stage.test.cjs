const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createRequire}=require('node:module');
const {packageFiles}=require('../../scripts/desktop/stage-layout.cjs');
const root=path.resolve(__dirname,'../..');
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-stage-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 for(const file of ['package.json','packages/local-runtime/package.json','packages/local-runtime/dist','apps/desktop/src']){
  fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});fs.cpSync(path.join(root,file),path.join(directory,file),{recursive:true});
 }
 fs.mkdirSync(path.join(directory,'apps/web/dist-desktop'),{recursive:true});fs.writeFileSync(path.join(directory,'apps/web/dist-desktop/desktop.html'),'<html>synthetic</html>');
 return directory;
}
test('staged workspace resolves its runtime without the checkout or installed dependency tree',t=>{
 const source=fixture(t),stage=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'workbench-detached-')));
 t.after(()=>fs.rmSync(stage,{recursive:true,force:true}));
 const files=packageFiles(source);
 for(const [name,bytes] of files){const file=path.join(stage,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 const requireStaged=createRequire(path.join(stage,'apps/desktop/src/main.cjs'));
 assert.ok(requireStaged.resolve('@crm/local-runtime/database').startsWith(stage+path.sep));
 const {LocalDatabase}=requireStaged('@crm/local-runtime/database');
 const db=new LocalDatabase(path.join(stage,'synthetic.sqlite'));
 try{assert.ok(new (requireStaged('@crm/local-runtime/service').LocalService)(db,null));}finally{db.close();}
 assert.ok(requireStaged('@crm/local-runtime/policy').commentDigest);
 assert.ok(requireStaged('@crm/local-runtime/platform-provider').Client);
 assert.ok(files.has('node_modules/@crm/local-runtime/dist/PLATFORM-LICENSES.txt'));
 assert.ok([...files.keys()].every(file=>!file.includes('legacy-migration')&&!file.includes('/adapters/')&&!file.includes('/test/')));
 assert.throws(()=>requireStaged('@crm/local-runtime/adapters/collection/qwen-provider'),/not defined by "exports"/);
});
test('staging refuses unexpected data and symlinked inputs',t=>{
 const source=fixture(t),file=path.join(source,'apps/web/dist-desktop/customer.sqlite');
 fs.writeFileSync(file,'synthetic');assert.throws(()=>packageFiles(source),/Unexpected package file/);fs.unlinkSync(file);
 fs.symlinkSync(path.join(source,'package.json'),path.join(source,'apps/web/dist-desktop/linked.json'));
 assert.throws(()=>packageFiles(source),/Unsafe package input/);
});
