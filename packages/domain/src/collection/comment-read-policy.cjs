'use strict';
// Small atomic windows protect page responsiveness, not total coverage.
// Chunk mode expands large/generic reply controls and resumes until exhaustion;
// explicit memory/time ceilings must remain incomplete, never COMPLETE.
// Exception backstop only: one post's read deadline grows with the platform-declared
// comment count so a huge post cannot silently consume the whole run. Hitting it keeps
// what was read, marks the post partial, and the run continues with the next post.
// The round ceiling is sized from the same budgets; the hard cap only stops a
// pathological batch of huge posts one last time.
const postTimeBudget=Object.freeze({baseMs:60000,perCommentMs:1200,minMs:90000,maxMs:2400000,defaultMs:300000});
// Human pacing: a long continuous read gets one longer reading pause. Windows keep
// their own short spacing between actions.
const longReadPacing=Object.freeze({everyMs:600000,minMs:20000,maxMs:40000});
const roundTimeBudget=Object.freeze({overheadMs:300000,hardMaxMs:9000000,maxMsPerPost:2400000});
// Between two keyword searches the reader pauses like a person switching query.
const searchGap=Object.freeze({minMs:3000,maxMs:8000});
module.exports=Object.freeze({enabled:true,readWindow:Object.freeze({version:1,root_pages:3,reply_clicks:4,max_roots:40,max_comments:100,max_replies_per_root:30,timeout_ms:15000}),postTimeBudget,longReadPacing,roundTimeBudget,searchGap});
