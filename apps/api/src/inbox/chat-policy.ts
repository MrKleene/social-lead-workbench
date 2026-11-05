import {z} from 'zod';
import {dmDigest,validDmMessageId} from '../direct-messages/dm-send-protocol';
export const chatSelection=z.object({accountId:z.string().min(1).max(100),senderId:z.string().regex(/^[a-f0-9]{24}$/)}).strict();
export const chatDraft=chatSelection.extend({messageId:z.string().min(1).max(200),content:z.string().min(1).max(1000).refine(s=>s.trim()===s&&!/[\r\n\0]/.test(s),'仅支持一条不超过1000字的文字私信')}).strict();
export function validInbound(m:{channel:string;senderId:string;receiverId:string|null;platformId:string;body:string;contentType:string},sender:string){return m.channel==='DM'&&m.contentType==='TEXT'&&!!m.body&&m.receiverId===sender&&m.senderId!==sender&&validDmMessageId(m.platformId,m.senderId,sender);}
export function replyAnchor(m:{platformId:string;body:string}){return {messageId:m.platformId,contentSha256:dmDigest(m.body)}}
export const CHAT_SCOPE='inbox-reply-v1';
