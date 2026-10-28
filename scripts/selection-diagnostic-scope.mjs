// Scope is supplied in a private, newly approved file. No real account, target,
// session token or consumed authorization is embedded in distributable source.
const required=['accountId','senderId','postId','targetCommentId','recipientId','reviewId','reviewVersion','consent','approvalId','candidateSha256','expiresAt'];
export function validateSelectionScope(value,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...required].sort().join()||value.consent!=='select-observe-exact-target-once-no-input-no-submit-v1'||!['accountId','reviewId'].every(k=>typeof value[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value[k]))||!['senderId','postId','targetCommentId','recipientId'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{24}$/.test(value[k]))||!Number.isSafeInteger(value.reviewVersion)||value.reviewVersion<1||typeof value.approvalId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.approvalId)||typeof value.candidateSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.candidateSha256)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+30*60*1000)throw Error('INVALID_SELECTION_SCOPE');
 return {...value};
}
