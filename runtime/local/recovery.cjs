'use strict';
const {LocalError,hash}=require('./database.cjs');
class LocalRecovery{
 constructor(store){this.store=store;this.db=store.db;}
 preview(){
  const holds=this.db.prepare('SELECT id,version,reason FROM safety_state WHERE reason IS NOT NULL ORDER BY id').all().map(row=>({...row}));
  const count=sql=>this.db.prepare(sql).get().n;
  const unknownSends=count("SELECT count(*) n FROM send_attempts WHERE state IN('RESERVED','DISPATCHED','UNKNOWN')");
  const unknownLegacy=count("SELECT count(*) n FROM legacy_records WHERE entity='ContactAttempt' AND json_extract(body,'$.mode')='REAL' AND json_extract(body,'$.outcome') IN('RESERVED','ATTEMPTED','UNKNOWN')");
  const unknownModels=count("SELECT count(*) n FROM review_batches WHERE state IN('RESERVED','DISPATCHED','UNKNOWN')");
  const active=count("SELECT count(*) n FROM jobs WHERE state IN('QUEUED','RUNNING')");
  const accountRestrictions=count('SELECT count(*) n FROM account_holds');
  const contactBlocks=count('SELECT count(*) n FROM contact_ledger WHERE blocked=1 OR first_contact_blocked=1');
  const imports=this.db.prepare("SELECT details FROM audit_events WHERE action='LEGACY_BUSINESS_IMPORTED' ORDER BY id").all().map(r=>JSON.parse(r.details).nativeHistory).filter(Boolean);
  const sending=holds.find(x=>x.id==='sending');
  const resumable=!!sending&&['RESTORE_REQUIRES_REVIEW','LEGACY_IMPORT_REQUIRES_REVIEW'].includes(sending.reason)&&!unknownSends&&!unknownLegacy&&!unknownModels&&!active&&!holds.some(x=>x.id==='platform');
  const state={holds,unknownSends,unknownLegacy,unknownModels,active,accountRestrictions,contactBlocks,imports,resumable};
  return {...state,previewHash:hash(state)};
 }
 resume({previewHash,consent}){return this.store.transaction(()=>{
  const current=this.preview();if(consent!=='resume-reviewed-copy-for-new-work-v1'||previewHash!==current.previewHash)throw new LocalError('RECOVERY_PREVIEW_CHANGED');if(!current.resumable)throw new LocalError('RECOVERY_REQUIRES_RECONCILIATION');
  // Only the import/restore interlock is cleared. Never clear risk, UNKNOWN,
  // contact ledger, account limits, authorizations or any platform/model hold.
  this.db.prepare("UPDATE safety_state SET reason=NULL,version=version+1 WHERE id='sending'").run();
  this.store.audit('LOCAL_USER','REVIEWED_COPY_NEW_WORK_ENABLED','installation',{previewHash,accountRestrictions:current.accountRestrictions,contactBlocks:current.contactBlocks});return {resumed:true};
 });}
}
module.exports={LocalRecovery};
