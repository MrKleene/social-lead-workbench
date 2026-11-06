'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const kinds=new Set(['COLLECT','REVIEW','SEND','INBOX']);
class LocalQueue {
 constructor(store){this.store=store;this.db=store.db;}
 authorize(purpose,scope,ttlMs=900000){
  if(!kinds.has(purpose)||!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>900000)throw new LocalError('INVALID_AUTHORIZATION');
  const body=canonical(scope);if(Buffer.byteLength(body)>128000)throw new LocalError('SCOPE_TOO_LARGE');
  return this.store.transaction(()=>{const id=randomUUID(),now=this.store.clock();this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at) VALUES(?,?,?,?,'ACTIVE',?,?)").run(id,purpose,body,hash(scope),now,now+ttlMs);this.store.audit('LOCAL_USER','AUTHORIZE',id,{purpose,scopeHash:hash(scope)});return id;});
 }
 revoke(id){this.store.transaction(()=>{this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(id);this.db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='QUEUED' THEN 'CANCELLED' ELSE state END,updated_at=? WHERE authorization_id=? AND state IN('QUEUED','RUNNING')").run(this.store.clock(),id);this.store.audit('LOCAL_USER','REVOKE',id);});}
 enqueue(kind,payload,authorizationId,requestKey){
  if(!kinds.has(kind)||typeof requestKey!=='string'||!requestKey.length||requestKey.length>200)throw new LocalError('INVALID_JOB');
  return this.store.transaction(()=>{
   const old=this.db.prepare('SELECT * FROM jobs WHERE request_key=?').get(requestKey),digest=hash(payload);
   if(old){if(old.kind!==kind||old.payload_hash!==digest||old.authorization_id!==authorizationId)throw new LocalError('REQUEST_KEY_CONFLICT');return old.id;}
   const grant=this.db.prepare("SELECT * FROM authorizations WHERE id=? AND state='ACTIVE' AND expires_at>?").get(authorizationId,this.store.clock());
   if(!grant||grant.purpose!==kind||grant.scope_hash!==digest)throw new LocalError('AUTHORIZATION_REQUIRED');
   const id=randomUUID(),now=this.store.clock();this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'QUEUED',?,?,?)").run(id,requestKey,kind,canonical(payload),digest,authorizationId,now,now,now);
   this.store.audit('LOCAL_USER','JOB_ENQUEUED',id,{kind});return id;
  });
 }
 recover(){return this.store.transaction(()=>{
  const now=this.store.clock(),rows=this.db.prepare("SELECT * FROM jobs WHERE state='RUNNING' AND lease_until<=?").all(now);
  for(const row of rows){const state=row.dispatch_started&&['SEND','REVIEW'].includes(row.kind)?'UNKNOWN':'INTERRUPTED';this.db.prepare('UPDATE jobs SET state=?,lease_owner=NULL,lease_until=NULL,fence=fence+1,updated_at=? WHERE id=?').run(state,now,row.id);this.store.audit('RECOVERY','JOB_INTERRUPTED',row.id,{state});}
  return rows.length;
 });}
 claim(owner,leaseMs=30000){
  if(typeof owner!=='string'||!owner||owner.length>100||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new LocalError('INVALID_LEASE');
  return this.store.transaction(()=>{
   const now=this.store.clock();
   // An expired lease must be reconciled first, never stolen and blindly replayed.
   if(this.db.prepare("SELECT 1 FROM jobs WHERE state='RUNNING' LIMIT 1").get())return null;
   this.db.prepare("UPDATE jobs SET state='CANCELLED',updated_at=? WHERE state='QUEUED' AND (cancel_requested=1 OR NOT EXISTS(SELECT 1 FROM authorizations a WHERE a.id=jobs.authorization_id AND a.state='ACTIVE' AND a.expires_at>?))").run(now,now);
   const row=this.db.prepare("SELECT * FROM jobs WHERE state='QUEUED' AND available_at<=? ORDER BY created_at,id LIMIT 1").get(now);if(!row)return null;
   this.db.prepare("UPDATE jobs SET state='RUNNING',lease_owner=?,lease_until=?,fence=fence+1,updated_at=? WHERE id=? AND state='QUEUED'").run(owner,now+leaseMs,now,row.id);
   return {...row,state:'RUNNING',lease_owner:owner,lease_until:now+leaseMs,fence:row.fence+1,payload:JSON.parse(row.payload)};
  });
 }
 current(lease){const row=this.db.prepare("SELECT * FROM jobs WHERE id=? AND state='RUNNING' AND lease_owner=? AND fence=? AND lease_until>?").get(lease.id,lease.lease_owner,lease.fence,this.store.clock());if(!row)throw new LocalError('STALE_JOB_LEASE');return row;}
 heartbeat(lease,leaseMs=30000){if(!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new LocalError('INVALID_LEASE');return this.store.transaction(()=>{const row=this.current(lease);if(row.cancel_requested)throw new LocalError('CANCELLED');this.db.prepare('UPDATE jobs SET lease_until=?,updated_at=? WHERE id=?').run(this.store.clock()+leaseMs,this.store.clock(),row.id);});}
 beginDispatch(lease){return this.store.transaction(()=>{
  const row=this.current(lease),grant=this.db.prepare('SELECT * FROM authorizations WHERE id=?').get(row.authorization_id);
  if(row.kind==='SEND')throw new LocalError('SEND_REQUIRES_GUARDED_DISPATCH');
  if(row.cancel_requested||!grant||grant.state!=='ACTIVE'||grant.expires_at<=this.store.clock()||grant.scope_hash!==row.payload_hash)throw new LocalError('AUTHORIZATION_ENDED');
  if(row.dispatch_started)throw new LocalError('ALREADY_DISPATCHED');
  this.db.prepare('UPDATE jobs SET dispatch_started=1,updated_at=? WHERE id=?').run(this.store.clock(),row.id);
  this.db.prepare("UPDATE authorizations SET state='CONSUMED' WHERE id=?").run(grant.id);this.store.audit('AUTOMATION','DISPATCH_INTENT',row.id,{kind:row.kind});
 });}
 finish(lease,state,result={}){if(!['SUCCEEDED','FAILED','CANCELLED','UNKNOWN'].includes(state))throw new LocalError('INVALID_JOB_RESULT');return this.store.transaction(()=>{
  const row=this.current(lease);
  if(row.dispatch_started&&['SEND','REVIEW'].includes(row.kind)&&['FAILED','CANCELLED'].includes(state))throw new LocalError('EXTERNAL_RESULT_REQUIRES_RECONCILIATION');
  if(state==='SUCCEEDED'&&!row.dispatch_started)throw new LocalError('DISPATCH_REQUIRED');
  this.db.prepare('UPDATE jobs SET state=?,result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(state,canonical(result),this.store.clock(),row.id);this.store.audit('AUTOMATION','JOB_FINISHED',row.id,{state});
 });}
}
module.exports={LocalQueue};
