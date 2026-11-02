import {validateDMEntryScope} from './dm-entry-operator-scope.mjs';
export function validateDMConversationScope(value,now=Date.now()){
 if(!value||value.consent!=='open-saved-comment-author-chat-no-input-once-v1'||!value.recipientId)throw Error('EXPLICIT_CONVERSATION_SCOPE_REQUIRED');
 validateDMEntryScope({...value,consent:'inspect-saved-comment-author-dm-entry-read-only-once-v1'},now);return {...value};
}
