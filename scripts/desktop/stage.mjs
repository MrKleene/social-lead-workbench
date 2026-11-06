import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,lstatSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),stage=path.join(root,'.local/desktop-stage');
const metadata=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
function inspect(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Desktop package input cannot contain symlinks');if(entry.isDirectory()){if(['node_modules','credentials','backups','restores','.git'].includes(entry.name))throw Error('Unexpected runtime data in package input');inspect(file);}else if(!entry.isFile()||entry.name.startsWith('.env')||/\.(?:sqlite|db|sealed)(?:-|$)/i.test(entry.name)||!/\.(?:cjs|js|json|sql|txt|css|html|svg|png|ico|woff2?)$/.test(entry.name))throw Error('Unexpected desktop package file: '+entry.name);}}
if(existsSync(stage)){if(lstatSync(stage).isSymbolicLink()||!existsSync(path.join(stage,'.owned-stage')))throw Error('Refusing unknown staging directory');rmSync(stage,{recursive:true});}
mkdirSync(stage,{recursive:true,mode:0o700});writeFileSync(path.join(stage,'.owned-stage'),'social-lead-desktop');
for(const relative of ['apps/desktop/src','apps/web/dist-desktop','runtime/local']){if(!existsSync(path.join(root,relative)))throw Error('Missing build input: '+relative);inspect(path.join(root,relative));mkdirSync(path.dirname(path.join(stage,relative)),{recursive:true});cpSync(path.join(root,relative),path.join(stage,relative),{recursive:true,dereference:false});}
writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'social-lead-desktop',version:metadata.version+'-preview.2',private:true,main:'apps/desktop/src/main.cjs',description:'Local desktop migration preview',author:'Social Lead Workbench'},null,2));
console.log('Desktop stage created from a fixed allowlist; no runtime data, credentials or node_modules copied.');
