import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..'),problems=[],packages=new Map();
const fail=(file,message)=>problems.push(`${path.relative(root,file)}: ${message}`);
for(const parent of ['apps','packages'])for(const name of fs.readdirSync(path.join(root,parent))){
 const directory=path.join(root,parent,name),manifest=path.join(directory,'package.json');
 if(!fs.statSync(directory).isDirectory())continue;
 if(!fs.existsSync(manifest)){fail(directory,'workspace requires package.json');continue;}
 const meta=JSON.parse(fs.readFileSync(manifest,'utf8'));packages.set(meta.name,{directory,meta});
}
const allowed={
 '@crm/contracts':[], '@crm/domain':['@crm/contracts'],
 '@crm/local-runtime':['@crm/contracts','@crm/domain'],
 '@crm/web':['@crm/contracts'], '@crm/desktop':['@crm/local-runtime'],
 '@crm/legacy-migration':['@crm/contracts','@crm/domain','@crm/local-runtime'],
};
function walk(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  if(['node_modules','dist','dist-desktop','.git','.local','.workbuddy-ai'].includes(entry.name))return [];
  const file=path.join(directory,entry.name);return entry.isDirectory()?walk(file):[file];
 });
}
for(const [name,{directory,meta}] of packages){
 for(const dep of Object.keys(meta.dependencies||{}))if(dep.startsWith('@crm/')&&!allowed[name]?.includes(dep))fail(directory,`forbidden dependency ${dep}`);
 for(const file of walk(directory).filter(file=>/\.(?:[cm]?js|tsx?|cts)$/.test(file)&&!file.endsWith('.d.cts'))){
  const source=fs.readFileSync(file,'utf8'),production=file.startsWith(path.join(directory,'src')+path.sep);
  if(file.endsWith('.cjs')){
   const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
   if(result.status!==0)fail(file,'CommonJS syntax check failed');
  }
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function check(spec){
   if(spec.startsWith('.')){
    const target=path.resolve(path.dirname(file),spec);
    if(production&&!target.startsWith(directory+path.sep))fail(file,'cross-module relative import: '+spec);
    return;
   }
   if(spec.startsWith('@crm/')){
    const parts=spec.split('/'),dep=parts.slice(0,2).join('/'),module=packages.get(dep);
    if(dep!==name&&!meta.dependencies?.[dep]&&!meta.devDependencies?.[dep])fail(file,'undeclared workspace dependency: '+dep);
    if(production&&dep!==name&&!allowed[name]?.includes(dep))fail(file,'forbidden source dependency: '+dep);
    const subpath=parts.length===2?'.':'./'+parts.slice(2).join('/');
    if(!module?.meta.exports?.[subpath])fail(file,'missing public export: '+spec);
   }
   if(production&&name==='@crm/domain'&&(spec==='electron'||spec.startsWith('@prisma/')||spec.startsWith('@modelcontextprotocol/')||/^node:(?:fs|http|https|net|child_process)/.test(spec)))fail(file,'infrastructure dependency in domain: '+spec);
  }
  function visit(node){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))check(node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))check(node.arguments[0].text);
   ts.forEachChild(node,visit);
  }
  visit(tree);
 }
}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}else console.log(`Structure verified: ${packages.size} workspaces, declared exports and dependency boundaries.`);
