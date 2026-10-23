// Prepare reviewed source only. No compiler, MCP process, browser, credentials, or network.
import {readFile,writeFile,mkdir,lstat,realpath,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
const bundle=dirname(fileURLToPath(import.meta.url));
const [sourceArg,targetArg,...extra]=process.argv.slice(2);
if(!sourceArg||!targetArg||extra.length)throw Error('Usage: node prepare.mjs REVIEWED_SOURCE NEW_CANDIDATE_DIRECTORY');
const source=await realpath(sourceArg),target=resolve(targetArg);
const within=(a,b)=>{const r=relative(a,b);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
if(within(source,target)||within(target,source))throw Error('Candidate must be separate from original source');
const manifest=JSON.parse(await readFile(join(bundle,'source-manifest.json'),'utf8'));
// Validate every allowed source before creating anything. Copy no JSON sessions/configuration or binaries.
for(const [name,hash] of Object.entries(manifest.files)){
 if(isAbsolute(name)||name.split('/').some(x=>x==='..'||x===''))throw Error('Unsafe manifest');
 const path=join(source,name),st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||await realpath(path)!==path)throw Error('Unsafe source file');
 if(createHash('sha256').update(await readFile(path)).digest('hex')!==hash)throw Error('Source changed: '+name);
}
await mkdir(target,{recursive:false,mode:0o700});
for(const name of Object.keys(manifest.files)){await mkdir(dirname(join(target,name)),{recursive:true});await copyFile(join(source,name),join(target,name));}
for(const name of ['avatar_diagnostic.go','avatar_diagnostic_test.go','comment_avatar.go','comment_avatar_test.go','avatar_query.go','avatar_query_test.go','avatar-query-cases.json','coverage_diagnostic.go','coverage_diagnostic_test.go','coverage_capture.go','coverage-cases.json','bounded_comments.go','bounded_capture.go','bounded_comments_test.go','bounded_browser_test.go','search_diagnostic.go','search_diagnostic_test.go'])await copyFile(join(bundle,name),join(target,'xiaohongshu',name));
const patched=spawnSync('/usr/bin/patch',['--batch','--forward','-p1','-i',join(bundle,'integration.patch')],{cwd:target,encoding:'utf8',env:{PATH:'/usr/bin:/bin'},timeout:10000});
if(patched.status!==0)throw Error('Patch failed; candidate not built or installed');
const searchPatch=spawnSync('/usr/bin/patch',['--batch','--forward','-p1','-i',join(bundle,'search-integration.patch')],{cwd:target,encoding:'utf8',env:{PATH:'/usr/bin:/bin'},timeout:10000});
if(searchPatch.status!==0)throw Error('Search diagnostic patch failed; not built/installed');
await writeFile(join(target,'PREPARATION.json'),JSON.stringify({source,version:manifest.candidateVersion,installedBinaryUnchanged:true},null,2)+'\n');
console.log('Candidate prepared (not built/installed/run): '+target);
