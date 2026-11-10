import {defineConfig} from 'vitest/config';
import {readFileSync} from 'node:fs';
import path from 'node:path';
// Resolve all workspace imports to the same source instance, including error
// classes shared by the collector and injected synthetic transports.
const alias:Record<string,string>={};
for(const name of ['contracts','domain','local-runtime']){
 const directory=path.join(import.meta.dirname,'packages',name);
 const metadata=JSON.parse(readFileSync(path.join(directory,'package.json'),'utf8'));
 for(const [subpath,value] of Object.entries(metadata.exports)){
  if(typeof value==='object'&&value&&'source' in value)alias[metadata.name+(subpath==='.'?'':subpath.slice(1))]=path.resolve(directory,String(value.source));
 }
}
export default defineConfig({resolve:{alias},test:{include:['test/**/*.test.ts']}});
