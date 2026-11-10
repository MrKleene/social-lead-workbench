import {existsSync,mkdirSync,writeFileSync,lstatSync,rmSync} from 'node:fs';
import path from 'node:path';
import layout from './stage-layout.cjs';
const root=path.resolve(import.meta.dirname,'../..'),stage=path.join(root,'.local/desktop-stage');
// Validate every input before replacing the owned staging directory.
const files=layout.packageFiles(root);
if(existsSync(stage)){
 if(lstatSync(stage).isSymbolicLink()||!existsSync(path.join(stage,'.owned-stage')))throw Error('Refusing unknown staging directory');
 rmSync(stage,{recursive:true});
}
mkdirSync(stage,{recursive:true,mode:0o700});writeFileSync(path.join(stage,'.owned-stage'),'social-lead-desktop');
for(const [file,bytes] of files){mkdirSync(path.dirname(path.join(stage,file)),{recursive:true});writeFileSync(path.join(stage,file),bytes);}
console.log(`Desktop stage: ${files.size} allowlisted files; no installed third-party dependency tree or user data copied.`);
