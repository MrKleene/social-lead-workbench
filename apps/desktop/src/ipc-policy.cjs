'use strict';
const {LocalError}=require('../../../runtime/local/database.cjs');
const methods=new Set(['status','initialize','configurations','saveConfiguration','archiveConfiguration','saveModelKey','jobs','accounts','messages','inboxPage','conversations','conversation','unread','markRead','runs','reviews','decideReview','backup','restore']);
function validateCall(event,window,method,input){
 let url;try{url=new URL(event.senderFrame?.url);}catch{throw new LocalError('UNTRUSTED_DESKTOP_CALL');}
 if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||url.protocol!=='workbench:'||url.hostname!=='app'||url.port||url.username||url.password)throw new LocalError('UNTRUSTED_DESKTOP_CALL');
 if(!methods.has(method)||input!==undefined&&(input===null||Object.getPrototypeOf(input)!==Object.prototype))throw new LocalError('INVALID_DESKTOP_CALL');
 if(Buffer.byteLength(JSON.stringify(input??{}))>65536)throw new LocalError('REQUEST_TOO_LARGE');
}
module.exports={validateCall};
