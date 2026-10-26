// Static inventory complements (and never substitutes for) rendered UI checks.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,relative,extname,join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),src=join(root,'apps/web/src');
const walk=async p=>(await Promise.all((await readdir(p,{withFileTypes:true})).map(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]))).flat();
const paths=(await walk(src)).filter(p=>/\.(tsx?|css)$/.test(p)&&!p.includes('.test.'));
const files=new Map(await Promise.all(paths.map(async p=>[p,await readFile(p,'utf8')]))),reachable=new Set();
function visit(p){if(reachable.has(p)||!files.has(p))return;reachable.add(p);for(const m of files.get(p).matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){const spec=m[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;const path=spec.startsWith('@/')?resolve(src,spec.slice(2)):resolve(dirname(p),spec);for(const candidate of [path,...['.tsx','.ts','.css','/index.tsx','/index.ts'].map(s=>path+s)])if(files.has(candidate)){visit(candidate);break;}}}
visit(join(src,'main.tsx'));
const rel=p=>relative(root,p),counts=values=>Object.fromEntries([...values.reduce((a,v)=>a.set(v,(a.get(v)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const styles=[...files].filter(([p])=>extname(p)==='.css').map(([p,s])=>({file:rel(p),reachable:reachable.has(p),ruleBlocks:(s.match(/{/g)||[]).length,hexColors:counts(s.match(/#[0-9a-f]{3,8}\b/gi)||[]),fontSizes:counts([...s.matchAll(/font-size\s*:\s*([^;}]+)/g)].map(m=>m[1])),radii:counts([...s.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map(m=>m[1])),focusSelectors:[...s.matchAll(/([^{}]*:focus(?:-visible|-within)?[^{}]*)\{/g)].map(m=>m[1].trim())}));
const ui=[...files].filter(([p])=>p.endsWith('.tsx')).map(([p,s])=>({file:rel(p),reachable:reachable.has(p),literalClassNameAttributes:(s.match(/className="/g)||[]).length,dynamicClassNameAttributes:(s.match(/className=\{/g)||[]).length,inputs:(s.match(/<(?:Input|input)\b/g)||[]).length,textareas:(s.match(/<(?:Textarea|textarea)\b/g)||[]).length,selects:(s.match(/<select\b/g)||[]).length,sheets:(s.match(/<SheetContent\b/g)||[]).length,nativeConfirms:(s.match(/window.confirm\(/g)||[]).length}));
const result={note:'静态源码清单；reachable 表示从 main.tsx 静态 import 可达，不代表该组件已在浏览器渲染。动态 className、条件分支与 Tailwind 工具类不能据此认定已验证。颜色数量是声明频次，不是最终像素或规范错误数。',summary:{sourceFiles:files.size,reachableFiles:reachable.size,tsxFiles:ui.length,reachableTsx:ui.filter(v=>v.reachable).length,cssFiles:styles.length,reachableCss:styles.filter(v=>v.reachable).length},styles,components:ui};
const dest=join(root,'docs/evidence/ui-consistency-2026-10-26/source-inventory.json');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));console.log(dest);
