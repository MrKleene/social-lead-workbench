// Validation only: no active approval is embedded or created by this module.
export function validateDMEntryScope(value,now=Date.now()){
 const recipient=Object.hasOwn(value??{},'recipientId');
 const keys=[...(recipient?['recipientId','reviewId','reviewVersion']:[]),'approvalId','accountId','senderId','candidateSha256','consent','expiresAt'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==keys.sort().join()||value.consent!==(recipient?'inspect-saved-comment-author-dm-entry-read-only-once-v1':'inspect-saved-account-dm-entry-read-only-once-v1')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.approvalId)||!/^[a-f0-9]{64}$/.test(value.candidateSha256)||!['senderId'].every(k=>/^[a-f0-9]{24}$/.test(value[k]))||!['accountId'].every(k=>typeof value[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value[k]))||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+30*60*1000)throw Error('INVALID_READ_ONLY_SCOPE');
 if(recipient&&(!/^[a-f0-9]{24}$/.test(value.recipientId)||value.recipientId===value.senderId||typeof value.reviewId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.reviewId)||!Number.isInteger(value.reviewVersion)||value.reviewVersion<0))throw Error('INVALID_RECIPIENT_SCOPE');
 return {...value};
}
