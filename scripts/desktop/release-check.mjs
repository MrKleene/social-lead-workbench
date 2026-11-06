import {readFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../../apps/desktop/release-readiness.json',import.meta.url),'utf8'));
const blockers=Object.entries(state).filter(([,v])=>v!=='verified');
if(blockers.length){console.error('Desktop release is blocked. Do not replace the production instance.');for(const [key,value] of blockers)console.error(`${key}: ${value}`);process.exitCode=1;}
