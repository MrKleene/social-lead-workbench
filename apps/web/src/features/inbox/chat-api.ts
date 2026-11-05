import {api,send} from '@/lib/api';
export type Conversation={accountId:string;senderId:string;accountName:string|null;senderName:string;body:string;lastAt:string;unread:number};
export type ChatMessage={id:string;direction:'IN'|'OUT';content:string|null;at:string;platformAt:string|null;outcome:string;unread:boolean;senderName:string;reason:string|null};
export type ChatThread={account:{id:string;loginNickname:string|null};replyEvidence:boolean;senderId:string;senderName:string;anchorId:string;items:ChatMessage[];total:number;page:number;pageSize:number};
export type ChatPreview={previewId:string;token:string;expiresAt:string;accountName:string|null;recipientName:string;content:string;remaining:number};
export type ChatResult={outcome:string;reason?:string|null;attemptId?:string|null};
export const chatApi={
 capability:()=>api<{sendingAvailable:boolean;reason:string|null}>('/inbox/chat/capability'),
 conversations:(q:string)=>api<{items:Conversation[];total:number;page:number;pageSize:number}>('/inbox/chat/conversations?'+q),
 thread:(q:string)=>api<ChatThread>('/inbox/chat/messages?'+q),
 prepare:(input:{accountId:string;senderId:string;messageId:string;content:string})=>send<ChatPreview>('/inbox/chat/prepare','POST',input),
 confirm:(input:{previewId:string;token:string;requestKey:string})=>send<ChatResult>('/inbox/chat/confirm','POST',input),
 status:(id:string)=>api<ChatResult>('/inbox/chat/requests/'+encodeURIComponent(id)),
};
export const chatOutcome=(s:string)=>({CONFIRMED:'已发送',INTERRUPTED:'执行中断，待核查（勿重发）',UNKNOWN:'结果未知 · 请勿重发',FAILED:'未发送',RESERVED:'准备发送',ATTEMPTED:'发送中 · 等待确认',NOT_SUBMITTED:'尚未提交',RECEIVED:'已接收'} as Record<string,string>)[s]||'状态待确认';
