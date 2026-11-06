const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {promisify}=require('node:util');
const {LocalDatabase}=require('../../runtime/local/database.cjs');
const {LocalQueue}=require('../../runtime/local/queue.cjs');
const run=promisify(cp.execFile),runtime=path.resolve(__dirname,'../../runtime/local');
function setup(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'desktop-process-test-'))),file=path.join(root,'workbench.sqlite'),db=new LocalDatabase(file);t.after(()=>{if(!db.closed)db.close();fs.rmSync(root,{recursive:true,force:true});});return {root,file,db};}
test('two OS processes atomically compete for one persistent task',async t=>{
 const f=setup(t),queue=new LocalQueue(f.db),authorization=queue.authorize('COLLECT',{synthetic:true});queue.enqueue('COLLECT',{synthetic:true},authorization,'shared');f.db.close();
 const code=`const {LocalDatabase}=require(process.argv[1]+'/database.cjs');const {LocalQueue}=require(process.argv[1]+'/queue.cjs');const db=new LocalDatabase(process.argv[2]);const claimed=new LocalQueue(db).claim(process.argv[3]);console.log(JSON.stringify({claimed:!!claimed}));db.close();`;
 const results=await Promise.all(['a','b'].map(owner=>run(process.execPath,['-e',code,runtime,f.file,owner])));assert.equal(results.filter(r=>JSON.parse(r.stdout).claimed).length,1);
});
test('process exit during transaction leaves no half-written audit or configuration',async t=>{
 const f=setup(t);f.db.close();const code=`const {LocalDatabase}=require(process.argv[1]+'/database.cjs');const db=new LocalDatabase(process.argv[2]);db.transaction(()=>{db.audit('AUTOMATION','INCOMPLETE','synthetic');db.db.prepare('INSERT INTO settings VALUES(?,?,1)').run('partial','true');process.exit(23)});`;
 await assert.rejects(run(process.execPath,['-e',code,runtime,f.file]),e=>e.code===23);const check=new LocalDatabase(f.file);try{assert.equal(check.db.prepare('SELECT count(*) n FROM audit_events').get().n,0);assert.equal(check.db.prepare('SELECT count(*) n FROM settings').get().n,0);}finally{check.close();}
});
