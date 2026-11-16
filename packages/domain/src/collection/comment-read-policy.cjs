'use strict';
// Small atomic windows protect page responsiveness, not total coverage.
// Chunk mode expands large/generic reply controls and resumes until exhaustion;
// explicit memory/time ceilings must remain incomplete, never COMPLETE.
module.exports=Object.freeze({enabled:true,readWindow:Object.freeze({version:1,root_pages:3,reply_clicks:12,max_roots:40,max_comments:100,max_replies_per_root:30,timeout_ms:15000})});
