import type {Config,McpReadiness} from '@/features/collection/types';
import {runRequest} from '@/features/collection/mode';
import {collectionPreflight} from './collection-preflight';
/** A saved default is required; never substitute another eligible account. */
export function collectionStartRequest(config:Config,readiness:McpReadiness,requestKey:string){
 if(collectionPreflight(config,readiness)!=='ready')return null;
 return {path:`/collection/configs/${config.id}/runs`,body:{
  ...runRequest(config,'BASELINE',requestKey),
  readPlan:{rounds:1,postsPerRound:config.batchLimit,commentPages:config.mode==='MOCK'?4:1},
  ...(config.mode==='MOCK'?{}:{accountId:config.defaultExecutionAccountId!,consent:'account-read-window-v1'})
 }};
}
/** Reject an in-flight click if the saved scope changed while checking metadata. */
export function sameCollectionSetup(a:Config,b:Config){
 return a.id===b.id&&a.revision===b.revision&&a.mode===b.mode&&a.defaultExecutionAccountId===b.defaultExecutionAccountId&&a.batchLimit===b.batchLimit;
}
