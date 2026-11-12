'use strict';
const {LocalError,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalReview}=require('./review.cjs');
const {requestQwen,qwenSettings}=require('@crm/local-runtime/model-provider');
// No environment variables, caller-supplied URLs, retry or fallback model. This
// adapter is registered in the desktop main process. Each batch requires either
// exact one-shot consent or validated frozen standing consent. Submitted work is never replayed.
class LocalModelExecutor {
 constructor(store,vault,{transport=globalThis.fetch}={}){this.store=store;this.vault=vault;this.transport=transport;this.queue=new LocalQueue(store);this.review=new LocalReview(store);}
 async prepare(_payload,signal,{lease}){
  if(signal.aborted)throw new LocalError('MODEL_CANCELLED');
  const job=this.queue.current(lease);if(job.kind!=='REVIEW'||job.dispatch_started||job.cancel_requested)throw new LocalError('INVALID_REVIEW_JOB');
  this.review.currentScope(job);
  if(!this.vault?.has('MODEL_KEY','qwen')||!this.vault.protector.available())throw new LocalError('MODEL_KEY_UNAVAILABLE');
 }
 async execute(command,signal,{lease}){
  const job=this.queue.current(lease),batch=this.store.db.prepare("SELECT * FROM review_batches WHERE id=? AND job_id=? AND state='DISPATCHED'").get(command?.batchId,job.id);
  if(signal.aborted||job.kind!=='REVIEW'||!job.dispatch_started||job.cancel_requested||!batch)throw new LocalError('MODEL_DISPATCH_NOT_CURRENT');
  const plan=this.review.currentScope(job),expected={batchId:batch.id,model:batch.model,modelVersion:batch.model_version,payload:plan.payload,maxOutputTokens:plan.estimate.outputTokens,maxSubmissions:1};
  if(hash(command)!==hash(expected)||hash(JSON.parse(batch.payload))!==hash(command.payload))throw new LocalError('MODEL_COMMAND_CHANGED');
  const model=this.store.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get(),key=this.vault.get('MODEL_KEY','qwen');
  const settings=qwenSettings({QWEN_MATCH_MODEL:model.model,QWEN_MATCH_ENABLED:model.authorized?'1':'0',QWEN_MATCH_CONSENT:model.consent,QWEN_MATCH_DAILY_LIMIT:model.daily_limit===null?'unlimited':String(model.daily_limit),QWEN_MATCH_PRICE_ACK:model.price_ack,QWEN_MATCH_ENDPOINT:'beijing-standard',QWEN_API_KEY:key});
  if(settings.status.state!=='READY')throw new LocalError('MODEL_PROVIDER_NOT_READY');
  this.store.transaction(()=>{
   const latest=this.queue.current(lease);if(latest.cancel_requested||this.store.db.prepare('SELECT 1 FROM model_submissions WHERE batch_id=?').get(batch.id))throw new LocalError('MODEL_ALREADY_SUBMITTED_OR_UNKNOWN');
   this.store.db.prepare('INSERT INTO model_submissions VALUES(?,?,?)').run(batch.id,job.payload_hash,this.store.clock());
   this.store.audit('AUTOMATION','MODEL_TRANSPORT_INTENT',batch.id,{scopeHash:job.payload_hash});
  });let submissions=0;
  try{
   const result=await requestQwen(settings,command.payload,(url,init)=>{
    if(signal.aborted||submissions++!==0||url!=='https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions'||init.method!=='POST'||init.redirect!=='error')throw new LocalError('MODEL_TRANSPORT_SCOPE_CHANGED');
    return this.transport(url,{...init,signal:AbortSignal.any([signal,init.signal])});
   },'comment-first');
   if(result.usage)this.store.transaction(()=>{this.queue.current(lease);this.store.audit('AUTOMATION','MODEL_USAGE_OBSERVED',batch.id,{inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});});
   return result.result;
  }catch(error){
   // Provider errors never contain request bodies, secrets or arbitrary upstream text.
   throw new LocalError(['RATE_LIMIT','AUTH_FAILED','UPSTREAM_FAILED','TIMEOUT'].includes(error?.code)?error.code:'MODEL_RESPONSE_UNVERIFIED');
  }finally{settings.key=undefined;}
 }
}
module.exports={LocalModelExecutor};
