import {executionEventSchema,type ExecutionEvent} from './reply-stage-journal';
/** Only same-protocol durable NOT_SENT + complete close journal proves absence.
 * Neither a timeout nor missing stages alone proves no submission. */
export function provenCaptureNonSubmission(metadata:unknown[]){
 const events:ExecutionEvent[]=[];
 for(const value of metadata){const p=executionEventSchema.safeParse(value);if(!p.success)return false;events.push(p.data);}
 if(events.length!==3||events[0].stage!=='RPC_INTENT'||events[1].stage!=='RPC_RETURNED'||events[2].stage!=='TRANSPORT_STOP')return false;
 const [intent,returned,stop]=events;
 if(returned.kind!=='NOT_SENT'||!returned.envelopeValid||!stop.stopped||stop.journal.state!=='AVAILABLE'||events.some(e=>e.protocolAttemptId!==intent.protocolAttemptId))return false;
 const rows=stop.journal.records;
 return rows.length>=2&&rows[0].stage==='STARTED'&&rows.at(-1)?.stage==='DRIVER_CLOSED'&&rows.at(-1)?.stopped===true&&
  rows.every((r,i)=>r.sequence===i+1&&r.attemptId===intent.protocolAttemptId&&!r.attempted&&!['ATTEMPTED','AFTER_SUBMIT','SUBMIT_FINISHED','RECEIPT_CAPTURE'].includes(r.stage));
}
