import type {OwnedReplyEndpoint} from './xhs-reply-transport';
import type {LiveReporter,LivePhase} from '../common/journey-live';
export function journalPhase(stage:string):LivePhase|undefined{
 if(stage==='RESTRICTION_CHECK')return 'CHECKING_ACCOUNT';
 if(['STARTED','INSPECTED'].includes(stage))return 'LOCATING_TARGET';
 if(['NAVIGATION_INTENT','NAVIGATED','TARGET_LOCATED','SELECT_INTENT','REPLY_SELECTED','SELECTED','INITIAL_BINDING_WAIT','INITIAL_BINDING_MATCHED'].includes(stage))return 'LOCATING_TARGET';
 if(['INPUT_INTENT','INPUT_FINISHED','RECHECKED','BEFORE_SUBMIT'].includes(stage))return 'FILLING_MESSAGE';
 if(stage==='ATTEMPTED')return 'SUBMITTING';
 if(['AFTER_SUBMIT','SUBMIT_FINISHED','READBACK','RECEIPT_CAPTURE'].includes(stage))return 'CONFIRMING';
 return undefined;
}
/** Reads only the owned private journal. Torn tail is ignored for display, never for receipt proof. */
export function watchJournalProgress(owned:OwnedReplyEndpoint,id:string,live?:LiveReporter){
 let stopped=false,seen=0,pending:Promise<void>|undefined;
 const poll=async()=>{if(!owned.readJournal||!live)return;try{const j=await owned.readJournal(id);if(!['AVAILABLE','TRUNCATED'].includes(j.state))return;for(const row of j.records){if(row.sequence<=seen)continue;seen=row.sequence;const phase=journalPhase(row.stage);if(phase)await live.set(phase);}}catch{/* display only */}};
 const tick=()=>{if(!stopped&&!pending)pending=poll().finally(()=>{pending=undefined;});};
 const timer=setInterval(tick,300);timer.unref?.();tick();
 return async()=>{stopped=true;clearInterval(timer);await pending;await poll();};
}
