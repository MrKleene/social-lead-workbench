export const sessionTtlMs=5*60_000;
type Reference={state:string;checkedRuntimeId:string|null;verifiedAt:Date|null;checkingUntil?:Date|null};
export function sessionFresh(ref:Reference|null|undefined,runtimeId:string|undefined,now=Date.now()){
 return !!ref&&ref.state==='VERIFIED'&&!!runtimeId&&ref.checkedRuntimeId===runtimeId&&!!ref.verifiedAt&&ref.verifiedAt.getTime()<=now&&now-ref.verifiedAt.getTime()<sessionTtlMs;
}
export function sessionHealth(ref:Reference|null|undefined,runtimeId:string|undefined,now=Date.now()){
 const fresh=sessionFresh(ref,runtimeId,now),waiting=!!ref?.checkingUntil&&ref.checkingUntil.getTime()>now;
 const state=fresh?'VERIFIED':ref?.state==='VERIFIED'||ref?.state==='CHECKING'&&!waiting?'UNVERIFIED':ref?.state||'LOGIN_REQUIRED';
 return {state,fresh,checkable:!!ref&&!waiting&&['UNVERIFIED','CONNECTION_ERROR','RATE_LIMITED'].includes(state),retryAt:waiting?ref!.checkingUntil:null,freshUntil:fresh?new Date(ref!.verifiedAt!.getTime()+sessionTtlMs):null};
}
