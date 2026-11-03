import {randomUUID} from 'node:crypto';
import type {Db} from './db';
export type LiveStage='collect'|'review'|'contact';
export type LivePhase='PREPARING_CAPTURE'|'CHECKING_ACCOUNT'|'SEARCHING'|'READING_POST'|'READING_COMMENTS'|'READING_REPLIES'|'SAVING_CAPTURE'|'PREPARING_REVIEW'|'REVIEWING'|'SAVING_REVIEW'|'PREPARING_SEND'|'LOCATING_TARGET'|'FILLING_MESSAGE'|'SUBMITTING'|'CONFIRMING'|'IDLE';
export type LiveReporter={set:(phase:LivePhase)=>Promise<void>;close:()=>Promise<void>};
/** Display-only audit. No authorization, retry, result, quota or worker decision reads it. */
export function liveReporter(db:Db,runId:string|null|undefined,stage:LiveStage,executionId:string):LiveReporter{
 const session=randomUUID();let phase:LivePhase='IDLE',closed=false,serial=Promise.resolve();
 const put=()=>{if(!runId)return Promise.resolve();const snapshot=phase;serial=serial.then(async()=>{try{await db.auditLog.create({data:{entityId:runId,action:'JOURNEY_PROGRESS',metadata:{v:1,stage,executionId,session,phase:snapshot}}});}catch{console.error('JOURNEY_PROGRESS_UNAVAILABLE');}});return new Promise<void>(resolve=>{const timer=setTimeout(resolve,250);void serial.then(()=>{clearTimeout(timer);resolve();});});};
 const timer=setInterval(()=>{if(!closed&&phase!=='IDLE')void put();},5000);timer.unref?.();
 return {set:async next=>{if(closed||next===phase)return;phase=next;await put();},close:async()=>{if(closed)return;closed=true;clearInterval(timer);if(phase==='IDLE')return;phase='IDLE';await put();}};
}
export async function contactReporter(db:Db,requestKey:string){
 const id=requestKey.startsWith('auto-contact:')?requestKey.slice(13):'';
 let runId:string|undefined;try{if(id)runId=(await db.autoContactJob.findUnique({where:{id},select:{review:{select:{runId:true}}}}))?.review.runId;}catch{/* no progress must never change execution */}
 return liveReporter(db,runId,'contact',id||requestKey);
}
