import {api} from '@/lib/api';
export class SettingsTimeout extends Error {constructor(){super('请求超时，保存结果尚未确认。请重新读取核对后再操作。');}}
/** Bounded configuration requests only. Never retries a mutation on timeout. */
export async function settingsDeadline<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new SettingsTimeout());controller.abort();},15000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
export const settingsApi=<T>(path:string,options:RequestInit={})=>settingsDeadline(signal=>api<T>(path,{...options,signal:options.signal?AbortSignal.any([signal,options.signal]):signal}));
export const settingsSend=<T>(path:string,method:string,body:unknown)=>settingsApi<T>(path,{method,body:JSON.stringify(body)});
