// Validation only: no active approval is embedded or created by this module.
export function validateRestrictionScope(value,now=Date.now()){
 const keys=['approvalId','accountId','senderId','candidateSha256','consent','expiresAt'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==keys.sort().join()||value.consent!=='inspect-saved-account-profile-read-only-once-v1'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.approvalId)||!/^[a-f0-9]{64}$/.test(value.candidateSha256)||!['senderId'].every(k=>/^[a-f0-9]{24}$/.test(value[k]))||!['accountId'].every(k=>typeof value[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value[k]))||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+30*60*1000)throw Error('INVALID_READ_ONLY_SCOPE');
 return {...value};
}
