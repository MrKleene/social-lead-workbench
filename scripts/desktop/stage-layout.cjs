// The packaged runtime is a self-contained workspace bundle, not an npm install.
const fs=require('node:fs'),path=require('node:path');
function packageFiles(root){
 const files=new Map();
 function add(source,target){
  const stat=fs.lstatSync(path.join(root,source));
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe package input: '+source);
  if(/(^|\/)\.env|\.(?:sqlite|db|sealed)(?:-|$)/i.test(target)||!/\.(?:cjs|js|json|sql|txt|css|html|svg|png|ico|woff2?)$/.test(target))throw Error('Unexpected package file: '+target);
  files.set(target,fs.readFileSync(path.join(root,source)));
 }
 function tree(directory){
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
   const file=directory+'/'+entry.name;
   if(entry.isDirectory()){
    if(['node_modules','credentials','backups','restores','.git'].includes(entry.name))throw Error('Unexpected package directory: '+file);
    tree(file);
   }else add(file,file);
  }
 }
 for(const entry of fs.readdirSync(path.join(root,'apps/desktop/src'),{withFileTypes:true})){
  add('apps/desktop/src/'+entry.name,'apps/desktop/src/'+entry.name);
 }
 tree('apps/web/dist-desktop');
 const moduleRoot='node_modules/@crm/local-runtime',metadata=JSON.parse(fs.readFileSync(path.join(root,'packages/local-runtime/package.json'),'utf8'));
 const exports={};
 for(const [key,value] of Object.entries(metadata.exports)){
  const target=typeof value==='string'?value:value.default;
  if(!/^\.\/dist\/[^/]+\.(?:cjs|json)$/.test(target))continue;
  exports[key]=target;
  add('packages/local-runtime/'+target.slice(2),moduleRoot+'/'+target.slice(2));
 }
 // Every compiled root module is part of the runtime: public entries plus internal
 // helpers that other modules require relatively (e.g. runner.cjs → ./send-queue.cjs).
 // Missing one is not caught until the packaged app fails to start.
 for(const name of fs.readdirSync(path.join(root,'packages/local-runtime/dist')).filter(name=>name.endsWith('.cjs')))add('packages/local-runtime/dist/'+name,moduleRoot+'/dist/'+name);
 add('packages/local-runtime/dist/schema.sql',moduleRoot+'/dist/schema.sql');
 if(fs.existsSync(path.join(root,'packages/local-runtime/dist/migrations')))for(const name of fs.readdirSync(path.join(root,'packages/local-runtime/dist/migrations')))add('packages/local-runtime/dist/migrations/'+name,moduleRoot+'/dist/migrations/'+name);
 for(const name of fs.readdirSync(path.join(root,'packages/local-runtime/dist')).filter(name=>name.endsWith('-build.json')||name.endsWith('-NOTICES.txt')||name.endsWith('-LICENSES.txt')))add('packages/local-runtime/dist/'+name,moduleRoot+'/dist/'+name);
 files.set(moduleRoot+'/package.json',Buffer.from(JSON.stringify({name:metadata.name,version:metadata.version,private:true,exports},null,2)+'\n'));
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 files.set('package.json',Buffer.from(JSON.stringify({name:'social-lead-desktop',version,private:true,dependencies:{'@crm/local-runtime':metadata.version},main:'apps/desktop/src/main.cjs',description:'Social Lead local desktop workbench',author:'Social Lead Workbench'},null,2)+'\n'));
 return files;
}
module.exports={packageFiles};
