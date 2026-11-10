import {createHash} from 'node:crypto';
function stable(v:unknown):unknown {return Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,stable(value)])):v;}
export const semanticHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
