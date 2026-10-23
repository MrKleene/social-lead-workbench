// Build and test only. NEVER install or execute the MCP binary.
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const bundle=dirname(fileURLToPath(import.meta.url));
const [source,outputArg,goArg,modcacheArg,...extra]=process.argv.slice(2);
if(!source||!outputArg||!goArg||!modcacheArg||extra.length)throw Error('Usage: node build-candidate.mjs REVIEWED_SOURCE NEW_OUTPUT GO_BINARY EXISTING_MODULE_CACHE');
const output=resolve(outputArg),go=await realpath(goArg),modcache=await realpath(modcacheArg);
if(!(await lstat(go)).isFile()||!(await lstat(modcache)).isDirectory())throw Error('Existing local compiler/cache required');
await mkdir(output,{recursive:false,mode:0o700});
for(const d of ['home','cache','tmp'])await mkdir(join(output,d),{mode:0o700});
const env={PATH:'/usr/bin:/bin',HOME:join(output,'home'),TMPDIR:join(output,'tmp'),GOCACHE:join(output,'cache'),GOMODCACHE:modcache,GOPROXY:'off',GOSUMDB:'off',GOTOOLCHAIN:'local',GOWORK:'off',GOENV:'off',GOTELEMETRY:'off',CGO_ENABLED:'0',GOOS:'darwin',GOARCH:'arm64'};
function run(binary,args,cwd=output,log){const r=spawnSync(binary,args,{cwd,env,encoding:'utf8',maxBuffer:4*1024*1024,timeout:240000});if(log)return writeFile(join(output,log),(r.stdout||'')+(r.stderr||'')).then(()=>{if(r.status!==0)throw Error('Offline step failed: '+log);return r.stdout});if(r.status!==0)throw Error('Preparation/toolchain check failed');return r.stdout;}
const version=run(go,['version']).trim();if(version!=='go version go1.24.13 darwin/arm64')throw Error('Unreviewed compiler version');
run(process.execPath,[join(bundle,'prepare.mjs'),source,join(output,'source')]);
const cwd=join(output,'source'),manifest=JSON.parse(await readFile(join(bundle,'source-manifest.json'),'utf8'));
await run(go,['test','-count=1','-v','xiaohongshu/avatar_diagnostic.go','xiaohongshu/avatar_diagnostic_test.go','xiaohongshu/types.go','xiaohongshu/comment_avatar.go','xiaohongshu/comment_avatar_test.go','xiaohongshu/avatar_query.go','xiaohongshu/avatar_query_test.go','xiaohongshu/coverage_diagnostic.go','xiaohongshu/coverage_diagnostic_test.go','xiaohongshu/bounded_comments.go','xiaohongshu/bounded_comments_test.go','xiaohongshu/search_note.go','xiaohongshu/search_note_test.go','xiaohongshu/search_observation.go','xiaohongshu/search_diagnostic.go','xiaohongshu/search_diagnostic_test.go'],cwd,'diagnostic-tests.log');
const binary=join(output,'xiaohongshu-mcp-candidate');
const flags=['build','-mod=readonly','-trimpath','-buildvcs=false','-ldflags=-buildid= -X main.version='+manifest.candidateVersion,'-o',binary,'.'];
await run(go,flags,cwd,'build.log');
const sha256=createHash('sha256').update(await readFile(binary)).digest('hex');
await writeFile(join(output,'BUILD.json'),JSON.stringify({version:manifest.candidateVersion,compiler:version,target:'darwin/arm64',cgo:false,sourceManifestSha256:createHash('sha256').update(await readFile(join(bundle,'source-manifest.json'))).digest('hex'),binary,sha256,flags,installed:false,executed:false},null,2)+'\n');
console.log(JSON.stringify({binary,sha256,installed:false,executed:false}));
