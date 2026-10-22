import {z} from 'zod';
import {safeCollectionDiagnostic,type CollectionDiagnostic} from '@crm/contracts';
import {ReadFailure} from './contract';
type Stage=CollectionDiagnostic['stage'];
export function invalidSource(stage:Stage,kind:CollectionDiagnostic['kind'],field?:CollectionDiagnostic['field']):ReadFailure{return new ReadFailure('INVALID_DATA',undefined,{version:1,stage,kind,...(field?{field}:{})});}
export function diagnose(error:unknown,stage:Stage,postOrdinal?:number,requestStep?:number):CollectionDiagnostic{
 const supplied=error instanceof ReadFailure?safeCollectionDiagnostic(error.diagnostic):undefined;
 const field=error instanceof z.ZodError?error.issues[0]?.path.filter(p=>typeof p==='string').at(-1):undefined;
 const path=error instanceof z.ZodError?error.issues[0]?.path.map(p=>typeof p==='number'?'[]':p).join('.').replaceAll('.[]','[]'):undefined;
 const safeField=safeCollectionDiagnostic({version:1,stage,kind:'SCHEMA_VALIDATION',field:path})?.field||safeCollectionDiagnostic({version:1,stage,kind:'SCHEMA_VALIDATION',field})?.field;
 return {version:1,stage:supplied?.stage||stage,kind:supplied?.kind||(error instanceof z.ZodError?'SCHEMA_VALIDATION':error instanceof ReadFailure?'READ_FAILURE':stage==='checkpoint'?'CHECKPOINT_FAILURE':'UNEXPECTED_FAILURE'),...(supplied?.field?{field:supplied.field}:error instanceof z.ZodError?{field:safeField||'unknown'}:{}),...(postOrdinal&&postOrdinal<=10?{postOrdinal}:{}),...(requestStep!==undefined&&requestStep>=0&&requestStep<=32?{requestStep}:{})};
}
export function parseSource<T>(schema:z.ZodType<T>,input:unknown,stage:Stage):T{try{return schema.parse(input);}catch(e){throw new ReadFailure('INVALID_DATA',undefined,diagnose(e,stage));}}
export function logCollectionDiagnostic(taskId:string,diagnostic:unknown){const safe=safeCollectionDiagnostic(diagnostic);if(safe)console.warn(JSON.stringify({event:'COLLECTION_DIAGNOSTIC',task:/^c[a-z0-9]{20,30}$/.test(taskId)?taskId:'unknown',diagnostic:safe}));}
