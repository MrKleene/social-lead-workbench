'use strict';
const {randomUUID, createHash} = require('node:crypto');
const {LocalError} = require('./database.cjs');
const {LocalQueue} = require('./queue.cjs');
const digest = text => createHash('sha256').update(text).digest('hex');
const pid = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const {validDmMessageId}=require('./policy.cjs');
function validInbound(row, sender) {
  return row.channel === 'DM' && row.content_type === 'TEXT' && !!row.body &&
    row.identity_verified === 1 && !row.identity_conflict && row.receiver_id === sender &&
    pid(row.sender_id) && pid(sender) && row.sender_id !== sender &&
    validDmMessageId(row.platform_id, row.sender_id, sender);
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
function pageInput(input = {}) {
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 100000 || input.accountId !== undefined && typeof input.accountId !== 'string' || input.unread !== undefined && typeof input.unread !== 'boolean') throw new LocalError('INVALID_INBOX_QUERY');
  return {page, offset: (page - 1) * 30};
}

// Port of inbox-store/chat-store semantics. Transport bytes and platform calls
// stay outside this repository. Only an identity-verified INBOX executor may ingest.
class LocalInbox {
  constructor(store) { this.store = store; this.db = store.db; this.queue = new LocalQueue(store); }
  start(lease) {
    return this.store.transaction(() => {
      const job = this.queue.current(lease), scope = JSON.parse(job.payload);
      if (job.kind !== 'INBOX' || !job.dispatch_started || job.cancel_requested ||
          scope.consent !== 'receive-inbox-may-mark-read-v1' || scope.minutes !== 15 || !Number.isInteger(scope.accountRevision) || scope.accountRevision<1 || !pid(scope.expectedSender)) throw new LocalError('INBOX_AUTHORIZATION_REQUIRED');
      boundAccount(this.store, scope.accountId, scope.accountRevision, scope.expectedSender);
      const now = this.store.clock();
      const active = this.db.prepare("SELECT r.account_id FROM inbox_receivers r JOIN jobs j ON j.id=r.job_id WHERE r.state NOT IN('STOPPED','FAILED') AND r.stop_requested=0 AND r.expires_at>? AND j.state='RUNNING' AND j.lease_until>? AND r.job_id<>?").get(now, now, job.id);
      if (active) throw new LocalError('INBOX_ALREADY_RUNNING');
      const generation = job.id + ':' + job.fence;
      const prior=this.db.prepare('SELECT generation FROM inbox_receivers WHERE account_id=?').get(scope.accountId);
      if(prior?.generation===generation){this.current(lease,{accountId:scope.accountId,generation});return {accountId:scope.accountId,generation};}
      const grant=this.db.prepare('SELECT expires_at FROM authorizations WHERE id=?').get(job.authorization_id);
      if(!grant||grant.expires_at<=now)throw new LocalError('INBOX_AUTHORIZATION_ENDED');
      this.db.prepare(`INSERT INTO inbox_receivers(account_id,job_id,generation,account_revision,expected_sender,state,baseline_at,updated_at,expires_at)
        VALUES(?,?,?,?,?,'CONNECTING',?,?,?) ON CONFLICT(account_id) DO UPDATE SET
        job_id=excluded.job_id,generation=excluded.generation,account_revision=excluded.account_revision,expected_sender=excluded.expected_sender,
        baseline_at=CASE WHEN inbox_receivers.expected_sender=excluded.expected_sender THEN inbox_receivers.baseline_at ELSE excluded.baseline_at END,
        state='CONNECTING',updated_at=excluded.updated_at,expires_at=excluded.expires_at,stop_requested=0,
        comment_mode='UNCONFIRMED',dm_mode='UNCONFIRMED',coverage='UNCONFIRMED',reason=NULL`).run(scope.accountId, job.id, generation, scope.accountRevision, scope.expectedSender, now, now, Math.min(now + 900000,grant.expires_at));
      this.store.audit('AUTOMATION', 'INBOX_RECEIVER_STARTED', scope.accountId, {generation, maxSubmissions: 0});
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
      // A transport status is not proof of completeness or real-time delivery.
      this.db.prepare('UPDATE inbox_receivers SET state=?,comment_mode=?,dm_mode=?,updated_at=?,reason=? WHERE account_id=? AND generation=?')
        .run(patch.state, patch.commentMode ?? row.comment_mode, patch.dmMode ?? row.dm_mode, this.store.clock(), typeof patch.reason === 'string' ? patch.reason.slice(0, 200) : null, row.account_id, row.generation);
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
          this.db.prepare("UPDATE received_messages SET published_at=?,is_new=?,source='PUSH',sender_name=CASE WHEN sender_name='' THEN ? ELSE sender_name END WHERE id=?")
            .run(published, fresh ? 1 : 0, value.nickname, old.id);
        }
      }
      if (added || rebound || conflicts) this.db.prepare('UPDATE inbox_receivers SET last_event_at=? WHERE account_id=? AND generation=?').run(now, state.account_id, state.generation);
      return {added, rebound, conflicts};
    });
  }
  list(input = {}) {
    const {page, offset} = pageInput(input);
    if (input.channel !== undefined && !['COMMENT','DM'].includes(input.channel)) throw new LocalError('INVALID_INBOX_QUERY');
    const filter = 'WHERE (? IS NULL OR account_id=?) AND (? IS NULL OR channel=?) AND (?=0 OR (is_new=1 AND read_at IS NULL))';
    const args = [input.accountId ?? null,input.accountId ?? null,input.channel ?? null,input.channel ?? null,input.unread ? 1 : 0];
    return {items: this.db.prepare('SELECT *,is_new=1 AND read_at IS NULL AS unread FROM received_messages '+filter+' ORDER BY sequence DESC LIMIT 30 OFFSET ?').all(...args, offset),
      total: this.db.prepare('SELECT count(*) n FROM received_messages '+filter).get(...args).n, page, pageSize: 30};
  }
  unread() { return this.db.prepare('SELECT count(*) count FROM received_messages WHERE is_new=1 AND read_at IS NULL').get(); }
  markRead(id) { return this.store.transaction(() => ({updated: this.db.prepare('UPDATE received_messages SET read_at=COALESCE(read_at,?) WHERE id=?').run(this.store.clock(), id).changes === 1})); }
  threads(input = {}) {
    const {page, offset} = pageInput(input);
    const query = `WITH ranked AS (SELECT m.*,a.name account_name,
      ROW_NUMBER() OVER(PARTITION BY m.account_id,m.sender_id ORDER BY m.sequence DESC) rank,
      SUM(CASE WHEN m.is_new=1 AND m.read_at IS NULL THEN 1 ELSE 0 END) OVER(PARTITION BY m.account_id,m.sender_id) unread
      FROM received_messages m JOIN accounts a ON a.id=m.account_id WHERE m.channel='DM' AND a.state<>'ARCHIVED' AND (? IS NULL OR m.account_id=?))
      SELECT account_id,sender_id,account_name,sender_name,body,received_at,sequence,unread FROM ranked WHERE rank=1 AND (?=0 OR unread>0)`;
    const args = [input.accountId ?? null,input.accountId ?? null,input.unread ? 1 : 0];
    return {items: this.db.prepare(query+' ORDER BY sequence DESC LIMIT 30 OFFSET ?').all(...args,offset), total: this.db.prepare('SELECT count(*) n FROM ('+query+')').get(...args).n, page, pageSize: 30};
  }
  thread({accountId, senderId, page = 1}) {
    const {offset} = pageInput({page, accountId});
    const account = this.db.prepare("SELECT * FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(accountId);
    const anchor = this.latest(accountId, senderId);
    if (!account || !anchor) throw new LocalError('INBOUND_CONVERSATION_REQUIRED');
    const union = `SELECT id,'IN' direction,body content,COALESCE(published_at,received_at) at,'RECEIVED' outcome,is_new=1 AND read_at IS NULL unread FROM received_messages WHERE account_id=? AND sender_id=? AND channel='DM'
      UNION ALL SELECT id,'OUT' direction,content,updated_at at,state outcome,0 unread FROM send_attempts WHERE account_id=? AND recipient_id=? AND channel='DM' AND state<>'CANCELLED'`;
    const args = [accountId,senderId,accountId,senderId];
    return {account: {id:account.id,name:account.name},senderId,anchorId:anchor.id,replyEvidence:validInbound(anchor,account.platform_user_id),
      items:this.db.prepare('SELECT * FROM ('+union+') ORDER BY at DESC,id DESC LIMIT 30 OFFSET ?').all(...args,offset).reverse(),
      total:this.db.prepare('SELECT count(*) n FROM ('+union+')').get(...args).n,page,pageSize:30};
  }
  latest(accountId, senderId) { return this.db.prepare("SELECT * FROM received_messages WHERE account_id=? AND sender_id=? AND channel='DM' ORDER BY sequence DESC LIMIT 1").get(accountId,senderId); }
  replyScope({accountId, senderId, messageId, content}) {
    const account = boundAccount(this.store, accountId), message = this.latest(accountId, senderId);
    if (!message || message.id !== messageId) throw new LocalError('INBOX_ANCHOR_CHANGED');
    const scope = {platform:'XHS',channel:'DM',intent:'INBOX_REPLY',accountId,accountRevision:account.revision,recipientId:senderId,content,
      target:{recipientId:senderId,inboxMessageId:messageId,receiverId:account.platform_user_id,anchorPlatformId:message.platform_id,inboundHash:digest(message.body)}};
    assertReplyScope(this.store, scope);
    return scope;
  }
}
function assertReplyScope(store, scope, ownRequestKey = '') {
  const a = boundAccount(store, scope.accountId, scope.accountRevision, scope.target.receiverId);
  if (scope.intent !== 'INBOX_REPLY' || scope.channel !== 'DM' || typeof scope.content !== 'string' || !scope.content.length || scope.content.length > 1000 || scope.content.trim() !== scope.content || /[\r\n\0]/.test(scope.content)) throw new LocalError('INVALID_INBOX_REPLY');
  const latest = new LocalInbox(store).latest(scope.accountId, scope.recipientId);
  if (!latest || latest.id !== scope.target.inboxMessageId || !validInbound(latest,a.platform_user_id) || latest.platform_id !== scope.target.anchorPlatformId || digest(latest.body) !== scope.target.inboundHash) throw new LocalError('RELIABLE_INBOUND_IDENTITY_REQUIRED');
  if (store.db.prepare('SELECT 1 FROM inbound_history_blocks WHERE account_id=? AND platform_id=?').get(scope.accountId,latest.platform_id)) throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
  if (store.db.prepare("SELECT 1 FROM contact_ledger WHERE platform='XHS' AND recipient_id=? AND blocked=1").get(scope.recipientId)) throw new LocalError('DO_NOT_CONTACT_OR_RETAINED_RISK');
  if (store.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND request_key<>? AND json_extract(payload,'$.recipientId')=?").get(ownRequestKey,scope.recipientId)) throw new LocalError('RECIPIENT_HAS_PENDING_SEND');
  if (store.db.prepare("SELECT 1 FROM send_attempts WHERE request_key<>? AND (inbound_message_id=? AND state IN('RESERVED','DISPATCHED','CONFIRMED','UNKNOWN') OR platform='XHS' AND recipient_id=? AND state IN('RESERVED','DISPATCHED','UNKNOWN'))").get(ownRequestKey,latest.id,scope.recipientId)) throw new LocalError('INBOX_ALREADY_ANSWERED_OR_UNKNOWN');
  return latest;
}
module.exports = {LocalInbox,assertReplyScope,validInbound,validDmMessageId,eventTime,digest};
