type Reference={state:string;checkedRuntimeId:string|null;verifiedAt:Date|null;checkingUntil?:Date|null};
/** Historical evidence is never a grant to read. Every task checks the platform under its own lease. */
export function sessionHealth(ref:Reference|null|undefined,_runtimeId?:string,now=Date.now()){
 const waiting=!!ref?.checkingUntil&&ref.checkingUntil.getTime()>now;
 const state=ref?.state==='CHECKING'&&!waiting?'UNVERIFIED':ref?.state||'LOGIN_REQUIRED';
 const taskAllowed=!!ref&&['VERIFIED','UNVERIFIED','CONNECTION_ERROR'].includes(state)&&(!waiting||state==='VERIFIED');
 return {state,taskAllowed,checkable:!!ref&&!waiting&&['VERIFIED','UNVERIFIED','CONNECTION_ERROR','RATE_LIMITED'].includes(state),retryAt:waiting?ref!.checkingUntil:null,verifiedAt:ref?.verifiedAt??null};
}
