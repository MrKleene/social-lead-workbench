export const approvedPreflight={candidateSha256:'8a9d03c41cf531650bcc4698e5ea2d51aac8eac96105d30214dff5d28cc45ab0',accountId:'cmvhp0fmy0004i48vmrpoblm4',senderId:'6334380e000000001802cc73',postId:'6addd4c300000000240360ba',targetCommentId:'6ade0456000000000200c3bf',recipientId:'6402e3720000000029012c58',reviewId:'cmvqggi9v008di4nxjqws62i4',consent:'inspect-exact-target-read-only-once-v1'};
export function validatePreflightScope(value,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...Object.keys(approvedPreflight),'expiresAt'].sort().join()||Object.entries(approvedPreflight).some(([k,v])=>value[k]!==v)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+30*60*1000)throw Error('INVALID_READ_ONLY_SCOPE');
 return {...approvedPreflight};
}
