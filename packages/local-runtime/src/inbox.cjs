'use strict';
const {randomUUID, createHash} = require('node:crypto');
const {LocalError} = require('./database.cjs');
const {LocalQueue} = require('./queue.cjs');
const digest = text => createHash('sha256').update(text).digest('hex');
const pid = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const {validDmMessageId}=require('@crm/local-runtime/policy');
const CONSENT='receive-inbox-may-mark-read-v1';
function validInbound(row, sender) {
  return row.channel === 'DM' && row.content_type === 'TEXT' && !!row.body &&
    row.identity_verified === 1 && !row.identity_conflict && row.receiver_id === sender &&
    pid(row.sender_id) && pid(sender) && row.sender_id !== sender &&
    validDmMessageId(row.platform_id, row.sender_id, sender);
}
function validComment(row, sender) {
  return row.channel === 'COMMENT' && row.content_type === 'TEXT' && !!row.body &&
    row.identity_verified === 1 && !row.identity_conflict && row.receiver_id === sender &&
    pid(row.sender_id) && pid(sender) && row.sender_id !== sender &&
    typeof row.post_id === 'string' && !!row.post_id && typeof row.comment_id === 'string' && !!row.comment_id;
}
function eventTime(value, now) {
  if (!value || !Number.isSafeInteger(value)) return null;
  const ms = value < 100000000000 ? value * 1000 : value;
  return ms >= 946684800000 && ms <= now + 5000 ? ms : null;
}
function text(value, max, optional = false) {
  if (optional && value == null) return null;
  if (typeof value !== 'string' || value.length > max) throw new LocalError('INVALID_INBOX_ITEM');
  return value;
}
function item(raw) {
  if (!raw || !['COMMENT', 'DM'].includes(raw.channel) || !['TEXT', 'UNSUPPORTED'].includes(raw.type ?? 'TEXT')) throw new LocalError('INVALID_INBOX_ITEM');
  const value = {id: text(raw.id, 200), sender: text(raw.sender, 128), channel: raw.channel,
    nickname: text(raw.nickname ?? '', 200), body: text(raw.body ?? '', 10000), type: raw.type ?? 'TEXT',
    postId: text(raw.postId, 128, true), postTitle: text(raw.postTitle, 500, true), commentId: text(raw.commentId, 128, true),
    published: raw.published ?? null, receiver: text(raw.receiver, 128, true)};
  if (!value.id || !value.sender || value.published !== null && !Number.isSafeInteger(value.published)) throw new LocalError('INVALID_INBOX_ITEM');
  return value;
}
function boundAccount(store, id, revision, sender) {
  const account = store.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(id);
  if (!account || !account.session_ref || !pid(account.platform_user_id) ||
      revision !== undefined && account.revision !== revision || sender !== undefined && account.platform_user_id !== sender) throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
  return account;
}
function checking(account) {
  if (account.collect_state === 'CHECKING' || account.contact_state === 'CHECKING') throw new LocalError('ACCOUNT_CHECK_IN_PROGRESS');
}
function pageInput(input = {}) {
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 100000 || input.accountId !== undefined && (typeof input.accountId !== 'string' || input.accountId.length>200) || input.query !== undefined && (typeof input.query !== 'string' || input.query.length>200) || input.unread !== undefined && typeof input.unread !== 'boolean') throw new LocalError('INVALID_INBOX_QUERY');
  return {page, offset: (page - 1) * 30};
}
function body(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 1000 || /[\r\n\0]/.test(value)) throw new LocalError('INVALID_INBOX_REPLY');
  return value;
}
function sourceReference(store, platformId) {
  return store.db.prepare('SELECT source_reference_ref FROM run_posts WHERE platform_id=? AND source_reference_ref IS NOT NULL ORDER BY rowid DESC LIMIT 1').get(platformId)?.source_reference_ref ?? null;
}

