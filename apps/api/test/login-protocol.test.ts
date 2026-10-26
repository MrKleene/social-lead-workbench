import { describe,it,expect } from 'vitest';
import { parseQr,parseStatus,demoImage } from '../src/accounts/login-runtime';
describe('reviewed login protocol, offline parsing only',()=>{
 it('accepts source-derived fields and bounds expiry',()=>{expect(parseQr({img:demoImage,timeout:'4m0s',is_logged_in:false})).toEqual({image:demoImage,seconds:240});});
 it.each(['https://example.invalid/qr','data:image/svg+xml;base64,AAAA','file:///tmp/old','data:image/png;base64,AAAA'])('refuses public/unsupported QR image %s',img=>{expect(()=>parseQr({img,timeout:'4m0s'})).toThrow('QR_FORMAT_UNSUPPORTED');});
 it.each(['0s','5m0s','invalid','-1s'])('refuses invalid expiry %s',timeout=>{expect(()=>parseQr({img:demoImage,timeout})).toThrow('INVALID_EXPIRY');});
 it('requires explicit boolean platform status, stable ID is separate',()=>{expect(()=>parseStatus({is_logged_in:'true'})).toThrow('INVALID_STATUS');expect(parseStatus({is_logged_in:true,username:'same nickname'})).toEqual({loggedIn:true,userId:undefined,nickname:'same nickname'});expect(parseStatus({is_logged_in:true,user_id:'abc123',username:'name'}).userId).toBe('abc123');});
 it('never treats QR endpoint logged-in flag as verified account identity',()=>{expect(()=>parseQr({is_logged_in:true})).toThrow('UNEXPECTED_EXISTING_LOGIN');});
});

import {boundAccountNickname} from '../src/accounts/account-display';
const account={loginNickname:' 合成昵称 ',loginPlatformUserId:'synthetic-id',loginProvider:'real',loginSessionKey:'saved-ref',sessionReference:{sessionKey:'saved-ref',provider:'real',state:'VERIFIED'}};
describe('saved identity nickname projection',()=>{
 it('uses the already bound nickname, including expired historical login',()=>{expect(boundAccountNickname(account)).toBe('合成昵称');expect(boundAccountNickname({...account,sessionReference:{...account.sessionReference,state:'EXPIRED'}})).toBe('合成昵称');});
 it('does not guess missing nicknames or trust an unbound identity',()=>{expect(boundAccountNickname({...account,loginNickname:null})).toBeNull();expect(boundAccountNickname({...account,loginNickname:'  '})).toBeNull();expect(boundAccountNickname({...account,loginPlatformUserId:null})).toBeNull();expect(boundAccountNickname({...account,sessionReference:null})).toBeNull();});
 it('hides names after changed session/provider or unresolved identity mismatch',()=>{for(const change of [{sessionKey:'different'},{provider:'offline'},{state:'NEEDS_REVIEW'}])expect(boundAccountNickname({...account,sessionReference:{...account.sessionReference,...change}})).toBeNull();});
});
