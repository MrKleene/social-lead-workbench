// Explicit backend-only environment handoff. Do not enumerate or inspect unrelated secrets.
'use strict';
const names=['QWEN_MATCH_ENABLED','QWEN_MATCH_CONSENT','QWEN_MATCH_DAILY_LIMIT','QWEN_WORKSPACE_ID'];
function qwenEnvironment(env){
 const out={};for(const key of names)if(env[key])out[key]=env[key];
 // Never even read the key until both authorization and a finite cost cap exist.
 if(out.QWEN_MATCH_ENABLED==='1'&&out.QWEN_MATCH_CONSENT==='beijing-redacted-comments-v1'&&/^(?:[1-9]|[1-9][0-9]|100)$/.test(out.QWEN_MATCH_DAILY_LIMIT||'')&&env.QWEN_API_KEY)out.QWEN_API_KEY=env.QWEN_API_KEY;
 return out;
}
module.exports={qwenEnvironment};
