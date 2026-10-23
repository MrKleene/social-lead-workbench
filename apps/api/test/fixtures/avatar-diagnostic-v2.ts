import type {AvatarSourceDiagnostic} from '@crm/contracts';
// Entirely synthetic; candidate names are hypotheses, not real platform evidence.
export const avatarDiagnosticV2:Extract<AvatarSourceDiagnostic,{version:2}>={version:2,status:'OK',truncated:false,roots:1,replies:1,
 fields:[{group:'USER_INFO',shape:'OBJECT',count:2},{group:'FIXED_AVATAR',shape:'MISSING',count:2},{group:'IMAGE_NAMED_MEMBER',shape:'NONEMPTY_STRING',count:2}],
 conversion:[{state:'EMPTY_AFTER_DECODE',count:2}],
 transitions:[{role:'ROOT',state:'EMPTY_AFTER_DECODE',count:1},{role:'REPLY',state:'EMPTY_AFTER_DECODE',count:1}],filtered:[],
 candidates:[{name:'image',role:'ROOT',shape:'NONEMPTY_STRING',protocol:'HTTPS',host:'ALLOWED',components:'CLEAN',path:'AVATAR_PATH',count:1},{name:'images',role:'REPLY',shape:'NONEMPTY_STRING',protocol:'HTTP',host:'OTHER',components:'RESTRICTED',path:'OTHER',count:1}]};

// Synthetic optional URL facts; legacy v2 above remains unchanged.
export const avatarDiagnosticUrlReasons:Extract<AvatarSourceDiagnostic,{version:2}>={...avatarDiagnosticV2,candidates:avatarDiagnosticV2.candidates.map(c=>({...c,restrictions:{query:c.role==='REPLY',fragment:c.role==='REPLY',userinfo:false,port:false,encodedPath:false,encodedElsewhere:c.role==='REPLY'},queryForm:c.role==='REPLY'?'KEY_VALUE':'NONE'}))};
