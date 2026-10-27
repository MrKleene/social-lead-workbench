import {XHS_REPLY_PROTOCOL} from './xhs-reply-protocol';

// Source review is compatibility evidence, never permission to start or send.
// Historical ee0901ef scopes/receipts remain in the ledger; that binary is not
// eligible for a new v2 scope. Never derive this list from env or tools/list.
export const singleReplyBuildHashes = Object.freeze(['70c02190c6936b50d77f0931dabbf853cae013422b76b2b77c599cdca6010215','dd91f1991cfa2041b9e6e63573813c9144e0017f1ef074e6b79f3aa44193237b'] as const);
export const singleReplyBuilds = Object.freeze({
 [singleReplyBuildHashes[0]]: Object.freeze({
  version:'v2.5.5-local-reply-binding-v1', protocol:XHS_REPLY_PROTOCOL,
  preflightProtocol:'workbench.xhs.exact-preflight.v2',
  confirmedResponseMapping:false, sourceRevision:'e9b41990bd1a03b3fc2c4e837668af9a8cdffac8',
  overlaySha256:'35b8b165a0424d037ab1488d8aa3f866a77a2f8d7518b9ece81644a82690b795',
 }),
 [singleReplyBuildHashes[1]]: Object.freeze({
  version:'v2.5.5-local-exact-preflight-v2', protocol:XHS_REPLY_PROTOCOL,
  preflightProtocol:'workbench.xhs.exact-preflight.v2',
  confirmedResponseMapping:false, sourceRevision:'5ae6e778c4b6a3250f3ae49cb0b6ed11d4290fbc',
  overlaySha256:'5cfc069a3fc7aba7a8a412ec51f1d78301acb8bf63368fa959ec23c8dd49885c',
 }),
});
export function reviewedSingleReplyBuild(hash:string){
 return Object.hasOwn(singleReplyBuilds,hash)?singleReplyBuilds[hash as typeof singleReplyBuildHashes[number]]:undefined;
}
export const singleReplyScopeVersion = 'workbench.single-reply-authorization.v2' as const;
export const singleReplyPurpose = 'SUBMIT_EXACT_COMMENT_ONCE' as const;
export type SingleReplyRuntimeScope = {scopeVersion:string;purpose:string;binarySha256:string;protocol:string};
export function compatibleSingleReplyScope(scope:SingleReplyRuntimeScope,installedHash:string){
 const build=reviewedSingleReplyBuild(scope.binarySha256);
 return scope.scopeVersion===singleReplyScopeVersion&&scope.purpose===singleReplyPurpose&&
  scope.binarySha256===installedHash&&!!build&&scope.protocol===build.protocol;
}
