export const approvedPreflight={candidateSha256:'dd91f1991cfa2041b9e6e63573813c9144e0017f1ef074e6b79f3aa44193237b',accountId:'cmvhp0fmy0004i48vmrpoblm4',senderId:'6334380e000000001802cc73',postId:'6addd4c300000000240360ba',targetCommentId:'6ade0456000000000200c3bf',recipientId:'6402e3720000000029012c58',reviewId:'cmvqggi9v008di4nxjqws62i4',consent:'inspect-exact-target-read-only-once-v2'};
export function validatePreflightScope(value,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...Object.keys(approvedPreflight),'expiresAt'].sort().join()||Object.entries(approvedPreflight).some(([k,v])=>value[k]!==v)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+30*60*1000)throw Error('INVALID_READ_ONLY_SCOPE');
 return {...approvedPreflight};
}
