'use strict';
const {LocalError,hash}=require('./database.cjs');
class LocalRecovery{
 constructor(store){this.store=store;this.db=store.db;}
 preview(){
  const holds=this.db.prepare('SELECT id,version,reason FROM safety_state WHERE reason IS NOT NULL ORDER BY id').all().map(row=>({...row}));
  const count=sql=>this.db.prepare(sql).get().n;
  const unknownSends=count("SELECT count(*) n FROM send_attempts WHERE state IN('RESERVED','DISPATCHED','UNKNOWN')");
  const unknownLegacy=count("SELECT count(*) n FROM legacy_records WHERE entity='ContactAttempt' AND json_extract(body,'$.mode')='REAL' AND json_extract(body,'$.outcome') IN('RESERVED','ATTEMPTED','UNKNOWN') AND NOT EXISTS(SELECT 1 FROM legacy_evidence_links l WHERE l.import_id=legacy_records.import_id AND l.ordinal=legacy_records.ordinal)");
  const unknownModels=count("SELECT count(*) n FROM review_batches WHERE state IN('RESERVED','DISPATCHED','UNKNOWN')");
  const active=count("SELECT (SELECT count(*) FROM jobs WHERE state IN('QUEUED','RUNNING'))+(SELECT count(*) FROM evidence_checks WHERE state='RUNNING') n")+this.db.prepare('SELECT count(*) n FROM account_leases WHERE expires_at>?').get(this.store.clock()).n;
  const accountRestrictions=count('SELECT count(DISTINCT account_id) n FROM account_holds');
  const contactBlocks=count('SELECT count(*) n FROM contact_ledger WHERE blocked=1 OR first_contact_blocked=1');
  const imports=this.db.prepare("SELECT details FROM audit_events WHERE action='LEGACY_BUSINESS_IMPORTED' ORDER BY id").all().map(r=>JSON.parse(r.details).nativeHistory).filter(Boolean);
  const sending=holds.find(x=>x.id==='sending');
  const origin=this.db.prepare("SELECT e.entity_id FROM safety_state s JOIN audit_events e ON e.event_id=s.event_id WHERE s.id='sending' AND s.reason='SUBMISSION_UNKNOWN' AND e.action='SENDING_PAUSED'").get();
  const resolvedOrigin=!!origin&&!!this.db.prepare("SELECT 1 FROM send_attempts a JOIN evidence_checks c ON c.attempt_id=a.id WHERE a.id=? AND a.state='CONFIRMED' AND c.state='CONFIRMED' AND json_extract(a.evidence,'$.checkId')=c.id AND json_extract(a.evidence,'$.proof')='TWO_INDEPENDENT_STOPPED_READBACKS'").get(origin.entity_id);
  const resumable=!!sending&&(['RESTORE_REQUIRES_REVIEW','LEGACY_IMPORT_REQUIRES_REVIEW'].includes(sending.reason)||resolvedOrigin)&&!unknownSends&&!unknownLegacy&&!unknownModels&&!active&&!holds.some(x=>x.id==='platform');
  const state={holds,unknownSends,unknownLegacy,unknownModels,active,accountRestrictions,contactBlocks,imports,resumable};
  return {...state,previewHash:hash(state)};
 }
 resume({previewHash,consent}){return this.store.transaction(()=>{
  const current=this.preview();if(consent!=='resume-reviewed-copy-for-new-work-v1'||previewHash!==current.previewHash)throw new LocalError('RECOVERY_PREVIEW_CHANGED');if(!current.resumable)throw new LocalError('RECOVERY_REQUIRES_RECONCILIATION');
  // Only a reviewed copy or exact proven UNKNOWN-origin interlock is cleared. Never clear risk, UNKNOWN,
  // contact ledger, account limits, authorizations or any platform/model hold.
  this.db.prepare("UPDATE safety_state SET reason=NULL,version=version+1 WHERE id='sending'").run();
  this.store.audit('LOCAL_USER','REVIEWED_COPY_NEW_WORK_ENABLED','installation',{previewHash,accountRestrictions:current.accountRestrictions,contactBlocks:current.contactBlocks});return {resumed:true};
 });}
}
module.exports={LocalRecovery};
