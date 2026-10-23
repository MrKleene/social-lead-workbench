/** Archives currently retain the platform ID, never the MCP request token.
 * Build an official destination only; no requests, redirects or secret lookup. */
export function postSourceLink(platform:unknown,postId:unknown):string|undefined {
 if(platform!=='XHS'||typeof postId!=='string'||postId.length!==24||!/^[a-fA-F0-9]+$/.test(postId))return;
 return `https://www.xiaohongshu.com/explore/${postId}`;
}
