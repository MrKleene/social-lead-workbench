/** Only display a nickname saved with this account's bound identity. Never fetch a profile. */
export function boundAccountNickname(a:{loginNickname:string|null;loginPlatformUserId:string|null;loginProvider:string|null;loginSessionKey:string|null;sessionReference?:{sessionKey:string;provider:string;state:string}|null}){
 const ref=a.sessionReference;
 if(!a.loginPlatformUserId||!a.loginSessionKey||!ref||ref.sessionKey!==a.loginSessionKey||ref.provider!==a.loginProvider||ref.state==='NEEDS_REVIEW')return null;
 return a.loginNickname?.trim()||null;
}