// Port of inbox-store/chat-store semantics. Transport bytes and platform calls
// stay outside this repository. Only an identity-verified INBOX executor may ingest.
class LocalInbox {
  constructor(store) { this.store = store; this.db = store.db; this.queue = new LocalQueue(store); }
  accounts() {
    return this.db.prepare(`SELECT a.id,a.name,a.platform_user_id,a.collect_state,a.contact_state,a.eligibility_checked_at,
      (SELECT count(*) FROM received_messages m WHERE m.account_id=a.id AND m.channel='DM' AND m.is_new=1 AND m.read_at IS NULL) unread_dm,
      (SELECT count(*) FROM received_messages m WHERE m.account_id=a.id AND m.channel='COMMENT' AND m.is_new=1 AND m.read_at IS NULL) unread_comment
      FROM accounts a WHERE a.state<>'ARCHIVED' ORDER BY a.name,a.id`).all();
  }
  /** 一次性获取：不再维持 15 分钟推送窗口，账号能力与平台锁由队列保证。 */
  start(lease) {
    return this.store.transaction(() => {
      const job = this.queue.current(lease), scope = JSON.parse(job.payload);
      if (job.kind !== 'INBOX' || !job.dispatch_started || job.cancel_requested ||
          scope.consent !== CONSENT || scope.mode !== 'SNAPSHOT' || !Number.isInteger(scope.accountRevision) || scope.accountRevision<1 || !pid(scope.expectedSender)) throw new LocalError('INBOX_AUTHORIZATION_REQUIRED');
      const account=boundAccount(this.store, scope.accountId, scope.accountRevision, scope.expectedSender);
      checking(account);
      const now = this.store.clock();
      const active = this.db.prepare("SELECT r.account_id FROM inbox_receivers r JOIN jobs j ON j.id=r.job_id WHERE r.state NOT IN('STOPPED','FAILED') AND r.stop_requested=0 AND r.expires_at>? AND j.state='RUNNING' AND j.lease_until>? AND r.job_id<>?").get(now, now, job.id);
      if (active) throw new LocalError('INBOX_ALREADY_RUNNING');
      const generation = job.id + ':' + job.fence;
      const prior=this.db.prepare('SELECT generation FROM inbox_receivers WHERE account_id=?').get(scope.accountId);
      if(prior?.generation===generation){this.current(lease,{accountId:scope.accountId,generation});return {accountId:scope.accountId,generation};}
      const grant=this.db.prepare('SELECT expires_at FROM authorizations WHERE id=?').get(job.authorization_id);
      if(!grant||grant.expires_at<=now)throw new LocalError('INBOX_AUTHORIZATION_ENDED');
      const baseline=this.db.prepare('SELECT baseline_at FROM inbox_receivers WHERE account_id=?').get(scope.accountId)?.baseline_at??now;
      this.db.prepare(`INSERT INTO inbox_receivers(account_id,job_id,generation,account_revision,expected_sender,state,baseline_at,updated_at,expires_at)
        VALUES(?,?,?,?,?,'CONNECTING',?,?,?) ON CONFLICT(account_id) DO UPDATE SET
        job_id=excluded.job_id,generation=excluded.generation,account_revision=excluded.account_revision,expected_sender=excluded.expected_sender,
        baseline_at=excluded.baseline_at,state='CONNECTING',updated_at=excluded.updated_at,expires_at=excluded.expires_at,stop_requested=0,
        comment_mode='UNCONFIRMED',dm_mode='UNCONFIRMED',coverage='UNCONFIRMED',reason=NULL`).run(scope.accountId, job.id, generation, scope.accountRevision, scope.expectedSender, baseline, now, Math.min(now + 300000,grant.expires_at));
      this.store.audit('AUTOMATION', 'INBOX_SNAPSHOT_STARTED', scope.accountId, {generation, maxSubmissions: 0});
      return {accountId: scope.accountId, generation};
    });
  }
  current(lease, receiver) {
    const job = this.queue.current(lease);
    const row = this.db.prepare('SELECT * FROM inbox_receivers WHERE account_id=? AND generation=? AND job_id=?').get(receiver.accountId, receiver.generation, job.id);
    if (job.kind !== 'INBOX' || job.cancel_requested || !row || row.stop_requested || ['STOPPED', 'FAILED'].includes(row.state) || row.expires_at <= this.store.clock()) throw new LocalError('STALE_RECEIVER');
    boundAccount(this.store, row.account_id, row.account_revision, row.expected_sender);
    return row;
  }
  status(lease, receiver, patch) {
    return this.store.transaction(() => {
      const row = this.current(lease, receiver);
      if (!['CONNECTING','SYNCING','LISTENING','RECONNECTING','YIELDING','STOPPED','FAILED'].includes(patch.state) ||
          ['commentMode','dmMode'].some(key => patch[key] !== undefined && !['UNCONFIRMED','PUSH','RECONCILIATION','UNAVAILABLE'].includes(patch[key]))) throw new LocalError('INVALID_RECEIVER_STATUS');
      this.db.prepare('UPDATE inbox_receivers SET state=?,comment_mode=?,dm_mode=?,coverage=?,updated_at=?,reason=? WHERE account_id=? AND generation=?')
        .run(patch.state, patch.commentMode ?? row.comment_mode, patch.dmMode ?? row.dm_mode, patch.coverage ?? row.coverage, this.store.clock(), typeof patch.reason === 'string' ? patch.reason.slice(0, 200) : null, row.account_id, row.generation);
    });
  }
  stop(accountId) {
    return this.store.transaction(() => {
      const row = this.db.prepare('SELECT job_id FROM inbox_receivers WHERE account_id=?').get(accountId);
      if (!row) return {stopped: false};
      this.db.prepare("UPDATE inbox_receivers SET stop_requested=1,state='STOPPED',updated_at=? WHERE account_id=?").run(this.store.clock(), accountId);
      this.db.prepare("UPDATE jobs SET cancel_requested=1 WHERE id=? AND state='RUNNING'").run(row.job_id);
      this.store.audit('LOCAL_USER', 'INBOX_STOP_REQUESTED', accountId);
      return {stopped: true};
    });
  }
  ingest(lease, receiver, rawItems, source) {
    if (!Array.isArray(rawItems) || rawItems.length > 500 || !['PUSH','RECONCILIATION'].includes(source)) throw new LocalError('INBOX_BOUND');
    const rows = rawItems.map(item);
    return this.store.transaction(() => {
      const state = this.current(lease, receiver), now = this.store.clock();
      let added = 0, rebound = 0, conflicts = 0;
      for (const value of rows) {
        if (value.receiver !== null && value.receiver !== state.expected_sender) throw new LocalError('INBOX_RECEIVER_MISMATCH');
        if (value.sender === state.expected_sender) continue;
        const published = eventTime(value.published, now), fresh = published !== null && published > state.baseline_at;
        const old = this.db.prepare('SELECT * FROM received_messages WHERE account_id=? AND channel=? AND platform_id=?').get(state.account_id, value.channel, value.id);
        if (!old) {
          this.db.prepare(`INSERT INTO received_messages(id,account_id,channel,platform_id,sender_id,receiver_id,sender_name,body,content_type,post_id,post_title,comment_id,published_at,received_at,is_new,source,identity_verified)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(randomUUID(), state.account_id, value.channel, value.id, value.sender, state.expected_sender,
              value.nickname, value.body, value.type, value.postId, value.postTitle, value.commentId, published, now, fresh ? 1 : 0, source);
          added++;
          continue;
        }
        if (old.sender_id !== value.sender || old.body !== value.body || old.content_type !== value.type || old.receiver_id !== null && old.receiver_id !== state.expected_sender) {
          this.db.prepare('UPDATE received_messages SET identity_conflict=1 WHERE id=?').run(old.id);
          this.store.audit('AUTOMATION', 'INBOX_IDENTITY_CONFLICT', old.id, {generation: state.generation});
          conflicts++;
          continue;
        }
        if (!old.identity_verified && !old.identity_conflict && (old.receiver_id === null || old.receiver_id === state.expected_sender)) {
          this.db.prepare('UPDATE received_messages SET receiver_id=?,identity_verified=1 WHERE id=?').run(state.expected_sender, old.id);
          this.store.audit('AUTOMATION', 'INBOX_MESSAGE_IDENTITY_OBSERVED', old.id, {generation: state.generation, source});
          rebound++;
        }
        if (source === 'PUSH' && old.published_at === null && published !== null) {
          this.db.prepare("UPDATE received_messages SET published_at=?,is_new=?,source='PUSH',sender_name=CASE WHEN sender_name='' THEN ? ELSE sender_name END WHERE id=?").run(published, fresh ? 1 : 0, value.nickname, old.id);
        }
      }
      if (added || rebound || conflicts) this.db.prepare('UPDATE inbox_receivers SET last_event_at=? WHERE account_id=? AND generation=?').run(now, state.account_id, state.generation);
      return {added, rebound, conflicts};
    });
  }
  list(input = {}) {
    const {page, offset} = pageInput(input);
    if (input.channel !== undefined && !['COMMENT','DM'].includes(input.channel)) throw new LocalError('INVALID_INBOX_QUERY');
    const filter = `WHERE (? IS NULL OR account_id=?) AND (? IS NULL OR channel=?) AND (?=0 OR (is_new=1 AND read_at IS NULL)) AND (?='' OR instr(body,?)>0 OR instr(sender_name,?)>0 OR instr(coalesce(post_title,''),?)>0)`;
    const args = [input.accountId ?? null,input.accountId ?? null,input.channel ?? null,input.channel ?? null,input.unread ? 1 : 0,...Array(4).fill(input.query??'')];
    const replyable = "EXISTS(SELECT 1 FROM run_posts p WHERE p.platform_id=received_messages.post_id AND p.source_reference_ref IS NOT NULL) AS replyable";
    return {items: this.db.prepare('SELECT *,is_new=1 AND read_at IS NULL AS unread,'+replyable+' FROM received_messages '+filter+' ORDER BY sequence DESC LIMIT 30 OFFSET ?').all(...args, offset),
      total: this.db.prepare('SELECT count(*) n FROM received_messages '+filter).get(...args).n, page, pageSize: 30};
  }
  unread() { return this.db.prepare("SELECT count(*) count FROM received_messages m JOIN accounts a ON a.id=m.account_id WHERE m.is_new=1 AND m.read_at IS NULL AND a.state<>'ARCHIVED'").get(); }
  markRead(id) { return this.store.transaction(() => ({updated: this.db.prepare('UPDATE received_messages SET read_at=COALESCE(read_at,?) WHERE id=?').run(this.store.clock(), id).changes === 1})); }
  markThreadRead(accountId,senderId) {
    return this.store.transaction(() => ({updated:this.db.prepare("UPDATE received_messages SET read_at=COALESCE(read_at,?) WHERE account_id=? AND sender_id=? AND channel='DM' AND is_new=1 AND read_at IS NULL").run(this.store.clock(),accountId,senderId).changes}));
  }
  threads(input = {}) {
    const {page, offset} = pageInput(input);
    const peers = `SELECT m.account_id,m.sender_id peer_id,m.sender_name name,m.body,m.received_at at,m.sequence,m.is_new,m.read_at,'IN' direction
      FROM received_messages m WHERE m.channel='DM'
      UNION ALL
      SELECT s.account_id,s.recipient_id,s.recipient_name,s.content,s.updated_at,NULL,0,NULL,'OUT'
      FROM send_attempts s WHERE s.channel='DM' AND s.recipient_id IS NOT NULL AND s.state<>'CANCELLED'`;
    const ranked = `WITH peers AS (${peers}), ranked AS (
      SELECT p.*,ROW_NUMBER() OVER(PARTITION BY account_id,peer_id ORDER BY at DESC,sequence DESC) rank,
      SUM(CASE WHEN direction='IN' AND is_new=1 AND read_at IS NULL THEN 1 ELSE 0 END) OVER(PARTITION BY account_id,peer_id) unread
      FROM peers p)
      SELECT r.account_id,r.peer_id sender_id,coalesce(NULLIF(r.name,''),'未命名用户') sender_name,r.body,r.at received_at,r.unread,r.direction
      FROM ranked r JOIN accounts a ON a.id=r.account_id WHERE r.rank=1 AND a.state<>'ARCHIVED'
      AND (? IS NULL OR r.account_id=?) AND (?=0 OR r.unread>0)
      AND (?='' OR instr(coalesce(r.name,''),?)>0 OR instr(r.body,?)>0
        OR EXISTS(SELECT 1 FROM received_messages x WHERE x.account_id=r.account_id AND x.sender_id=r.peer_id AND x.channel='DM' AND instr(x.body,?)>0)
        OR EXISTS(SELECT 1 FROM send_attempts x WHERE x.account_id=r.account_id AND x.recipient_id=r.peer_id AND x.channel='DM' AND instr(x.content,?)>0))`;
    const args=[input.accountId??null,input.accountId??null,input.unread?1:0,...Array(5).fill(input.query??'')];
    return {items:this.db.prepare(ranked+' ORDER BY r.at DESC LIMIT 30 OFFSET ?').all(...args,offset),total:this.db.prepare('SELECT count(*) n FROM ('+ranked+')').get(...args).n,page,pageSize:30};
  }
  thread({accountId, senderId, page = 1}) {
    const {offset} = pageInput({page, accountId});
    if(!pid(senderId))throw new LocalError('INVALID_INBOX_QUERY');
    const account = this.db.prepare("SELECT * FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(accountId);
    if(!account)throw new LocalError('INBOX_CONVERSATION_NOT_FOUND');
    const anchor=this.latest(accountId,senderId);
    const union = `SELECT id,'IN' direction,body content,COALESCE(published_at,received_at) at,'RECEIVED' outcome,is_new=1 AND read_at IS NULL unread FROM received_messages WHERE account_id=? AND sender_id=? AND channel='DM'
      UNION ALL SELECT id,'OUT' direction,content,updated_at at,state outcome,0 unread FROM send_attempts WHERE account_id=? AND recipient_id=? AND channel='DM' AND state<>'CANCELLED'`;
    const args=[accountId,senderId,accountId,senderId];
    const blocked=!!this.db.prepare("SELECT 1 FROM contact_ledger WHERE platform='XHS' AND channel='DM' AND recipient_id=? AND blocked=1").get(senderId);
    const answered=!!anchor&&(!!this.db.prepare('SELECT 1 FROM inbound_history_blocks WHERE account_id=? AND platform_id=?').get(accountId,anchor.platform_id)||!!this.db.prepare("SELECT 1 FROM send_attempts WHERE inbound_message_id=? AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN')").get(anchor.id));
    return {account:{id:account.id,name:account.name},senderId,anchorId:anchor?.id??null,
      replyEvidence:!!anchor&&validInbound(anchor,account.platform_user_id),
      replyable:!!anchor&&validInbound(anchor,account.platform_user_id)&&!blocked&&!answered,
      items:this.db.prepare('SELECT * FROM ('+union+') ORDER BY at DESC,id DESC LIMIT 30 OFFSET ?').all(...args,offset).reverse(),
      total:this.db.prepare('SELECT count(*) n FROM ('+union+')').get(...args).n,page,pageSize:30};
  }
  latest(accountId, senderId) { return this.db.prepare("SELECT * FROM received_messages WHERE account_id=? AND sender_id=? AND channel='DM' ORDER BY sequence DESC LIMIT 1").get(accountId,senderId); }
  replyScope({accountId, senderId, messageId, content}) {
    const account = boundAccount(this.store, accountId);checking(account);const message = this.latest(accountId, senderId);
    if (!message || message.id !== messageId) throw new LocalError('INBOX_ANCHOR_CHANGED');
    const scope = {platform:'XHS',channel:'DM',intent:'INBOX_REPLY',purpose:'INBOX_REPLY',accountId,accountRevision:account.revision,recipientId:senderId,content:body(content),
      target:{recipientId:senderId,inboxMessageId:messageId,receiverId:account.platform_user_id,anchorPlatformId:message.platform_id,inboundHash:digest(message.body)}};
    assertReplyScope(this.store, scope);
    return scope;
  }
  chatScope({accountId, senderId, content, recipientName, batchId}) {
    const account = boundAccount(this.store, accountId);checking(account);
    if(!pid(senderId))throw new LocalError('INVALID_INBOX_QUERY');
    const target={recipientId:senderId,...(recipientName?{recipientName:String(recipientName).slice(0,200)}:{})};
    const scope={platform:'XHS',channel:'DM',intent:'FIRST_CONTACT',purpose:'CHAT_FOLLOW_UP',accountId,accountRevision:account.revision,recipientId:senderId,content:body(content),target,basis:{type:'INBOX_CHAT'},...(batchId?{batchId}:{})};
    assertChatScope(this.store,scope);return scope;
  }
  commentReplyScope({accountId, receivedMessageId, content, batchId}) {
    const account=boundAccount(this.store,accountId);checking(account);
    const row=this.db.prepare("SELECT * FROM received_messages WHERE id=? AND account_id=? AND channel='COMMENT'").get(receivedMessageId,accountId);
    if(!row||!validComment(row,account.platform_user_id))throw new LocalError('INBOX_COMMENT_UNAVAILABLE');
    if(!sourceReference(this.store,row.post_id))throw new LocalError('COMMENT_REFERENCE_UNAVAILABLE');
    const scope={platform:'XHS',channel:'COMMENT',intent:'FIRST_CONTACT',purpose:'INBOX_COMMENT_REPLY',accountId,accountRevision:account.revision,recipientId:row.sender_id,content:body(content),
      target:{postId:row.post_id,commentId:row.comment_id,recipientId:row.sender_id,receivedMessageId:row.id},basis:{type:'INBOX_COMMENT'},...(batchId?{batchId}:{})};
    assertCommentReplyScope(this.store,scope);return scope;
  }
}
function assertReplyScope(store, scope, ownRequestKey = '') {
  const a = boundAccount(store, scope.accountId, scope.accountRevision, scope.target.receiverId);
  if (scope.intent !== 'INBOX_REPLY' || scope.purpose !== 'INBOX_REPLY' || scope.channel !== 'DM' || typeof scope.content !== 'string' || !scope.content.length || scope.content.length > 1000 || scope.content.trim() !== scope.content || /[\r\n\0]/.test(scope.content)) throw new LocalError('INVALID_INBOX_REPLY');
  const latest = new LocalInbox(store).latest(scope.accountId, scope.recipientId);
  if (!latest || latest.id !== scope.target.inboxMessageId || !validInbound(latest,a.platform_user_id) || latest.platform_id !== scope.target.anchorPlatformId || digest(latest.body) !== scope.target.inboundHash) throw new LocalError('RELIABLE_INBOUND_IDENTITY_REQUIRED');
  if (store.db.prepare('SELECT 1 FROM inbound_history_blocks WHERE account_id=? AND platform_id=?').get(scope.accountId,latest.platform_id)) throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
  if (store.db.prepare("SELECT 1 FROM contact_ledger WHERE platform='XHS' AND recipient_id=? AND blocked=1").get(scope.recipientId)) throw new LocalError('DO_NOT_CONTACT_OR_RETAINED_RISK');
  if (store.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND request_key<>? AND json_extract(payload,'$.recipientId')=?").get(ownRequestKey,scope.recipientId)) throw new LocalError('RECIPIENT_HAS_PENDING_SEND');
  if (store.db.prepare("SELECT 1 FROM send_attempts WHERE request_key<>? AND (inbound_message_id=? AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN') OR platform='XHS' AND recipient_id=? AND state IN('RESERVED','DISPATCHED','UNKNOWN'))").get(ownRequestKey,latest.id,scope.recipientId)) throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
  return latest;
}
function assertChatScope(store, scope, ownRequestKey='') {
  const a=boundAccount(store,scope.accountId,scope.accountRevision,undefined);checking(a);
  if(scope.purpose!=='CHAT_FOLLOW_UP'||scope.intent!=='FIRST_CONTACT'||scope.channel!=='DM'||scope.basis?.type!=='INBOX_CHAT'||scope.target?.recipientId!==scope.recipientId)throw new LocalError('INVALID_CHAT_SCOPE');
  if(typeof scope.content!=='string'||!scope.content.trim()||scope.content!==scope.content.trim()||scope.content.length>1000||/[\r\n\0]/.test(scope.content))throw new LocalError('INVALID_INBOX_REPLY');
  if(!store.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND account_id=? AND recipient_id=? AND channel='DM' AND state='CONFIRMED'").get(scope.accountId,scope.recipientId))throw new LocalError('NOT_CONTACTED');
  if(store.db.prepare("SELECT 1 FROM contact_ledger WHERE platform='XHS' AND recipient_id=? AND blocked=1").get(scope.recipientId))throw new LocalError('DO_NOT_CONTACT');
  if(store.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND request_key<>? AND json_extract(payload,'$.recipientId')=?").get(ownRequestKey,scope.recipientId))throw new LocalError('RECIPIENT_HAS_PENDING_SEND');
}
function assertCommentReplyScope(store, scope, ownRequestKey='') {
  const a=boundAccount(store,scope.accountId,scope.accountRevision,undefined);checking(a);
  if(scope.purpose!=='INBOX_COMMENT_REPLY'||scope.intent!=='FIRST_CONTACT'||scope.channel!=='COMMENT'||scope.basis?.type!=='INBOX_COMMENT')throw new LocalError('INVALID_CHAT_SCOPE');
  if(typeof scope.content!=='string'||!scope.content.trim()||scope.content!==scope.content.trim()||scope.content.length>1000||/[\r\n\0]/.test(scope.content))throw new LocalError('INVALID_INBOX_REPLY');
  const row=store.db.prepare("SELECT * FROM received_messages WHERE id=? AND account_id=? AND channel='COMMENT'").get(scope.target?.receivedMessageId,scope.accountId);
  if(!row||!validComment(row,a.platform_user_id)||scope.target.postId!==row.post_id||scope.target.commentId!==row.comment_id||scope.recipientId!==row.sender_id)throw new LocalError('INBOX_COMMENT_UNAVAILABLE');
  if(!sourceReference(store,row.post_id))throw new LocalError('COMMENT_REFERENCE_UNAVAILABLE');
  if(store.db.prepare('SELECT 1 FROM inbound_history_blocks WHERE account_id=? AND platform_id=?').get(scope.accountId,row.platform_id))throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
  if(store.db.prepare("SELECT 1 FROM contact_ledger WHERE platform='XHS' AND recipient_id=? AND blocked=1").get(scope.recipientId))throw new LocalError('DO_NOT_CONTACT');
  if(store.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND request_key<>? AND json_extract(payload,'$.target.receivedMessageId')=?").get(ownRequestKey,row.id))throw new LocalError('RECIPIENT_HAS_PENDING_SEND');
  if(store.db.prepare("SELECT 1 FROM send_attempts WHERE request_key<>? AND inbound_message_id=? AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN')").get(ownRequestKey,row.id))throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
}
module.exports = {LocalInbox,assertReplyScope,assertChatScope,assertCommentReplyScope,validInbound,validComment,validDmMessageId,eventTime,digest};