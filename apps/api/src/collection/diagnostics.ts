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
 return {version:1,stage:supplied?.stage||stage,kind:supplied?.kind||(error instanceof z.ZodError?'SCHEMA_VALIDATION':error instanceof ReadFailure?'READ_FAILURE':stage==='checkpoint'?'CHECKPOINT_FAILURE':'UNEXPECTED_FAILURE'),...(supplied?.searchObservation?{searchObservation:supplied.searchObservation}:{}),...(supplied?.searchReason?{searchReason:supplied.searchReason}:{}),...(supplied?.field?{field:supplied.field}:error instanceof z.ZodError?{field:safeField||'unknown'}:{}),...(supplied?.validationReason?{validationReason:supplied.validationReason}:{}),...(supplied?.actualType?{actualType:supplied.actualType}:{}),...(supplied?.textLength!==undefined?{textLength:supplied.textLength}:{}),...(postOrdinal&&postOrdinal<=10?{postOrdinal}:{}),...(requestStep!==undefined&&requestStep>=0&&requestStep<=32?{requestStep}:{})};
}
// Read only the failed text field. Never retain its value, issue message or arbitrary path.
function textValidation(error:unknown,input:unknown,diagnostic:CollectionDiagnostic):CollectionDiagnostic{
 if(!(error instanceof z.ZodError)||!['text','body','content','desc','data.note.desc'].includes(diagnostic.field||''))return diagnostic;
 const issue=error.issues[0];let value:unknown=input;
 for(const key of issue.path){value=value!==null&&typeof value==='object'&&Object.hasOwn(value,key)?(value as Record<PropertyKey,unknown>)[key]:undefined;}
 const actualType:NonNullable<CollectionDiagnostic['actualType']>=value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value==='string'?'string':typeof value==='number'?'number':typeof value==='boolean'?'boolean':typeof value==='object'?'object':'other';
 const validationReason:NonNullable<CollectionDiagnostic['validationReason']>=issue.code==='invalid_type'?(value===undefined?'MISSING':'WRONG_TYPE'):issue.code==='too_big'?'TOO_LONG':issue.code==='too_small'?'TOO_SHORT':'INVALID_VALUE';
 return {...diagnostic,validationReason,actualType,...(typeof value==='string'?{textLength:Math.min(value.length,16777216)}:{})};
}
export function parseSource<T>(schema:z.ZodType<T>,input:unknown,stage:Stage):T{try{return schema.parse(input);}catch(e){throw new ReadFailure('INVALID_DATA',undefined,textValidation(e,input,diagnose(e,stage)));}}
export function logCollectionDiagnostic(taskId:string,diagnostic:unknown){const safe=safeCollectionDiagnostic(diagnostic);if(safe)console.warn(JSON.stringify({event:'COLLECTION_DIAGNOSTIC',task:/^c[a-z0-9]{20,30}$/.test(taskId)?taskId:'unknown',diagnostic:safe}));}
